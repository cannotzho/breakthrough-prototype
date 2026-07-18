// Standalone config for the content export (the repo's vitest config only
// includes tests/**). Run from the repo root:
//   npx vitest run --config csharp-engine/tools/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['csharp-engine/tools/dump-content.test.ts', 'csharp-engine/tools/dump-trace.test.ts'],
  },
});
