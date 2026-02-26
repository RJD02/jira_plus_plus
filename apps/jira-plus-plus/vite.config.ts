import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const appRoot = path.resolve(__dirname);

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const appEnv = loadEnv(mode, appRoot, "");
  const env = { ...rootEnv, ...appEnv };
  const port = Number(env.VITE_DEV_SERVER_PORT ?? 3000);
  const host = env.VITE_DEV_SERVER_HOST ?? "localhost";
  const disableHmr = env.VITE_DISABLE_HMR === "true";

  return {
    plugins: [react()],
    clearScreen: false,
    envDir: repoRoot,
    server: {
      host,
      port,
      hmr: disableHmr ? false : undefined,
    },
  };
});
