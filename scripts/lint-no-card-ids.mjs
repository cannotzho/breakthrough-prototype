/**
 * Brief §7 trap 11 — grep-level lint: no card-ID string checks inside the
 * engine. The engine may reference exactly one content id: 'ponder' (the
 * designed colorless fallback, v1.4 §3.9). Anything matching known content
 * id prefixes fails the build.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'engine');
const BANNED = /['"`](?:red_|blue_|green_|orange_|white_|black_|purple_|fcp_|dev_|info_|tok_|n_|p_)[a-z0-9_]*['"`]/g;

let failures = 0;
for (const file of readdirSync(ENGINE_DIR)) {
  if (!file.endsWith('.ts')) continue;
  const text = readFileSync(join(ENGINE_DIR, file), 'utf8');
  for (const [i, content] of text.split('\n').entries()) {
    const hits = content.match(BANNED);
    if (hits) {
      console.error(`${file}:${i + 1}: card-ID literal in engine: ${hits.join(', ')}`);
      failures++;
    }
  }
}
if (failures > 0) {
  console.error(`\n${failures} violation(s) of v1.4 §15.2 (no card-ID logic in the engine).`);
  process.exit(1);
}
console.log('engine is free of card-ID literals (v1.4 §15.2).');
