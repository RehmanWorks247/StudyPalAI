import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { studyPalSchema } from './namespace';

export const frontierJobs = studyPalSchema.table(
  'frontier_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    requestId: uuid('request_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
    }).notNull(),
    input: jsonb('input'),
    result: jsonb('result'),
    model: text('model').notNull(),
    chargedMicros: integer('charged_micros').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('frontier_owner_request').on(t.ownerId, t.requestId),
    index('frontier_status_created').on(t.status, t.createdAt),
    index('frontier_created').on(t.createdAt),
    check(
      'frontier_valid_status',
      sql`${t.status} IN ('queued','running','completed','failed','canceled')`,
    ),
    check('frontier_nonnegative_charge', sql`${t.chargedMicros} >= 0`),
  ],
);
