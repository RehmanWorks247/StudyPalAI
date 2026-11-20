# Data and AI extension plan

The localhost release stores versioned study workspaces in PostgreSQL, optional audio backups in size-bounded chunks, and owner-scoped durable jobs for optional frontier assessments. IndexedDB holds each browser’s offline copy. Workspace updates use optimistic revisions to detect independent changes. The following tables describe future options for a hosted multi-user product.

## Proposed ownership and indexes

| Domain             | Tables introduced with the feature       | Constraints and primary access paths                                                                                                                  |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | users, external identities               | UUID keys; unique `(issuer, subject)`; normalized email only when policy requires uniqueness                                                          |
| Study organization | spaces, memberships                      | Explicit owner; unique `(space_id, user_id)`; membership index starting with user_id                                                                  |
| Materials          | documents, document_versions             | Owner/space FK; `(space_id, created_at DESC, id DESC)`; unique version per document; storage key, content hash, MIME, byte size and processing status |
| Retrieval          | chunks, embeddings                       | `(document_version_id, chunk_index)` unique; source page/time offsets; embedding model/version/dimensions explicit; tenant filter on retrieval        |
| Lectures           | recordings, transcript_segments          | Object storage reference; `(recording_id, start_ms, id)` for ordered range fetches                                                                    |
| Practice           | decks, cards, reviews, quizzes, attempts | `(user_id, due_at, id)` for due cards; unique submission/idempotency scope; append-only review facts when history is needed                           |
| Tutoring           | conversations, messages                  | `(conversation_id, created_at, id)` for cursor pagination; participant authorization on each request                                                  |
| Processing         | jobs, job_attempts, usage_ledger         | Unique `(owner_id, idempotency_key)` where needed; runnable-job index; durable retry state and billing/provider usage identifiers                     |

Use `timestamptz`, explicit not-null constraints, foreign keys and appropriate
checks. Choose UUID IDs initially; opaque IDs are not authorization. Use integer
counts/durations and exact numeric units for money/credits. Keep fields used in
filters/joins as columns; JSONB suits provider metadata with a defined schema, not
the entire business model. Avoid soft deletion until restore and retention semantics
are specified. Deletion must account for blobs, derived embeddings, backups and logs.

For shared spaces, scope rows and repository queries by space and validate membership.
Use composite foreign keys to prevent cross-owner/space references where simple
foreign keys cannot enforce them. RLS is optional defense in depth only when tenant
context can be reliably set and reset on pooled transactions; it does not replace
application authorization. Do not introduce a partial RLS policy and call it isolation.

Add indexes for actual predicates and ordering, including referencing foreign keys
where relevant. Use keyset pagination, bounded page sizes and explicit projections.
Avoid unnecessary counts and N+1 queries. Inspect `EXPLAIN (ANALYZE, BUFFERS)` with
representative data before optimization. Do not partition, shard or add read replicas
until measurements justify them.

## Durable document and AI work

1. Authorize and reserve quota, then issue a short-lived upload URL to object storage.
2. Validate the uploaded size, media type and content; quarantine/scan untrusted
   documents before parsing. Never fetch an arbitrary user URL from privileged networks.
3. Persist document state and a durable job in the same transaction. An outbox or
   database-backed queue avoids losing work between persistence and publication.
4. A separate worker process introduced with the first long-running feature claims
   jobs, records attempts, heartbeats and progress, and enforces concurrency/deadlines.
   Start with PostgreSQL leasing/`SKIP LOCKED` or a proven PostgreSQL queue; add Redis
   only if a chosen workload needs it. The API and worker can share domain modules
   after measured extraction into a server-only package.
5. Parse/transcribe, normalize, chunk and embed with deterministic versioned inputs.
   Retried attempts must not duplicate chunks, charges or downstream actions.
6. Expose job state through authorized REST resources; stream progress later if needed.

Store large documents/audio in object storage, searchable metadata and job state in
PostgreSQL. Introduce pgvector only with retrieval: choose dimensions and indexes
from the model, dataset size and recall/latency measurements. Combine lexical and
vector retrieval only when evaluation supports it. Always scope retrieval before
ranking; preserve source citations and deletion provenance.

AI providers implement narrow ports in the owning module. Bound input/output tokens,
provider concurrency, cost and per-user quotas; propagate cancellation and retry
only safe transient failures. Track model/prompt versions and safe usage metrics.
Treat uploaded text and model output as untrusted data, isolate tool permissions,
validate structured output, and never execute model-produced commands. Add an
evaluation set for retrieval and tutoring quality before launch. No live provider
credentials or AI implementation is needed for this foundation.
