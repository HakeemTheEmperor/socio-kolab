import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests resolve `@/…` the same way tsconfig and Next do. Without this, any test
// touching a component that imports via the alias fails at import time.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
