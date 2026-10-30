import path from "node:path";

import { defineConfig } from "vitest/config";

/** Live database tests (pnpm test:db). Kept out of `pnpm test` because they need the dev project. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/db/**/*.test.ts"], testTimeout: 30_000, fileParallelism: false },
});
