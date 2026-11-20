import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { recordings, recordingParts } from '@studypal/database/schema';
import { DatabaseService } from '../../platform/database/database.service';
import { partBytes, type RecordingDto, type RecordingInputDto } from './recording.dto';

const columns = {
  id: recordings.id,
  setId: recordings.setId,
  title: recordings.title,
  capturedAt: recordings.capturedAt,
  seconds: recordings.seconds,
  transcript: recordings.transcript,
  mediaType: recordings.mediaType,
  size: recordings.size,
  audioHash: recordings.audioHash,
  revision: recordings.revision,
  nextPart: recordings.nextPart,
  complete: recordings.complete,
};
type RecordRow = Omit<RecordingDto, 'createdAt'> & { capturedAt: Date };
const asDto = ({ capturedAt, ...row }: RecordRow): RecordingDto => ({
  ...row,
  createdAt: capturedAt.toISOString(),
});
const sha = (buffer: Buffer | string) => createHash('sha256').update(buffer).digest('hex');
const key = (owner: string, id: string) =>
  and(eq(recordings.ownerId, owner), eq(recordings.id, id));
const partsKey = (owner: string, id: string) =>
  and(eq(recordingParts.ownerId, owner), eq(recordingParts.recordingId, id));

@Injectable()
export class RecordingRepository {
  constructor(private readonly database: DatabaseService) {}
  private async safely<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException();
    }
  }
  list(owner: string, setId: number) {
    return this.safely(
      async () =>
        await this.database.client.db
          .select({
            id: recordings.id,
            title: recordings.title,
            seconds: recordings.seconds,
            size: recordings.size,
            revision: recordings.revision,
            complete: recordings.complete,
          })
          .from(recordings)
          .where(and(eq(recordings.ownerId, owner), eq(recordings.setId, setId)))
          .orderBy(asc(recordings.id))
          .limit(100),
    );
  }
  get(owner: string, id: string) {
    return this.safely(async () => {
      const [row] = await this.database.client.db
        .select(columns)
        .from(recordings)
        .where(key(owner, id))
        .limit(1);
      if (!row) throw new NotFoundException();
      return asDto(row);
    });
  }
  begin(owner: string, id: string, input: RecordingInputDto) {
    return this.safely(() =>
      this.database.client.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${owner}, 312911))`);
        const [existing] = await tx
          .select(columns)
          .from(recordings)
          .where(key(owner, id))
          .limit(1)
          .for('update');
        const capturedAt = new Date(input.createdAt);
        if (existing) {
          if (
            existing.audioHash !== input.audioHash ||
            existing.size !== input.size ||
            existing.mediaType !== input.mediaType ||
            existing.setId !== input.setId ||
            existing.capturedAt.getTime() !== capturedAt.getTime() ||
            existing.seconds !== input.seconds
          )
            throw new ConflictException();
          if (existing.title === input.title && existing.transcript === input.transcript)
            return asDto(existing);
          if (existing.revision !== input.revision || !existing.complete)
            throw new ConflictException();
          const [updated] = await tx
            .update(recordings)
            .set({ title: input.title, transcript: input.transcript, revision: input.revision + 1 })
            .where(key(owner, id))
            .returning(columns);
          if (!updated) throw new ConflictException();
          return asDto(updated);
        }
        if (input.revision !== 0) throw new ConflictException();
        const [usage] = await tx
          .select({
            bytes: sql<number>`coalesce(sum(${recordings.size}),0)`.mapWith(Number),
            count: sql<number>`count(*)`.mapWith(Number),
            setCount:
              sql<number>`count(*) filter (where ${recordings.setId}=${input.setId})`.mapWith(
                Number,
              ),
          })
          .from(recordings)
          .where(eq(recordings.ownerId, owner));
        if (
          !usage ||
          usage.count >= 1000 ||
          usage.setCount >= 100 ||
          usage.bytes + input.size > 1024 ** 3
        )
          throw new PayloadTooLargeException();
        const [row] = await tx
          .insert(recordings)
          .values({
            ownerId: owner,
            id,
            setId: input.setId,
            title: input.title,
            capturedAt,
            seconds: input.seconds,
            transcript: input.transcript,
            mediaType: input.mediaType,
            size: input.size,
            audioHash: input.audioHash,
            revision: 1,
          })
          .returning(columns);
        if (!row) throw new ServiceUnavailableException();
        return asDto(row);
      }),
    );
  }
  savePart(owner: string, id: string, part: number, encoded: string) {
    const data = Buffer.from(encoded, 'base64');
    if (!data.length || data.length > partBytes || data.toString('base64') !== encoded)
      throw new BadRequestException();
    const hash = sha(data);
    return this.safely(() =>
      this.database.client.db.transaction(async (tx) => {
        const [row] = await tx
          .select(columns)
          .from(recordings)
          .where(key(owner, id))
          .limit(1)
          .for('update');
        if (!row) throw new NotFoundException();
        const total = Math.ceil(row.size / partBytes);
        if (
          part < 0 ||
          part >= total ||
          data.length !== Math.min(partBytes, row.size - part * partBytes)
        )
          throw new BadRequestException();
        if (part < row.nextPart) {
          const [previous] = await tx
            .select({ hash: recordingParts.hash })
            .from(recordingParts)
            .where(and(partsKey(owner, id), eq(recordingParts.part, part)))
            .limit(1);
          if (previous?.hash !== hash) throw new ConflictException();
          return asDto(row);
        }
        if (part !== row.nextPart) throw new ConflictException();
        await tx
          .insert(recordingParts)
          .values({ ownerId: owner, recordingId: id, part, hash, data });
        const complete = part + 1 === total;
        if (complete) {
          const hashes = await tx
            .select({ hash: recordingParts.hash })
            .from(recordingParts)
            .where(partsKey(owner, id))
            .orderBy(asc(recordingParts.part))
            .limit(52);
          if (hashes.length !== total || sha(hashes.map((x) => x.hash).join('')) !== row.audioHash)
            throw new ConflictException();
        }
        const [updated] = await tx
          .update(recordings)
          .set({ nextPart: part + 1, complete })
          .where(key(owner, id))
          .returning(columns);
        if (!updated) throw new ConflictException();
        return asDto(updated);
      }),
    );
  }
  readPart(owner: string, id: string, part: number) {
    return this.safely(async () => {
      const [row] = await this.database.client.db
        .select({ data: recordingParts.data })
        .from(recordingParts)
        .innerJoin(
          recordings,
          and(
            eq(recordings.ownerId, recordingParts.ownerId),
            eq(recordings.id, recordingParts.recordingId),
          ),
        )
        .where(
          and(partsKey(owner, id), eq(recordingParts.part, part), eq(recordings.complete, true)),
        )
        .limit(1);
      if (!row) throw new NotFoundException();
      return { data: row.data.toString('base64') };
    });
  }
  remove(owner: string, id: string, revision: number) {
    return this.safely(async () => {
      const deleted = await this.database.client.db
        .delete(recordings)
        .where(and(key(owner, id), eq(recordings.revision, revision)))
        .returning({ id: recordings.id });
      if (!deleted.length) throw new ConflictException();
    });
  }
}
