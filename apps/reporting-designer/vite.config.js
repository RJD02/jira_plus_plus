import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
const reportingApiTarget = process.env.VITE_REPORTING_API_URL ?? "http://localhost:4002";
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5175,
        proxy: {
            "/api/graphql": {
                target: reportingApiTarget,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/graphql/, "/graphql"),
            },
        },
    },
    preview: {
        port: 4175,
    },
});
