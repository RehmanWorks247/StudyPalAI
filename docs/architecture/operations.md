# Operations and security

## Local and CI

`pnpm dev` loads root `.env`; package code reads validated process configuration.
Production injects environment values through its secret manager. Never copy `.env`
into a container or expose secrets through `VITE_*`. Tests and OpenAPI export use
explicit isolated configuration. CI checks formatting, imports, types, behavior,
builds and generated-artifact drift, then migrates a fresh PostgreSQL service and
executes database integration tests. Integration results are never cached.

Do not set `NODE_ENV=development` in root `.env`: Vite reads that file during builds
and would include React's development runtime. The API defaults to development
locally; inject `NODE_ENV=production` into its deployed process.

The Compose PostgreSQL credentials and loopback binding are for local use only.
`pnpm db:down` preserves the named volume. Unit tests need no Docker; integration
tests require a dedicated development/test database and never reset it destructively.

## Runtime policies already present

- Fastify request IDs, JSON access logs, redaction, body and connection timeouts.
- Global validation, generic `application/problem+json` errors and security headers.
- Explicit CORS origins; no wildcard credentialed access. Trust proxy is off by
  default; configure exact trusted hop count only behind a controlled ingress.
- Per-process request rate limit, bounded database pool, query/statement deadlines,
  lazy connections and graceful close. No startup migration in API replicas.
- `/api/v1/health/live` reports process health; `/api/v1/health/ready` checks PostgreSQL.
  Readiness fails closed on database failure. Keep probes infrequent and account for
  probe traffic in the process rate limit.
- Swagger is opt-in for local development and rejected in production configuration.

HTTP timeouts do not automatically cancel future application/provider work. Each
new operation needs its own deadline and propagated abort signal. Add OpenTelemetry
and error reporting when a deployment target exists; measure request latency,
errors, saturation, pool wait times, job backlog and AI spend. Avoid high-cardinality
or sensitive metric labels. Define SLOs from the first production workload.

## Before the first user-facing release

The account installation runs on a Mac with Clerk authentication, issuer-bound owner identities, owner-scoped queries, CSRF validation and default-deny product endpoints. Sign-in and account reload require online verification. The separate single-Mac local mode uses explicit pairing and retains older offline workspaces. Optional cloud assessments have a durable PostgreSQL queue, cancellation, a pinned model and per-day spending limits. Before public deployment configure the production Clerk instance, verify account recovery, and exercise multi-user authorization. Run `pnpm test:e2e:clerk` only against a development Clerk instance. Native authentication should use OAuth/OIDC with PKCE.

Choose a deployment target; serve the web bundle through a CDN and API behind TLS
ingress. Configure CSP and cache headers on the web host, trusted proxy topology,
secrets rotation, least-privilege database credentials and verified database TLS.
Use a separate migration role and a single serialized release migration step.
Allocate `replica count × pool max` within the database connection budget; use a
managed pooler as needed. Use shared/edge rate enforcement for multiple replicas.

Build immutable artifacts, run as non-root, pin production container digests, and
test graceful draining and rollout/rollback. Deploy additive migrations before
dependent code and remove old fields only after old clients/replicas are retired.
Enable encrypted backups/PITR and test restores; define retention and deletion
policy for documents, transcripts and derived data. Run load and authorization
tests against realistic workloads before claiming capacity or isolation guarantees.

Cloud provisioning, deployment pipelines and production capacity claims are deferred
until the host, operational budget and feature workload are known.
