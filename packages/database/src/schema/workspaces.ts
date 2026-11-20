import { sql } from 'drizzle-orm';
import { check, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { studyPalSchema } from './namespace';

export const workspaces = studyPalSchema.table(
  'workspaces',
  {
    ownerId: uuid('owner_id').primaryKey(),
    revision: integer('revision').notNull(),
    content: text('content').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('workspace_revision_positive', sql`${table.revision} > 0`),
    check('workspace_content_size', sql`octet_length(${table.content}) <= 8388608`),
  ],
);
