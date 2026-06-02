import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { transformSync } from 'esbuild'

// ── Dev-only API plugin ────────────────────────────────────────────────────────
// Exposes /dev-api/encounters (GET/POST) so the DevTools Encounter Creator can
// load and save directly to src/data/encounters.ts without a manual copy-paste.

function devApiPlugin() {
  let root = '';

  return {
    name: 'dev-api',
    configResolved(config: { root: string }) {
      root = config.root;
    },
    configureServer(server: any) {
      const srcDir = () => path.join(root, 'src');

      function readBody(req: any): Promise<string> {
        return new Promise((resolve, reject) => {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => resolve(body));
          req.on('error', reject);
        });
      }

      function send(res: any, data: unknown, status = 200) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      }

      // Evaluate a TypeScript source file by transpiling with esbuild and running
      // in a sandboxed Function. Type-only imports are stripped by esbuild so no
      // real require() calls happen for our data files.
      function loadTs(filePath: string): Record<string, unknown> {
        const code = fs.readFileSync(filePath, 'utf8');
        const js = transformSync(code, { loader: 'ts', format: 'cjs', target: 'node18' }).code;
        const exports: Record<string, unknown> = {};
        // eslint-disable-next-line no-new-func
        new Function('exports', 'require', js)(exports, () => ({}));
        return exports;
      }

      // ── Encounter TypeScript generator ──────────────────────────────────────

      function arrTs(items: string[]): string {
        return !items.length ? '[]'
          : `[\n      ${items.map(s => `'${s}'`).join(',\n      ')},\n    ]`;
      }

      function dialogArrTs(items: string[]): string {
        return !items.length ? '[]'
          : `[\n      ${items.map(s => JSON.stringify(s)).join(',\n      ')},\n    ]`;
      }

      function encEntryTs(e: any): string {
        return [
          `  ${e.id}: {`,
          `    id: '${e.id}',`,
          `    name: ${JSON.stringify(e.name)},`,
          `    patience: ${e.patience},`,
          `    playerShields: ${e.playerShields},`,
          `    oppShields: ${e.oppShields},`,
          `    shieldLinks: ${arrTs(e.shieldLinks)},`,
          `    worldDeck: ${arrTs(e.worldDeck)},`,
          `    oppDeck: ${arrTs(e.oppDeck)},`,
          `    disposition: {`,
          `      vulnerable: ${arrTs(e.disposition.vulnerable)},`,
          `      resistant: ${arrTs(e.disposition.resistant)},`,
          `    },`,
          `    valuableShields: ${arrTs(e.valuableShields)},`,
          `    dialogue: {`,
          `      onVulnerable: ${dialogArrTs(e.dialogue.onVulnerable)},`,
          `      onResistant: ${dialogArrTs(e.dialogue.onResistant)},`,
          `    },`,
          `  },`,
        ].join('\n');
      }

      function generateEncountersTs(encounters: Record<string, unknown>): string {
        const entries = Object.values(encounters).map(e => encEntryTs(e)).join('\n\n');
        return `import type { EncounterConfig } from '../combat/types';\n\nexport const ENCOUNTERS: Record<string, EncounterConfig> = {\n${entries}\n};\n`;
      }

      // ── Middleware ──────────────────────────────────────────────────────────

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/dev-api/')) return next();

        if (req.url === '/dev-api/encounters') {
          if (req.method === 'GET') {
            try {
              const mod = loadTs(path.join(srcDir(), 'data/encounters.ts'));
              send(res, mod.ENCOUNTERS ?? {});
            } catch (e) { send(res, { error: String(e) }, 500); }
            return;
          }
          if (req.method === 'POST') {
            try {
              const body = await readBody(req);
              const encounters = JSON.parse(body) as Record<string, unknown>;
              fs.writeFileSync(
                path.join(srcDir(), 'data/encounters.ts'),
                generateEncountersTs(encounters),
                'utf8',
              );
              send(res, { ok: true });
            } catch (e) { send(res, { error: String(e) }, 500); }
            return;
          }
        }

        next();
      });
    },
  };
}

// ── Vite config ────────────────────────────────────────────────────────────────

export default defineConfig({
  base: '/breakthrough-prototype/',
  plugins: [react(), tailwindcss(), devApiPlugin()],
  server: {
    allowedHosts: true,   // permit tunnel hostnames (localtunnel, ngrok, etc.)
  },
})
