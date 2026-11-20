# StudyPal engineering instructions

## Start here

Read `README.md`, `docs/architecture/README.md`, and the closest package README
before editing. This is a web-only foundation: do not add Swift projects, product
features, infrastructure vendors, or extra services unless the task requires them.
Use Node from `.nvmrc` and the exact pnpm version in `package.json`.

## Structure and boundaries

- `apps/web/src/features/<feature>` owns UI, hooks and view models. `app` composes
  features; `components/ui` contains local shadcn primitives; `lib` contains web adapters.
- `apps/api/src/modules/<domain>` owns a business capability. Add `domain`,
  `application`, `infrastructure` and `presentation` folders only as the capability
  needs them. Do not manufacture empty layers for simple endpoints.
- Domain code is pure TypeScript: no React, Nest decorators, Drizzle, network,
  filesystem, environment access, or transport DTOs. Application code coordinates
  use cases; infrastructure implements database/provider ports; controllers map HTTP.
- Cross-module access goes through the owning module's public `index.ts` and
  exported Nest providers. Never reach into another module's repositories or tables
  from a feature. Define ports only when an external dependency or a test needs one.
- `packages/database` owns schema, migrations and connection infrastructure;
  repositories and business queries live in their owning API module.
- `packages/api-contract/openapi.json` is the language-neutral contract artifact.
  The web imports only `@studypal/api-client`, never API or database internals.
- Internal packages have explicit exports and `workspace:*` dependencies. Apps
  are deployment entrypoints, not libraries. Do not create a generic `shared` package.
- `pnpm boundaries` enforces import direction and cycles. Preserve these rules;
  do not silence violations to make a check pass.

## API and data changes

Author explicit request validation and Swagger DTO metadata together. Use stable
operation IDs, `/api/v1`, problem JSON errors, and explicit response DTOs; never
serialize database rows directly. Regenerate with `pnpm api:generate` and commit
both artifacts. Never edit generated files manually. Additive changes preserve
native-client compatibility; breaking changes require a version and migration plan.

Clerk authenticates customer accounts. Only health endpoints are public. Preserve
default-deny authorization for product routes and ownership checks in every user
data query. Do not treat CORS, UUIDs, or UI visibility as access
control. Browser sessions require HttpOnly/Secure cookies and CSRF protection;
native apps should use standards-based OAuth/OIDC with PKCE, not browser assumptions.

Use parameterized Drizzle queries, bounded result sets, keyset pagination, short
transactions and explicit selected columns. Design indexes from query predicates
and sort order. Keep owner IDs in composite foreign keys where needed to prevent
cross-user references. See `docs/architecture/data-and-ai.md` before schema work.

Generate and review SQL migrations; do not use schema push in production. Never
rewrite an applied migration. Prefer expand/migrate/contract changes. Run migrations
as a release step, not during each API replica startup. No destructive database
commands, credential logging, or production data access without explicit scope.

## Implementation conventions

- Use kebab-case filenames, PascalCase types/components, camelCase functions.
  Prefer named exports, direct imports, small modules and explicit public interfaces.
- Keep state near its owner. Local UI state stays in React; add a query cache only
  when real server-state features need it. Do not add initial network polling to the shell.
- Validate inputs at trust boundaries and configuration once at startup. Read
  environment variables in config modules only. Browser `VITE_*` values are public.
- Keep request IDs and structured logs; never log tokens, document contents, prompts,
  transcripts, cookies, database URLs, or raw third-party error payloads.
- Use deadlines and cancellation for external work. Retry only retryable,
  idempotent operations with bounded backoff. AI jobs need durable state and cost
  limits before they are exposed; never run long document/AI jobs in request handlers.
- Avoid `any`, unjustified assertions, blanket lint disables, generic repositories,
  speculative plugin frameworks, premature microservices or duplicate business types.
- Pin new direct dependencies and update the lockfile with pnpm. Assess maintenance,
  bundle/runtime cost and security before adding a package. Do not install globally.

## Verification and handoff

Run targeted tests while iterating. Before handing off run `pnpm check`. Run
`pnpm test:integration` with local PostgreSQL for data changes. Tests are colocated
for web; API and database tests are in their package `test` folders. Test behavior,
failure modes and security boundaries, not private implementation details.

Keep generated files and documentation current. Explain what changed, what passed,
and any unverified deployment assumptions. Do not claim production readiness from
a green build alone. Do not commit, push, publish or deploy unless the user asks.
