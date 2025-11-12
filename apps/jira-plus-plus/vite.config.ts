import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

const port = Number(process.env.VITE_DEV_SERVER_PORT ?? 3000);
const host = process.env.VITE_DEV_SERVER_HOST ?? "localhost";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envDir: path.resolve(__dirname, "..", ".."),
  server: {
    host,
    port,
  },
});
