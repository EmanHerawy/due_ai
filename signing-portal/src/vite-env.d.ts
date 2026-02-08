/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_ZK_PROVER_URL: string;
  readonly VITE_REOWN_PROJECT_ID: string;
  readonly VITE_SUI_NETWORK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
