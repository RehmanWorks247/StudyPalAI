import { createApiClient } from '@studypal/api-client';

import { resolveApiBaseUrl } from './env';

/** Feature data loaders own requests, cancellation, and cache policy. No polling at startup. */
export function getApiClient() {
  return createApiClient({
    baseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location.origin),
  });
}
