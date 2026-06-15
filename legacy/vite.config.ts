import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { createJiti } from 'jiti'

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

      // Evaluate a TypeScript data file using jiti (Vite 8 compatible).
      // Cache is disabled so edits to data files are reflected immediately.
      function loadTs(filePath: string): Record<string, unknown> {
        const j = createJiti(import.meta.url, { cache: false, interopDefault: true });
        return j(filePath) as Record<string, unknown>;
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

      // ── Card TypeScript generator ────────────────────────────────────────────

      function cardEntryTs(card: any): string {
        const fxLines = Object.entries(card.effects as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== false)
          .map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`)
          .join('\n');
        const fxBody = fxLines ? `\n${fxLines}\n    ` : '';
        const lines: string[] = [
          `  ${card.id}: {`,
          `    id: '${card.id}',`,
          `    name: ${JSON.stringify(card.name)},`,
          `    supertype: '${card.supertype}',`,
          `    type: '${card.type}',`,
          `    cost: ${card.cost},`,
          `    effectText: ${JSON.stringify(card.effectText)},`,
        ];
        if (card.flavorText) lines.push(`    flavorText: ${JSON.stringify(card.flavorText)},`);
        lines.push(
          `    effects: {${fxBody}},`,
          `    color: '${card.color}',`,
          `  },`,
        );
        return lines.join('\n');
      }

      // Insert a new card entry or replace an existing one in the cards.ts source.
      function upsertCard(content: string, card: any): string {
        const ts = cardEntryTs(card);
        const safeId = card.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = new RegExp(`  ${safeId}: \\{[\\s\\S]*?\\n  \\},`);
        if (existing.test(content)) return content.replace(existing, ts);
        // Append before the `\n};` that closes the CARDS object
        const closingIdx = content.indexOf('\n};');
        if (closingIdx === -1) throw new Error('Cannot find CARDS closing bracket in cards.ts');
        return `${content.slice(0, closingIdx)}\n\n${ts}${content.slice(closingIdx)}`;
      }

      // ── Middleware ──────────────────────────────────────────────────────────

      server.middlewares.use(async (req: any, res: any, next: any) => {
        // Vite 8 no longer rewrites req.url before custom middleware, so the
        // base URL prefix (/breakthrough-prototype/) is still present. Strip it
        // with a regex so this works with any base URL configuration.
        const rawUrl = req.url ?? '';
        const apiMatch = rawUrl.match(/\/dev-api(\/.*)/);
        if (!apiMatch) return next();
        const apiPath = '/dev-api' + apiMatch[1].split('?')[0]; // strip query string

        if (apiPath === '/dev-api/encounters') {
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

        if (apiPath === '/dev-api/cards') {
          if (req.method === 'GET') {
            try {
              const mod = loadTs(path.join(srcDir(), 'data/cards.ts'));
              send(res, mod.CARDS ?? {});
            } catch (e) { send(res, { error: String(e) }, 500); }
            return;
          }
          if (req.method === 'POST') {
            try {
              const body = await readBody(req);
              const card = JSON.parse(body);
              const filePath = path.join(srcDir(), 'data/cards.ts');
              const content = fs.readFileSync(filePath, 'utf8');
              fs.writeFileSync(filePath, upsertCard(content, card), 'utf8');
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
