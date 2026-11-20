import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { frontierJobs as jobs } from '@studypal/database/schema';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { API_CONFIG } from '../../config/configuration.module';
import type { ApiConfig } from '../../config/env';
import { DatabaseService } from '../../platform/database/database.service';
import type { FrontierJobDto, FrontierRequestDto, FrontierResultDto } from './frontier.dto';
import {
  frontierModel,
  inputSchema,
  readResult,
  reserveCost,
  tokenCost,
} from './frontier-provider';

const fields = { id: jobs.requestId, status: jobs.status, result: jobs.result };
function toDto(row: Pick<typeof jobs.$inferSelect, 'id' | 'status' | 'result'>): FrontierJobDto {
  return row.status === 'completed'
    ? { id: row.id, status: row.status, result: readResult(row.result) }
    : { id: row.id, status: row.status };
}
@Injectable()
export class FrontierJobs {
  constructor(
    private readonly database: DatabaseService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  async enqueue(ownerId: string, request: FrontierRequestDto): Promise<FrontierJobDto> {
    if (!this.config.OPENAI_API_KEY) throw new ServiceUnavailableException();
    const { requestId, ...raw } = request;
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException();
    const input = parsed.data;
    const amount = reserveCost(input);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.database.client.db.transaction(async (tx) => {
      // Serialize reservations across replicas. No external work occurs under this lock.
      await tx.execute(sql`select pg_advisory_xact_lock(71002841)`);
      const [existing] = await tx
        .select({ ...fields, fingerprint: jobs.fingerprint })
        .from(jobs)
        .where(and(eq(jobs.ownerId, ownerId), eq(jobs.requestId, requestId)))
        .limit(1);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new ConflictException();
        return toDto(existing);
      }
      const [usage] = await tx
        .select({
          total: sql<number>`coalesce(sum(${jobs.chargedMicros}),0)::bigint`.mapWith(Number),
          owner:
            sql<number>`coalesce(sum(${jobs.chargedMicros}) filter (where ${jobs.ownerId}=${ownerId}),0)::bigint`.mapWith(
              Number,
            ),
          submitted: sql<number>`count(*) filter (where ${jobs.ownerId}=${ownerId})`.mapWith(
            Number,
          ),
          pending:
            sql<number>`count(*) filter (where ${jobs.ownerId}=${ownerId} and ${jobs.status} in ('queued','running'))`.mapWith(
              Number,
            ),
        })
        .from(jobs)
        .where(
          gte(jobs.createdAt, sql`date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'`),
        );
      if (
        !usage ||
        usage.total + amount > this.config.FRONTIER_DAILY_BUDGET_CENTS * 10000 ||
        usage.owner + amount > this.config.FRONTIER_USER_DAILY_BUDGET_CENTS * 10000 ||
        usage.pending >= 2 ||
        usage.submitted >= 300
      )
        throw new HttpException('Frontier quota reached', 429);
      const [row] = await tx
        .insert(jobs)
        .values({
          ownerId,
          requestId,
          fingerprint,
          input,
          status: 'queued',
          model: frontierModel,
          chargedMicros: amount,
        })
        .returning(fields);
      if (!row) throw new ServiceUnavailableException();
      return toDto(row);
    });
  }
  async get(ownerId: string, id: string) {
    const [row] = await this.database.client.db
      .select(fields)
      .from(jobs)
      .where(and(eq(jobs.ownerId, ownerId), eq(jobs.requestId, id)))
      .limit(1);
    if (!row) throw new NotFoundException();
    return toDto(row);
  }
  async cancel(ownerId: string, id: string) {
    const [row] = await this.database.client.db
      .update(jobs)
      .set({
        status: 'canceled',
        input: null,
        updatedAt: new Date(),
        chargedMicros: sql`case when ${jobs.status}='queued' then 0 else ${jobs.chargedMicros} end`,
      })
      .where(
        and(
          eq(jobs.ownerId, ownerId),
          eq(jobs.requestId, id),
          inArray(jobs.status, ['running', 'queued']),
        ),
      )
      .returning(fields);
    return row ? toDto(row) : this.get(ownerId, id);
  }
  async clean() {
    const owner = this.config.WORKSPACE_OWNER_ID;
    if (!owner) throw new ServiceUnavailableException();
    const owned = eq(jobs.ownerId, owner);
    const db = this.database.client.db;
    await db.delete(jobs).where(and(owned, lt(jobs.createdAt, sql`now()-interval '24 hours'`)));
    await db
      .update(jobs)
      .set({ status: 'failed', input: null, chargedMicros: 0, updatedAt: new Date() })
      .where(
        and(owned, eq(jobs.status, 'queued'), lt(jobs.createdAt, sql`now()-interval '3 minutes'`)),
      );
    // A crashed worker may have sent a paid request. Never re-dispatch it or refund unknown charges.
    await db
      .update(jobs)
      .set({ status: 'failed', input: null, updatedAt: new Date() })
      .where(
        and(owned, eq(jobs.status, 'running'), lt(jobs.updatedAt, sql`now()-interval '2 minutes'`)),
      );
  }
  async claim() {
    const owner = this.config.WORKSPACE_OWNER_ID;
    if (!owner) throw new ServiceUnavailableException();
    return this.database.client.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: jobs.id, input: jobs.input })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerId, owner),
            eq(jobs.status, 'queued'),
            eq(jobs.model, frontierModel),
            gte(jobs.createdAt, sql`now()-interval '3 minutes'`),
          ),
        )
        .orderBy(asc(jobs.createdAt), asc(jobs.id))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return;
      await tx
        .update(jobs)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(jobs.id, row.id));
      return row;
    });
  }
  async active(id: string) {
    return (
      (
        await this.database.client.db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
          .limit(1)
      ).length > 0
    );
  }
  async finish(
    id: string,
    completion?: { result: FrontierResultDto; inputTokens: number; outputTokens: number },
  ) {
    const usage = completion
      ? {
          result: completion.result,
          inputTokens: completion.inputTokens,
          outputTokens: completion.outputTokens,
          chargedMicros: tokenCost(completion.inputTokens, completion.outputTokens),
        }
      : {};
    await this.database.client.db
      .update(jobs)
      .set({
        ...usage,
        status: completion ? 'completed' : 'failed',
        input: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, 'running')));
  }
}
