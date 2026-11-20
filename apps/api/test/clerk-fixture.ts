import { generateKeyPairSync, sign } from 'node:crypto';
export const testIssuer = 'https://test.clerk.accounts.dev';
export const testOrigin = 'http://localhost:5173';
export function signingFixture(kid = 'local-test-key') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  function token(overrides: Record<string, unknown> = {}, headers: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const encode = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
    const content =
      encode({ alg: 'RS256', typ: 'JWT', cat: 'cl_B7d4PD111AAA', kid, ...headers }) +
      '.' +
      encode({
        iss: testIssuer,
        sub: 'user_sample',
        sid: 'sess_sample',
        azp: testOrigin,
        iat: now - 1,
        nbf: now - 1,
        exp: now + 59,
        v: 2,
        sts: 'active',
        ...overrides,
      });
    return (
      content + '.' + sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')
    );
  }
  return { publicPem, jwk, token };
}
