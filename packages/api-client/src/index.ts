import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './generated/schema.js';

/** Framework-independent: callers supply auth, cancellation and fetch as needed. */
export function createApiClient(options: ClientOptions & { baseUrl: string }) {
  return createClient<paths>(options);
}

export type { paths, components, operations } from './generated/schema.js';
