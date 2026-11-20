# Web features

Add a directory when a product capability is implemented, not before. A typical feature owns `components/`, `api/`, `hooks/`, and colocated tests; create only the folders needed. Export its supported surface from `index.ts` when other features need it.

`app/` owns composition, routing, global providers, styles, and failure boundaries. `components/ui/` owns local shadcn/ui primitives. `lib/` contains browser infrastructure and the generated-client adapter, never backend business rules. Keep feature-specific components inside their feature.

Features consume `@studypal/api-client`; never import API implementation, Drizzle schemas, server configuration, or another feature's internals. Keep transient interaction state local. Introduce a server-state cache and route-level lazy loading with the first data-backed feature. Do not fetch or poll for data that the current screen does not need.

Future mobile apps consume the OpenAPI contract directly. React hooks and components are web-specific and are not shared with SwiftUI.
