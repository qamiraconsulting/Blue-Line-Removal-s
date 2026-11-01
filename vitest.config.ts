import { defineConfig } from "vitest/config";

// Unit tests only (no browser): shared helpers in src/lib and the API's own
// helpers in api/_lib. Run with `npm test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "api/**/*.test.ts"],
    environment: "node",
  },
});
