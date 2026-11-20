# Database infrastructure

`@studypal/database` owns the PostgreSQL connection lifecycle, Drizzle schema definitions, and reviewed SQL migrations. It is server-only. Domain repositories live inside the owning API module and use this package; browser code must never import it. The baseline creates the `studypal` PostgreSQL schema. The next migration adds versioned, owner-scoped local workspace snapshots and durable optional frontier jobs. Drizzle maintains its migration journal in a separate `drizzle` schema.

Create one `createDatabase()` instance per server process. Connections open on first query, so compiling the API and exporting OpenAPI never requires a running database. `ping()` runs `SELECT 1`; it does not apply migrations. Call `close()` during graceful shutdown. Inject `onError` to send idle-pool errors to the application's structured logger.

Defaults cap the pool at 10 connections, connection acquisition at 2 seconds, server execution at 5 seconds, and client query waiting at 6 seconds. A server statement timeout actually cancels SQL; a client timeout alone is not cancellation. Size pools across **all replicas**, leaving capacity for migrations, operators, and future workers. Keep transactions short and perform remote AI/object-storage calls outside them.

Use `sslmode=verify-full` in hosted connection URLs and the provider's CA configuration when needed. Unverified TLS modes are rejected. Plain local development connections may omit `sslmode` or use `sslmode=disable`. Require TLS at the deployment boundary, keep secrets outside Git, and use a separate restricted runtime role from the migration role.

## Migrations

From the repository root, load the root `.env` through the root scripts:

```sh
pnpm db:generate
pnpm db:migrate
pnpm --filter @studypal/database db:check
pnpm test:integration
```

Add tables to `src/schema/<domain>.ts` and export them from `src/schema/index.ts`; use `studyPalSchema.table(...)`. Run generation, review and commit the SQL **and** Drizzle metadata together. Never modify an applied migration, use schema `push` against shared databases, or migrate automatically on API startup. The standalone migration runner takes a PostgreSQL advisory lock on the same session that executes the migrations, preventing overlapping deployments from applying the same history. It exits if another runner holds the lock. Deployments should run it once before scaling API replicas. Apply expand/backfill/contract migrations for changes that must preserve compatibility across releases.

`test:integration` requires a dedicated PostgreSQL database. It applies the schema baseline idempotently, verifies connectivity and server-side statement cancellation, and leaves the database intact. It never drops a schema or table.

## Schema and query conventions

- Use opaque UUID identifiers, `timestamptz` for instants, UTC API timestamps, explicit `NOT NULL`, foreign keys, and constraints that enforce actual invariants. Application code updates `updated_at` explicitly.
- Add tenant/owner keys once identity and membership rules are defined. Scope every user-owned read and write in the repository, derive identity from verified authentication, and test cross-user isolation. An identifier alone is never authorization.
- Give each domain ownership of its tables. Other modules call the owner's exported application service; they do not query its tables directly. Keep Drizzle rows behind the server boundary and map them to explicit API DTOs.
- Design indexes from query shapes: equality owner/course predicates first, then range/sort fields. A typical feed uses `(owner_id, created_at DESC, id DESC)` and cursor pagination. Index foreign keys used for joins/deletion. Validate expensive queries with `EXPLAIN (ANALYZE, BUFFERS)` on representative data.
- Select only required columns, bound result limits, avoid N+1 queries, and use transactions only when multiple writes must be atomic. Keep files in object storage; PostgreSQL stores ownership, keys, checksums, sizes, and processing state.
- Add `pgvector`, embedding dimensions/model versions, background job/outbox tables, partitions, or replicas when a concrete feature and measured workload justify them. No speculative tables, extensions, generic repositories, or read replicas belong in this foundation.

Reference: [node-postgres pooling](https://node-postgres.com/apis/pool), [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations).
