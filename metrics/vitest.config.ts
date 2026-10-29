import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from the app suite so `npm test` keeps its original test count.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["metrics/unit/**/*.check.ts"], testTimeout: 600_000 },
});
