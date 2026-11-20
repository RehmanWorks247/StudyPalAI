import { index, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { studyPalSchema } from './namespace';

export const clerkIdentities = studyPalSchema.table(
  'clerk_identities',
  {
    ownerId: uuid('owner_id').defaultRandom().notNull().unique(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
  },
  (t) => [primaryKey({ columns: [t.issuer, t.subject] })],
);
export const clerkBindings = studyPalSchema.table(
  'clerk_bindings',
  {
    sessionKey: text('session_key').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => clerkIdentities.ownerId),
    cookieHash: text('cookie_hash'),
    csrfToken: text('csrf_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('clerk_binding_expiry').on(t.expiresAt)],
);
