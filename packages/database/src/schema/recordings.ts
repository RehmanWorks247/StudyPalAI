import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { studyPalSchema } from './namespace';

const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
export const recordings = studyPalSchema.table(
  'recordings',
  {
    ownerId: uuid('owner_id').notNull(),
    id: uuid('id').notNull(),
    setId: bigint('set_id', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    seconds: integer('seconds').notNull(),
    transcript: text('transcript').notNull(),
    mediaType: text('media_type').notNull(),
    size: integer('size').notNull(),
    audioHash: text('audio_hash').notNull(),
    revision: integer('revision').notNull(),
    nextPart: integer('next_part').notNull().default(0),
    complete: boolean('complete').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    index('recordings_set').on(t.ownerId, t.setId, t.id),
    check('recording_size', sql`${t.size} between 1 and 214958080`),
    check('recording_revision', sql`${t.revision} > 0`),
  ],
);
export const recordingParts = studyPalSchema.table(
  'recording_parts',
  {
    ownerId: uuid('owner_id').notNull(),
    recordingId: uuid('recording_id').notNull(),
    part: integer('part').notNull(),
    hash: text('hash').notNull(),
    data: bytes('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.recordingId, t.part] }),
    foreignKey({
      columns: [t.ownerId, t.recordingId],
      foreignColumns: [recordings.ownerId, recordings.id],
    }).onDelete('cascade'),
    check('recording_part_size', sql`octet_length(${t.data}) between 1 and 4194304`),
  ],
);
