/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_GOOGLE_ENABLED?: string;
  readonly VITE_CLERK_NAME_FIELDS?: string;
  readonly VITE_WORKSPACE_AUTH_MODE?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
