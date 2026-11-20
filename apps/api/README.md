# StudyPal API

StudyPal uses a NestJS and Fastify API with a local PostgreSQL database. Apply migrations before serving user data. The API checks PostgreSQL connectivity at `GET /api/v1/health/ready` and process liveness at `GET /api/v1/health/live`.

## Clerk account authentication

On macOS, copy the application's publishable key and run `pbpaste | node scripts/configure-clerk.mjs` from the repository root. Rebuild the web application and restart the API. A dedicated live browser check for the configured development instance is available with `pnpm test:e2e:clerk` against the running app on port 4173.

Clerk is the default workspace authentication mode. Set `CLERK_ISSUER` to the exact HTTPS Frontend API origin for your Clerk instance, and configure `CORS_ORIGINS` with the exact browser origins that can use the app. The API fetches public signing keys only from that issuer's `/.well-known/jwks.json` endpoint, with a deadline, bounded responses, a five-minute in-memory cache, and refresh on key rotation. Operators can set `CLERK_JWT_KEY` to the corresponding RSA public PEM for networkless verification, then rotate it when the instance changes keys. The server needs no Clerk secret key. In development, omitting the issuer leaves the protected API unavailable with HTTP 503 and allows health checks. Production validates configuration before opening its listener. It requires Clerk mode, an HTTPS issuer, exact HTTPS browser origins and verified PostgreSQL TLS. Authorities containing wildcard hostnames, paths and trailing slashes are rejected.

The browser exchanges its current Clerk session JWT using `POST /api/v1/workspace/sign-in`, an Authorization bearer header, and an exact permitted Origin. The API verifies the RS256 signature, issuer, authorized party, session token category, user/session identity, timestamps, and active session status. It returns a stable owner UUID and CSRF token, and writes a host-only, HttpOnly, Secure, SameSite=Strict cookie with a renewable 30-minute lifetime. A fresh verified Clerk token matching the same issuer, user and session is required on _every_ subsequent protected request, in the Authorization header or the same-origin `__session` cookie. Every mutation also requires an allowed Origin and `X-StudyPal-CSRF`. Repeat sign-in to renew an expired binding. A newly signed-in account receives its own PostgreSQL identity; shared email addresses and preexisting local workspaces play no part in the mapping.

Before clearing the Clerk client session, the browser calls `POST /api/v1/workspace/sign-out` with the active cookie, current bearer token, Origin and CSRF token. It revokes the local binding, blocks replay of the signed-out session, and expires the cookie. Out-of-band Clerk sign-outs rely on the provider's short JWT lifetime; the API accepts tokens lasting at most five minutes. Sessions survive API restarts in PostgreSQL. A new session for the same Clerk user restores the same workspace. See [Clerk token verification](https://clerk.com/docs/reference/backend/verify-token) and [session token claims](https://clerk.com/docs/guides/sessions/session-tokens).

## Explicit local workspace pairing

