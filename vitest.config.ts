import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    fsModuleCache: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
