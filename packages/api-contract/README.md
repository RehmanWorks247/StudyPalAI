# API contract

`openapi.json` is the language-neutral, generated REST contract. API controllers and
explicit DTO metadata in `apps/api` are the authoring source. Generate with
`pnpm api:generate`; check drift with `pnpm api:check`. Commit both the specification
and generated TypeScript types with every contract change. Do not edit either by hand.

Clients import no NestJS, Drizzle or backend domain types. The TypeScript client is
in `@studypal/api-client`; future Swift clients can generate from this same OpenAPI
artifact without changing the backend. Preserve stable operation IDs and additive
changes within `/api/v1`. Breaking changes need a separately supported version and
a migration plan, especially for native clients that cannot upgrade immediately.