1. Set both `WORKSPACE_AUTH_MODE=local` and `VITE_WORKSPACE_AUTH_MODE=local` explicitly to use a single installation owner. In the repository root, create a private `.env` from `.env.example`, configure your loopback PostgreSQL URL and start the database.
2. Run `pnpm db:migrate`, then `node scripts/pair-workspace.mjs`. Setup generates one random installation owner UUID and one pairing key, preserves them on later runs, permissions the file to its owner, and adds the local web origins. Back up the UUID and key with the database. The UUID identifies the owner of the data.
3. Start or restart `pnpm dev` so the API receives the new private configuration. Open the dashboard at its loopback URL. On macOS, `node scripts/pair-workspace.mjs --copy` copies the key for the pairing dialog. Elsewhere, copy the value of `WORKSPACE_PAIRING_KEY` from the private file. Keep the key in server configuration only.
4. Pair the browser through the dashboard. Pairing creates an eight-hour HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1`. Pair again when the API restarts, after the cookie expires, or if an older session is evicted after 32 concurrent pairings. To revoke every session, rotate the 32-byte base64url key and restart the API while preserving the owner UUID.

The local pairing mode accepts loopback API and PostgreSQL hosts, explicitly allowlisted loopback browser origins, and direct loopback connections. It rejects public listeners, trusted proxies and remote hosts during configuration. The workspace guard protects all product endpoints by default. Only the two health routes are public. Clients send the session cookie on reads and include an exact allowed Origin and `X-StudyPal-CSRF` header on writes. The secret pairing key is accepted only by the pairing route. These pairing credentials belong to one installation owner. Returning customers in Clerk mode are resolved through verified issuer and subject. Switching modes leaves the original workspace intact.

| Route under `/api/v1`    | Purpose                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `POST /workspace/pair`   | Exchange a local bearer pairing key for a session cookie and CSRF token                    |
| `GET /workspace/session` | Read the CSRF token for a valid session                                                    |
| `GET /workspace`         | Read the owner's snapshot and revision. A new owner starts at revision zero                |
| `PUT /workspace`         | Save a serialized JSON object using the previous revision. A conflicting write returns 409 |

The snapshot limit is 8 MiB of UTF-8 content with a 16 MiB request envelope. Other routes retain a 1 MiB body limit. The browser keeps the workspace and microphone audio in IndexedDB. Lecture Studio can back up and restore recordings separately through the authenticated API. The local pairing mode discards its sessions on restart. Application logs exclude pairing keys, tokens, document text, query parameters and request bodies.

## Recording backups

Choose **Back up recording** in Lecture Studio after saving the audio or editing its notes. This uploads audio and metadata to the current owner in PostgreSQL. A recording can be up to 205 MiB, each set holds up to 100 backups, and the installation reserves up to 1 GiB across 1,000 recordings. Audio transfers in individually verified 4 MiB parts. Running the same backup again resumes at the first missing part. Concurrent edits check the metadata revision. Completed audio is immutable.

**Restore recordings** lists the current study set's complete and interrupted transfers. Restore a missing recording to this browser to play or download it offline. The browser verifies the ordered SHA-256 digests before making the recording available. **Remove backup** asks for confirmation before deleting the selected PostgreSQL copy. **Remove recording** deletes the browser copy. An interrupted backup reserves capacity until resumed or explicitly removed.

The recording API exposes a bounded metadata list scoped by set and owner, individual metadata and audio part reads and writes, and version-checked deletion. The largest part request envelope is 6 MiB including base64 encoding. Check the generated OpenAPI for route paths, request limits and response types.

## Operations and verification

The default API listener is `127.0.0.1:3001`. Root development scripts load `.env` and Vite proxies `/api` to the configured port. The API validates environment variables at startup. Liveness and OpenAPI generation need no database connection. Readiness checks connectivity. Release operators apply and review migrations separately.

Fastify applies security headers, exact credentialed CORS, a 15-second request receipt timeout, and a per-process IP limit of 100 requests per minute by default. PostgreSQL has bounded pool acquisition, statement and query timeouts. Production configuration requires verified database TLS. Use a private trusted CA and separate migration and application identities. Server-generated request IDs appear in problem responses, logs and the `x-request-id` header.

`ENABLE_API_DOCS=true` enables `/api/docs` and `/api/docs-json` outside production. `pnpm api:generate` refreshes the versioned OpenAPI and typed client without a database. HTTP tests exercise real socket requests and Fastify injection. `pnpm test:integration` applies migrations to the configured local development database and verifies isolated owners and competing writes with randomly generated test identities. See [module boundaries](src/modules/README.md).

## Optional cloud practice

Quiz and practice-test generation and written feedback can use the authenticated API and a dedicated PostgreSQL worker. Tutor chat and offline practice use the local model. To enable cloud practice, apply the migrations, configure account authentication, and set `OPENAI_API_KEY` in the server and worker environments. Start the API and one worker from the same build using `pnpm --filter @studypal/api frontier:worker`. The client sends up to four excerpts of 1,100 characters each, their filenames and a topic or written answer after the user selects the cloud model and submits.

The worker calls the Responses API with `store:false`, standard service tier, a pinned `gpt-5.4-mini-2026-03-17` snapshot, strict JSON and no tools. StudyPal checks that each evidence quote occurs in the source. The quiz validator also checks the answer against the quote, number of questions, and uniqueness of choices. Written feedback is an AI assessment on a 0–4 source-accuracy rubric.

Each request reserves an upper estimate before queueing. The limits are per UTC enqueue day. Defaults are 100 cents per installation and 25 cents per owner, configured with `FRONTIER_DAILY_BUDGET_CENTS` and `FRONTIER_USER_DAILY_BUDGET_CENTS`. Estimates use $0.75 per million input tokens and $4.50 per million output tokens, without caching discounts. Check provider pricing before deploying a price or model change. Successful jobs settle against provider usage. Ambiguous failures or cancellations after dispatch retain their reservation. The worker never automatically repeats a paid call. Queued cancellations release the reservation. The worker removes request content on completion, cancellation or expiration, and removes results and accounting rows after 24 hours. Cleanup and dispatch require the worker to be running.

[OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini) · [OpenAI pricing](https://developers.openai.com/api/docs/pricing) · [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
