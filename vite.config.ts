import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { vercelApiDev } from "./dev/vercelApiDev.ts";

export default defineConfig({
  // vercelApiDev first so /api/* is handled before React Router's dev middleware (dev only).
  plugins: [vercelApiDev(), tailwindcss(), reactRouter()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
