# API domain modules

Only operational health endpoints exist. Add a product module when its first use case is implemented; do not create empty modules for a roadmap.

Use `modules/<domain>/<domain>.module.ts` as the Nest composition boundary. Start with `http/` for controllers and validated DTOs, `application/` for use cases, `domain/` for framework-independent rules, and `infrastructure/` for Drizzle repositories or external provider adapters. Add each directory only when it contains real code. Simple operational modules such as health do not need all four layers.

Dependencies point inward: HTTP calls application code; application code uses domain rules and narrow ports only where substitution is needed; infrastructure implements those ports. Domain code imports neither NestJS, React, Drizzle, nor provider SDKs. Register providers in the owning module. Export a small public application interface when another module needs a capability, never its repositories or tables. Cross-domain imports must use that explicit interface.

Define HTTP request/response DTOs at the boundary, with validation and explicit Swagger metadata. Database models are not transport models. Give every endpoint a stable operation ID; run the root `api:generate` command after contract changes. HTTP errors use `application/problem+json` and a server-generated request ID. Do not place credentials, raw provider messages, SQL, or user content in client errors or logs.

Long-running AI/document work must eventually use durable jobs, idempotent handlers, bounded retries, and object-storage references. It must not block the request loop. Add a separate worker entry point only when the first background use case exists; the same modular monolith can initially own both processes.
