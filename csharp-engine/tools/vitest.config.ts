// Standalone config for the TS-engine trace export (the repo's vitest config
// only includes tests/**). Run from the repo root:
//   npx vitest run --config csharp-engine/tools/vitest.config.ts
//
// dump-content.test.ts retired 2026-07-19 (Option-B pipeline flip): the
// canonical content store is now the checked-in content/content.json, edited
// by the Godot Card Designer — there is nothing to export anymore.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['csharp-engine/tools/dump-trace.test.ts'],
  },
});
