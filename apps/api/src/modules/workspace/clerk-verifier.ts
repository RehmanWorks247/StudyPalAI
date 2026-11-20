import { createPublicKey, type JsonWebKey } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { API_CONFIG } from '../../config/configuration.module';
import type { ApiConfig } from '../../config/env';

export interface ClerkIdentity {
  issuer: string;
  subject: string;
  sid: string;
}
const maxJwtSeconds = 300;
// The pinned Clerk SDK also accepts JWT-template tokens in verifyToken(). Only
// its session-token category is appropriate for access to a user's workspace.
const sessionCategory = 'cl_B7d4PD111AAA';
interface SigningKeys {
  expires: number;
  keys: Map<string, string>;
}
function tokenHeader(token: string): { kid: string; alg: string } {
  try {
    const header: unknown = JSON.parse(
      Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'),
    );
    if (
      !header ||
      typeof header !== 'object' ||
      !('alg' in header) ||
      header.alg !== 'RS256' ||
      !('cat' in header) ||
      header.cat !== sessionCategory ||
      !('kid' in header) ||
      typeof header.kid !== 'string' ||
      !header.kid.length ||
      header.kid.length > 256
    )
      throw new Error();
    return { kid: header.kid, alg: header.alg };
  } catch {
    throw new UnauthorizedException();
  }
}

@Injectable()
export class ClerkVerifier {
  private cache: SigningKeys | undefined;
  private pending: Promise<SigningKeys> | undefined;
  private nextFetch = 0;
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  private async fetchKeys(issuer: string): Promise<SigningKeys> {
    const keys = new Map<string, string>();
    try {
      const response = await fetch(issuer + '/.well-known/jwks.json', {
        signal: AbortSignal.timeout(3500),
        redirect: 'error',
      });
      if (!response.ok || Number(response.headers.get('content-length')) > 65536) throw new Error();
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        size += step.value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(step.value);
      }
      const jwks: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !jwks ||
        typeof jwks !== 'object' ||
        !('keys' in jwks) ||
        !Array.isArray(jwks.keys) ||
        jwks.keys.length > 32
      )
        throw new Error();
      for (const key of jwks.keys as (JsonWebKey & { kid?: string })[]) {
        if (
          key?.kty !== 'RSA' ||
          !key.n ||
          !key.e ||
          typeof key.kid !== 'string' ||
          (key.use && key.use !== 'sig') ||
          (key.alg && key.alg !== 'RS256')
        )
          continue;
        keys.set(
          key.kid,
          createPublicKey({ key, format: 'jwk' })
            .export({ format: 'pem', type: 'spki' })
            .toString(),
        );
      }
      if (!keys.size) throw new Error();
      return { keys, expires: Date.now() + 300_000 };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
  private async key(issuer: string, kid: string) {
    if (this.config.CLERK_JWT_KEY) return this.config.CLERK_JWT_KEY;
    const now = Date.now();
    const known = this.cache?.keys.get(kid);
    if (known && this.cache && now < this.cache.expires) return known;
    if (!this.pending && now >= this.nextFetch) {
      this.nextFetch = now + 10_000;
      this.pending = this.fetchKeys(issuer)
        .then((keys) => (this.cache = keys))
        .finally(() => {
          this.pending = undefined;
        });
    }
    if (this.pending) await this.pending;
    if (!this.cache || Date.now() >= this.cache.expires) throw new ServiceUnavailableException();
    const key = this.cache.keys.get(kid);
    if (!key) throw new UnauthorizedException();
    return key;
  }
  async verify(token: string | undefined, origin?: string): Promise<ClerkIdentity> {
    const issuer = this.config.CLERK_ISSUER;
    if (!issuer) throw new ServiceUnavailableException();
    if (!token || token.length > 12000 || token.split('.').length !== 3)
      throw new UnauthorizedException();
    const { kid } = tokenHeader(token);
    const key = await this.key(issuer, kid);
    try {
      const claims = await verifyToken(token, {
        jwtKey: key,
        issuer,
        authorizedParties: this.config.CORS_ORIGINS,
        clockSkewInMs: 0,
      });
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.iss !== issuer ||
        typeof claims.sub !== 'string' ||
        !/^user_[a-zA-Z0-9_-]{1,200}$/.test(claims.sub) ||
        typeof claims.sid !== 'string' ||
        !/^sess_[a-zA-Z0-9_-]{1,200}$/.test(claims.sid) ||
        (origin !== undefined && claims.azp !== origin) ||
        typeof claims.azp !== 'string' ||
        !this.config.CORS_ORIGINS.includes(claims.azp) ||
        (claims.sts !== undefined && claims.sts !== 'active') ||
        !Number.isInteger(claims.iat) ||
        !Number.isInteger(claims.exp) ||
        claims.exp <= now ||
        claims.iat > now + 5 ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > maxJwtSeconds
      )
        throw new Error();
      return { issuer, subject: claims.sub, sid: claims.sid };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
