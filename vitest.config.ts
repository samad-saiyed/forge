import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
