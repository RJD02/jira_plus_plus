/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_OVERLAY_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
