import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import { clerkIdentities, clerkBindings } from '@studypal/database/schema';
import { DatabaseService } from '../../platform/database/database.service';
import type { ClerkIdentity } from './clerk-verifier';

export const clerkBindingSeconds = 30 * 60;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bindingKey = (principal: ClerkIdentity) =>
  hash(JSON.stringify([principal.issuer, principal.sid, principal.subject]));
const equalSecret = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));

@Injectable()
export class ClerkBindings {
  constructor(private readonly database: DatabaseService) {}
  private async safely<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException();
    }
  }
  exchange(principal: ClerkIdentity, previous: string | undefined) {
    return this.safely(() =>
      this.database.client.db.transaction(async (tx) => {
        const { issuer, subject } = principal;
        const sessionKey = bindingKey(principal);
        const now = new Date(),
          expiresAt = new Date(Date.now() + clerkBindingSeconds * 1000);
        const create = await tx
          .insert(clerkIdentities)
          .values({ issuer, subject })
          .onConflictDoNothing()
          .returning({ ownerId: clerkIdentities.ownerId });
        let ownerId = create[0]?.ownerId;
        if (!ownerId) {
          const [owner] = await tx
            .select({ ownerId: clerkIdentities.ownerId })
            .from(clerkIdentities)
            .where(and(eq(clerkIdentities.issuer, issuer), eq(clerkIdentities.subject, subject)))
            .limit(1);
          ownerId = owner?.ownerId;
        }
        if (!ownerId) throw new ServiceUnavailableException();
        const token = randomBytes(32).toString('base64url'),
          csrfToken = randomBytes(32).toString('base64url');
        // Cleanup is independently bounded and never touches active sessions. A revoked
        // token cannot outlive its tombstone (JWTs are limited to five minutes).
        const expired = await tx
          .select({ key: clerkBindings.sessionKey })
          .from(clerkBindings)
          .where(lt(clerkBindings.expiresAt, new Date(now.getTime() - 86400_000)))
          .limit(32)
          .for('update', { skipLocked: true });
        if (expired.length)
          await tx.delete(clerkBindings).where(
            inArray(
              clerkBindings.sessionKey,
              expired.map((x) => x.key),
            ),
          );
        const inserted = await tx
          .insert(clerkBindings)
          .values({ sessionKey, ownerId, cookieHash: hash(token), csrfToken, expiresAt })
          .onConflictDoNothing()
          .returning({ id: clerkBindings.sessionKey });
        if (inserted.length)
          return { ownerId, token, csrfToken, expiresAt: expiresAt.toISOString() };
        const [row] = await tx
          .select({
            ownerId: clerkBindings.ownerId,
            cookieHash: clerkBindings.cookieHash,
            csrfToken: clerkBindings.csrfToken,
          })
          .from(clerkBindings)
          .where(eq(clerkBindings.sessionKey, sessionKey))
          .limit(1)
          .for('update');
        if (!row?.cookieHash || !row.csrfToken || row.ownerId !== ownerId)
          throw new UnauthorizedException();
        if (previous && equalSecret(hash(previous), row.cookieHash)) {
          await tx
            .update(clerkBindings)
            .set({ expiresAt })
            .where(eq(clerkBindings.sessionKey, sessionKey));
          return {
            ownerId,
            token: previous,
            csrfToken: row.csrfToken,
            expiresAt: expiresAt.toISOString(),
          };
        }
        await tx
          .update(clerkBindings)
          .set({ cookieHash: hash(token), csrfToken, expiresAt })
          .where(eq(clerkBindings.sessionKey, sessionKey));
        return { ownerId, token, csrfToken, expiresAt: expiresAt.toISOString() };
      }),
    );
  }
  session(principal: ClerkIdentity, token: string) {
    return this.safely(async () => {
      const [row] = await this.database.client.db
        .select({ ownerId: clerkBindings.ownerId, csrfToken: clerkBindings.csrfToken })
        .from(clerkBindings)
        .where(
          and(
            eq(clerkBindings.sessionKey, bindingKey(principal)),
            eq(clerkBindings.cookieHash, hash(token)),
            gt(clerkBindings.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row?.csrfToken) throw new UnauthorizedException();
      return { ownerId: row.ownerId, csrfToken: row.csrfToken };
    });
  }
  revoke(principal: ClerkIdentity, token: string) {
    return this.safely(async () => {
      const changed = await this.database.client.db
        .update(clerkBindings)
        .set({ cookieHash: null, csrfToken: null, expiresAt: new Date(Date.now() + 86400_000) })
        .where(
          and(
            eq(clerkBindings.sessionKey, bindingKey(principal)),
            eq(clerkBindings.cookieHash, hash(token)),
          ),
        )
        .returning({ id: clerkBindings.sessionKey });
      if (!changed.length) throw new UnauthorizedException();
    });
  }
}
