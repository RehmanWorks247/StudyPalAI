# API client

Framework-independent `openapi-fetch` client with generated OpenAPI types. It has
no React, authentication storage, global state, or server dependencies.

```ts
import { createApiClient } from '@studypal/api-client';

const api = createApiClient({ baseUrl: 'http://localhost:3001' });
const { data, error, response } = await api.GET('/api/v1/health/live', {
  signal: AbortSignal.timeout(5_000),
});
```

The origin excludes `/api/v1` because paths in the specification include it.
Callers supply cancellation, authentication middleware and cache policy. Check
`error` for HTTP failures; catch network errors separately. Generated TypeScript
provides compile-time safety, not runtime validation of arbitrary remote data.
