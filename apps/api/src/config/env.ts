import { createPublicKey } from 'node:crypto';
import { z } from 'zod';

const origin = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    !url.hostname.includes('*') &&
    url.origin === value
  );
}, 'Must be an exact HTTP(S) origin without a trailing slash');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      ),
    WORKSPACE_AUTH_MODE: z.enum(['clerk', 'local']).default('clerk'),
    CLERK_ISSUER: origin
      .refine((value) => value.startsWith('https://'), 'Clerk issuer must use HTTPS')
      .optional(),
    CLERK_JWT_KEY: z
      .string()
      .min(1)
      .max(16384)
      .transform((value) => value.replace(/\\n/g, '\n').trim())
      .refine((value) => {
        if (!value.startsWith('-----BEGIN PUBLIC KEY-----')) return false;
        try {
          const key = createPublicKey(value);
          return (
            key.asymmetricKeyType === 'rsa' &&
            (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048
          );
        } catch {
          return false;
        }
      })
      .optional(),
    WORKSPACE_PAIRING_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    WORKSPACE_OWNER_ID: z.uuid().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(origin).min(1)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    ENABLE_API_DOCS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(100),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    FRONTIER_DAILY_BUDGET_CENTS: z.coerce.number().int().min(0).max(100_000).default(100),
    FRONTIER_USER_DAILY_BUDGET_CENTS: z.coerce.number().int().min(0).max(10_000).default(25),
    API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  })
  .superRefine((value, context) => {
    if (
      value.WORKSPACE_AUTH_MODE === 'local' &&
      Boolean(value.WORKSPACE_PAIRING_KEY) !== Boolean(value.WORKSPACE_OWNER_ID)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WORKSPACE_PAIRING_KEY', 'WORKSPACE_OWNER_ID'],
        message: 'Configure both pairing fields together',
      });
    }
    if (value.WORKSPACE_AUTH_MODE === 'local' && value.WORKSPACE_PAIRING_KEY) {
      const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
      const localOnly =
        localHosts.includes(value.API_HOST) &&
        value.API_TRUST_PROXY_HOPS === 0 &&
        URL.canParse(value.DATABASE_URL) &&
        localHosts.includes(new URL(value.DATABASE_URL).hostname) &&
        !['host', 'hostaddr', 'service', 'port'].some((key) =>
          new URL(value.DATABASE_URL).searchParams.has(key),
        ) &&
        value.CORS_ORIGINS.every(
          (url) => URL.canParse(url) && localHosts.includes(new URL(url).hostname),
        );
      if (!localOnly)
        context.addIssue({
          code: 'custom',
          path: ['WORKSPACE_PAIRING_KEY'],
          message:
            'Local pairing requires loopback API, database and browser origins without a trusted proxy',
        });
    }
    if (value.NODE_ENV === 'production') {
      if (value.WORKSPACE_AUTH_MODE !== 'clerk') {
        context.addIssue({
          code: 'custom',
          path: ['WORKSPACE_AUTH_MODE'],
          message: 'Production requires Clerk authentication',
        });
      }
      if (!value.CLERK_ISSUER) {
        context.addIssue({
          code: 'custom',
          path: ['CLERK_ISSUER'],
          message: 'Production requires an exact Clerk issuer',
        });
      }
      if (!value.CORS_ORIGINS.every((allowed) => allowed.startsWith('https://'))) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Production allows only exact HTTPS browser origins',
        });
      }
    }
    if (value.NODE_ENV === 'production' && value.ENABLE_API_DOCS) {
      context.addIssue({
        code: 'custom',
        path: ['ENABLE_API_DOCS'],
        message: 'Documentation must be disabled in production',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      URL.canParse(value.DATABASE_URL) &&
      new URL(value.DATABASE_URL).searchParams.get('sslmode') !== 'verify-full'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Production database connections require verified TLS',
      });
    }
  });

export type ApiConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Report field names, never environment values or credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
