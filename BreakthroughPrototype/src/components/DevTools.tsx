import { useState, useEffect } from 'react';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';
import type { CardDef, CardEffects, EncounterConfig, CardSupertype, CardType } from '../combat/types';

type Tab = 'card' | 'encounter';

const COLOR_PRESETS = [
  { label: 'Red',    value: '#e94560' },
  { label: 'Blue',   value: '#00d9ff' },
  { label: 'Yellow', value: '#f4d03f' },
  { label: 'Green',  value: '#4ecca3' },
  { label: 'Grey',   value: '#888888' },
];

// ── TS output generators ─────────────────────────────────────────────────────

function cardToTs(card: CardDef): string {
  const fxLines = (Object.entries(card.effects as Record<string, unknown>))
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`)
    .join('\n');
  const fxBody = fxLines ? `\n${fxLines}\n    ` : '';
  return [
    `  ${card.id}: {`,
    `    id: '${card.id}',`,
    `    name: ${JSON.stringify(card.name)},`,
    `    supertype: '${card.supertype}',`,
    `    type: '${card.type}',`,
    `    cost: ${card.cost},`,
    `    effectText: ${JSON.stringify(card.effectText)},`,
    `    effects: {${fxBody}},`,
    `    color: '${card.color}',`,
    `  },`,
  ].join('\n');
}

function arr(items: string[]): string {
  if (!items.length) return '[]';
  return `[\n      ${items.map(s => `'${s}'`).join(',\n      ')},\n    ]`;
}

function dialogArr(items: string[]): string {
  if (!items.length) return '[]';
  return `[\n      ${items.map(s => JSON.stringify(s)).join(',\n      ')},\n    ]`;
}

function encToTs(enc: EncounterConfig): string {
  return [
    `  ${enc.id}: {`,
    `    id: '${enc.id}',`,
    `    name: ${JSON.stringify(enc.name)},`,
    `    patience: ${enc.patience},`,
    `    playerShields: ${enc.playerShields},`,
    `    oppShields: ${enc.oppShields},`,
    `    shieldLinks: ${arr(enc.shieldLinks)},`,
    `    worldDeck: ${arr(enc.worldDeck)},`,
    `    oppDeck: ${arr(enc.oppDeck)},`,
    `    disposition: {`,
    `      vulnerable: ${arr(enc.disposition.vulnerable)},`,
    `      resistant: ${arr(enc.disposition.resistant)},`,
    `    },`,
    `    valuableShields: ${arr(enc.valuableShields)},`,
    `    dialogue: {`,
    `      onVulnerable: ${dialogArr(enc.dialogue.onVulnerable)},`,
    `      onResistant: ${dialogArr(enc.dialogue.onResistant)},`,
    `    },`,
    `  },`,
  ].join('\n');
}

// ── Shared sub-components ────────────────────────────────────────────────────

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={copy}
      style={{
        background: copied ? '#0a2a1e' : '#16213e',
        border: `1px solid ${copied ? '#4ecca3' : '#0f3460'}`,
        color: copied ? '#4ecca3' : '#ccc',
        padding: '6px 16px', borderRadius: 6,
        fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
      }}
    >
      {copied ? '✓ Copied!' : 'Copy TypeScript'}
    </button>
  );
}

function TsOutput({ code }: { code: string }) {
  return (
    <pre style={{
      background: '#09090f', border: '1px solid #1e2a40',
      borderRadius: 6, padding: 16, fontSize: 11,
      fontFamily: 'monospace', color: '#aaa',
      overflowX: 'auto', maxHeight: 300, overflowY: 'auto',
      whiteSpace: 'pre', lineHeight: 1.6,
    }}>
      {code}
    </pre>
  );
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
}

function TagInput({ tags, onChange, suggestions, placeholder = 'Type ID and press Enter', id }: TagInputProps) {
  const [input, setInput] = useState('');
  const listId = id ? `dl-${id}` : undefined;

  function add() {
    const val = input.trim();
    if (!val) return;
    onChange([...tags, val]);
    setInput('');
  }

  function remove(i: number) {
    onChange(tags.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {tags.map((t, i) => (
          <span key={i} style={{
            background: '#0f3460', border: '1px solid #1e2a40', borderRadius: 4,
            padding: '2px 8px', fontFamily: 'monospace', fontSize: 11, color: '#ccc',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t}
            <button
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', color: '#e94560', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}
            >×</button>
          </span>
        ))}
        {tags.length === 0 && <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>none</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          list={listId}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={inputSt}
        />
        {listId && suggestions && <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
        <button onClick={add} style={{ ...btnSt, padding: '4px 12px', fontSize: 12 }}>Add</button>
      </div>
    </div>
  );
}

interface LineListProps {
  lines: string[];
  onChange: (lines: string[]) => void;
  placeholder?: string;
}

function LineList({ lines, onChange, placeholder = 'Dialogue line…' }: LineListProps) {
  const [input, setInput] = useState('');

  function add() {
    const val = input.trim();
    if (!val) return;
    onChange([...lines, val]);
    setInput('');
  }

  function remove(i: number) {
    onChange(lines.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ flex: 1, color: '#ccc', fontSize: 12, fontFamily: 'monospace', background: '#09090f', border: '1px solid #1e2a40', borderRadius: 4, padding: '4px 8px' }}>
            {l}
          </span>
          <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#e94560', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={inputSt}
        />
        <button onClick={add} style={{ ...btnSt, padding: '4px 12px', fontSize: 12 }}>Add</button>
      </div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  background: '#09090f', border: '1px solid #1e2a40', borderRadius: 4,
  color: '#ccc', padding: '5px 10px', fontFamily: 'monospace', fontSize: 12,
  width: '100%', outline: 'none',
};

const selectSt: React.CSSProperties = { ...inputSt, cursor: 'pointer' };

const btnSt: React.CSSProperties = {
  background: '#16213e', border: '1px solid #0f3460',
  color: '#ccc', padding: '6px 14px', borderRadius: 6,
  fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', flexShrink: 0,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: '#bbb', fontSize: 11, fontFamily: 'monospace', marginBottom: 5, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ color: '#e94560', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 12px', borderBottom: '1px solid #1e2a40', paddingBottom: 6 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Card Creator ─────────────────────────────────────────────────────────────

const BLANK_CARD: CardDef = {
  id: 'myCard',
  name: 'My Card',
  supertype: 'Personal',
  type: 'sorcery',
  cost: 1,
  effectText: 'Effect description.',
  effects: {},
  color: '#e94560',
};

function CardCreator({ onCardSaved }: { onCardSaved: () => void }) {
  const [card, setCard] = useState<CardDef>(BLANK_CARD);
  const [saveStatus, setSaveStatus] = useState('');

  async function saveToFile() {
    setSaveStatus('Saving…');
    try {
      const result = await fetch('/dev-api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      }).then(r => r.json());
      if (result.ok) {
        setSaveStatus('Saved!');
        onCardSaved();
      } else {
        setSaveStatus(`Error: ${result.error}`);
      }
    } catch (e: any) {
      setSaveStatus(`Error: ${e.message}`);
    }
    setTimeout(() => setSaveStatus(''), 3000);
  }

  function set<K extends keyof CardDef>(k: K, v: CardDef[K]) {
    setCard(prev => ({ ...prev, [k]: v }));
  }

  function setFx<K extends keyof CardEffects>(k: K, v: CardEffects[K]) {
    setCard(prev => ({ ...prev, effects: { ...prev.effects, [k]: v } }));
  }

  function clearFx<K extends keyof CardEffects>(k: K) {
    setCard(prev => {
      const fx = { ...prev.effects };
      delete fx[k];
      return { ...prev, effects: fx };
    });
  }

  const ts = cardToTs(card);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 32, alignItems: 'start' }}>
      {/* Form */}
      <div>
        <Section title="Identity">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="ID">
              <input value={card.id} onChange={e => set('id', e.target.value)} style={inputSt} />
            </Field>
            <Field label="Name">
              <input value={card.name} onChange={e => set('name', e.target.value)} style={inputSt} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Supertype">
              <select value={card.supertype} onChange={e => set('supertype', e.target.value as CardSupertype)} style={selectSt}>
                <option value="Personal">Personal</option>
                <option value="Information">Information</option>
              </select>
            </Field>
            <Field label="Type">
              <select value={card.type} onChange={e => set('type', e.target.value as CardType)} style={selectSt}>
                <option value="sorcery">Sorcery</option>
                <option value="instant">Instant</option>
                <option value="enchantment">Enchantment</option>
              </select>
            </Field>
            <Field label="Cost (0–5)">
              <input type="number" min={0} max={5} value={card.cost} onChange={e => set('cost', Number(e.target.value))} style={inputSt} />
            </Field>
          </div>
          <Field label="Color">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => set('color', p.value)}
                  style={{
                    background: p.value, border: `2px solid ${card.color === p.value ? '#fff' : 'transparent'}`,
                    borderRadius: 4, width: 28, height: 28, cursor: 'pointer', flexShrink: 0,
                    title: p.label,
                  } as React.CSSProperties}
                  title={p.label}
                />
              ))}
              <input
                type="color"
                value={card.color}
                onChange={e => set('color', e.target.value)}
                style={{ width: 36, height: 28, border: '1px solid #1e2a40', borderRadius: 4, cursor: 'pointer', background: 'none', padding: 2 }}
                title="Custom color"
              />
              <span style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace' }}>{card.color}</span>
            </div>
          </Field>
          <Field label="Effect Text">
            <textarea
              value={card.effectText}
              onChange={e => set('effectText', e.target.value)}
              rows={3}
              style={{ ...inputSt, resize: 'vertical' }}
            />
          </Field>
        </Section>

        <Section title="Effects">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="opponentPatience (neg = drain)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  value={card.effects.opponentPatience ?? ''}
                  onChange={e => e.target.value === '' ? clearFx('opponentPatience') : setFx('opponentPatience', Number(e.target.value))}
                  placeholder="none"
                  style={{ ...inputSt, width: 80 }}
                />
                {card.effects.opponentPatience !== undefined && <button onClick={() => clearFx('opponentPatience')} style={{ ...btnSt, padding: '4px 8px', color: '#e94560' }}>✕</button>}
              </div>
            </Field>

            <Field label="priority (pos = gain)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  value={card.effects.priority ?? ''}
                  onChange={e => e.target.value === '' ? clearFx('priority') : setFx('priority', Number(e.target.value))}
                  placeholder="none"
                  style={{ ...inputSt, width: 80 }}
                />
                {card.effects.priority !== undefined && <button onClick={() => clearFx('priority')} style={{ ...btnSt, padding: '4px 8px', color: '#e94560' }}>✕</button>}
              </div>
            </Field>

            <Field label="drawCards">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={card.effects.drawCards ?? ''}
                  onChange={e => e.target.value === '' ? clearFx('drawCards') : setFx('drawCards', Number(e.target.value))}
                  placeholder="none"
                  style={{ ...inputSt, width: 80 }}
                />
                {card.effects.drawCards !== undefined && <button onClick={() => clearFx('drawCards')} style={{ ...btnSt, padding: '4px 8px', color: '#e94560' }}>✕</button>}
              </div>
            </Field>

            <Field label="reduceInfoCost">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={card.effects.reduceInfoCost ?? ''}
                  onChange={e => e.target.value === '' ? clearFx('reduceInfoCost') : setFx('reduceInfoCost', Number(e.target.value))}
                  placeholder="none"
                  style={{ ...inputSt, width: 80 }}
                />
                {card.effects.reduceInfoCost !== undefined && <button onClick={() => clearFx('reduceInfoCost')} style={{ ...btnSt, padding: '4px 8px', color: '#e94560' }}>✕</button>}
              </div>
            </Field>

            <Field label="drawEachTurn (enchantment)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  value={card.effects.drawEachTurn ?? ''}
                  onChange={e => e.target.value === '' ? clearFx('drawEachTurn') : setFx('drawEachTurn', Number(e.target.value))}
                  placeholder="none"
                  style={{ ...inputSt, width: 80 }}
                />
                {card.effects.drawEachTurn !== undefined && <button onClick={() => clearFx('drawEachTurn')} style={{ ...btnSt, padding: '4px 8px', color: '#e94560' }}>✕</button>}
              </div>
            </Field>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
              {(
                [
                  ['breakShield',   'breakShield — break one opp shield'],
                  ['restoreShield', 'restoreShield — repair one player shield'],
                  ['peekShield',    'peekShield — view a random opp shield'],
                ] as [keyof CardEffects, string][]
              ).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!card.effects[k]}
                    onChange={e => e.target.checked ? setFx(k, true as CardEffects[typeof k]) : clearFx(k)}
                    style={{ accentColor: '#e94560', width: 14, height: 14 }}
                  />
                  <span style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace' }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section title="TypeScript Output">
          <p style={{ color: '#999', fontSize: 11, fontFamily: 'monospace', margin: '0 0 10px' }}>
            Use <strong>Save to File</strong> to write directly to <code style={{ color: '#00d9ff' }}>src/data/cards.ts</code>, or copy and paste manually.
          </p>
          <TsOutput code={ts} />
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <CopyButton getText={() => ts} />
            <button
              onClick={saveToFile}
              style={{ ...btnSt, background: '#0a2a1e', borderColor: '#4ecca3', color: '#4ecca3' }}
            >
              Save to File
            </button>
            {saveStatus && (
              <span style={{ color: saveStatus.startsWith('Error') ? '#e94560' : '#4ecca3', fontSize: 11, fontFamily: 'monospace' }}>
                {saveStatus}
              </span>
            )}
          </div>
        </Section>
      </div>

      {/* Live preview */}
      <div style={{ position: 'sticky', top: 24 }}>
        <p style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Live Preview
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', background: '#09090f', border: '1px solid #1e2a40', borderRadius: 8 }}>
          <CardComponent card={card} />
        </div>
      </div>
    </div>
  );
}

// ── Encounter Creator ────────────────────────────────────────────────────────

const BLANK_ENC: EncounterConfig = {
  id: 'myEncounter',
  name: 'My Encounter',
  patience: 5,
  playerShields: 3,
  oppShields: 3,
  shieldLinks: [],
  worldDeck: [],
  oppDeck: [],
  disposition: { vulnerable: [], resistant: [] },
  valuableShields: [],
  dialogue: { onVulnerable: [], onResistant: [] },
};

function EncounterCreator({ cardIds }: { cardIds: string[] }) {
  const [enc, setEnc] = useState<EncounterConfig>(BLANK_ENC);
  const [encounterList, setEncounterList] = useState<{ id: string; name: string }[]>([]);
  const [loadId, setLoadId] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    fetch('/dev-api/encounters')
      .then(r => r.json())
      .then((data: Record<string, EncounterConfig>) => {
        setEncounterList(Object.values(data).map(e => ({ id: e.id, name: e.name })));
      })
      .catch(() => {});
  }, []);

  async function loadEncounter() {
    if (!loadId) return;
    try {
      const data: Record<string, EncounterConfig> = await fetch('/dev-api/encounters').then(r => r.json());
      if (data[loadId]) setEnc(data[loadId]);
    } catch { /* dev tool — fail silently */ }
  }

  async function saveToFile() {
    setSaveStatus('Saving…');
    try {
      const existing: Record<string, EncounterConfig> = await fetch('/dev-api/encounters').then(r => r.json());
      const updated = { ...existing, [enc.id]: enc };
      const result = await fetch('/dev-api/encounters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).then(r => r.json());
      setSaveStatus(result.ok ? 'Saved!' : `Error: ${result.error}`);
    } catch (e: any) {
      setSaveStatus(`Error: ${e.message}`);
    }
    setTimeout(() => setSaveStatus(''), 3000);
  }

  function set<K extends keyof EncounterConfig>(k: K, v: EncounterConfig[K]) {
    setEnc(prev => ({ ...prev, [k]: v }));
  }

  const ts = encToTs(enc);

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Load / Save panel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '10px 14px', background: '#0a0a18', border: '1px solid #1e2a40', borderRadius: 6 }}>
        <span style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>Load:</span>
        <select
          value={loadId}
          onChange={e => setLoadId(e.target.value)}
          style={{ ...selectSt, flex: 1, maxWidth: 320 }}
        >
          <option value="">— select encounter —</option>
          {encounterList.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
          ))}
        </select>
        <button onClick={loadEncounter} disabled={!loadId} style={{ ...btnSt, opacity: loadId ? 1 : 0.4 }}>Load</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={saveToFile}
          style={{ ...btnSt, background: '#0a2a1e', borderColor: '#4ecca3', color: '#4ecca3' }}
        >
          Save to File
        </button>
        {saveStatus && (
          <span style={{ color: saveStatus.startsWith('Error') ? '#e94560' : '#4ecca3', fontSize: 11, fontFamily: 'monospace' }}>
            {saveStatus}
          </span>
        )}
      </div>
      <Section title="Identity">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="ID">
            <input value={enc.id} onChange={e => set('id', e.target.value)} style={inputSt} />
          </Field>
          <Field label="Name (display)">
            <input value={enc.name} onChange={e => set('name', e.target.value)} style={inputSt} />
          </Field>
        </div>
      </Section>

      <Section title="Shields & Patience">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="patience">
            <input type="number" min={1} value={enc.patience} onChange={e => set('patience', Number(e.target.value))} style={inputSt} />
          </Field>
          <Field label="playerShields">
            <input type="number" min={0} max={6} value={enc.playerShields} onChange={e => set('playerShields', Number(e.target.value))} style={inputSt} />
          </Field>
          <Field label="oppShields">
            <input type="number" min={0} max={6} value={enc.oppShields} onChange={e => set('oppShields', Number(e.target.value))} style={inputSt} />
          </Field>
        </div>
        <Field label="shieldLinks — info card ID revealed per shield slot (in order)">
          <TagInput
            id="shieldLinks"
            tags={enc.shieldLinks}
            onChange={v => set('shieldLinks', v)}
            suggestions={cardIds}
            placeholder="Card ID (press Enter)"
          />
          {enc.shieldLinks.length !== enc.oppShields && enc.oppShields > 0 && (
            <p style={{ color: '#f4d03f', fontSize: 11, fontFamily: 'monospace', margin: '6px 0 0' }}>
              ⚠ {enc.shieldLinks.length} links for {enc.oppShields} shields — counts should match
            </p>
          )}
        </Field>
      </Section>

      <Section title="Decks">
        <Field label="worldDeck — relevance list (Information cards; others become Ponder)">
          <TagInput id="wdeck" tags={enc.worldDeck} onChange={v => set('worldDeck', v)} suggestions={cardIds} />
        </Field>
        <Field label="oppDeck — opponent's deck">
          <TagInput id="odeck" tags={enc.oppDeck} onChange={v => set('oppDeck', v)} suggestions={cardIds} />
        </Field>
      </Section>

      <Section title="Disposition">
        <p style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace', margin: '0 0 12px' }}>
          vulnerable cards deal double patience drain +1 priority · resistant cards deal half drain −1 priority
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="vulnerable — card IDs">
            <TagInput id="vuln" tags={enc.disposition.vulnerable} onChange={v => set('disposition', { ...enc.disposition, vulnerable: v })} suggestions={cardIds} />
          </Field>
          <Field label="resistant — card IDs">
            <TagInput id="resist" tags={enc.disposition.resistant} onChange={v => set('disposition', { ...enc.disposition, resistant: v })} suggestions={cardIds} />
          </Field>
        </div>
      </Section>

      <Section title="Valuable Shields">
        <Field label="valuableShields — World card IDs the NPC cares about keeping hidden">
          <TagInput id="vals" tags={enc.valuableShields} onChange={v => set('valuableShields', v)} suggestions={cardIds} />
        </Field>
      </Section>

      <Section title="Dialogue">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="onVulnerable — lines shown when a vulnerable card hits">
            <LineList lines={enc.dialogue.onVulnerable} onChange={v => set('dialogue', { ...enc.dialogue, onVulnerable: v })} placeholder="NPC line…" />
          </Field>
          <Field label="onResistant — lines shown when a resistant card hits">
            <LineList lines={enc.dialogue.onResistant} onChange={v => set('dialogue', { ...enc.dialogue, onResistant: v })} placeholder="NPC line…" />
          </Field>
        </div>
      </Section>

      <Section title="TypeScript Output">
        <p style={{ color: '#999', fontSize: 11, fontFamily: 'monospace', margin: '0 0 10px' }}>
          Use <strong>Save to File</strong> to write directly to <code style={{ color: '#00d9ff' }}>src/data/encounters.ts</code>, or copy and paste manually.
        </p>
        <TsOutput code={ts} />
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
          <CopyButton getText={() => ts} />
          <button
            onClick={saveToFile}
            style={{ ...btnSt, background: '#0a2a1e', borderColor: '#4ecca3', color: '#4ecca3' }}
          >
            Save to File
          </button>
          {saveStatus && (
            <span style={{ color: saveStatus.startsWith('Error') ? '#e94560' : '#4ecca3', fontSize: 11, fontFamily: 'monospace' }}>
              {saveStatus}
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Root component ───────────────────────────────────────────────────────────

export default function DevTools() {
  const [tab, setTab] = useState<Tab>('card');
  const [cardIds, setCardIds] = useState<string[]>(Object.keys(CARDS));

  async function refreshCards() {
    try {
      const data: Record<string, unknown> = await fetch('/dev-api/cards').then(r => r.json());
      setCardIds(Object.keys(data));
    } catch { /* dev tool — fail silently */ }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? '#16213e' : 'transparent',
    border: `1px solid ${active ? '#0f3460' : 'transparent'}`,
    borderBottom: active ? '1px solid #16213e' : '1px solid #1e2a40',
    color: active ? '#e94560' : '#aaa',
    padding: '8px 22px', borderRadius: '6px 6px 0 0',
    fontFamily: 'monospace', fontSize: 13, cursor: 'pointer',
    marginBottom: -1,
  });

  return (
    <div style={{ minHeight: '100vh', background: '#090912', color: '#ddd', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ background: '#0a0a18', borderBottom: '1px solid #1e2a40', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <a
          href="./"
          style={{ color: '#aaa', fontSize: 12, textDecoration: 'none', letterSpacing: 0.5 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#aaa')}
        >
          ← Back to Game
        </a>
        <div>
          <span style={{ color: '#e94560', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 }}>DEV TOOLS</span>
          <span style={{ color: '#777', fontSize: 11, marginLeft: 12 }}>Card & Encounter Authoring · dev build only</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 28px', borderBottom: '1px solid #1e2a40', display: 'flex', alignItems: 'flex-end', gap: 4, marginTop: 16 }}>
        <button style={tabStyle(tab === 'card')} onClick={() => setTab('card')}>Card Creator</button>
        <button style={tabStyle(tab === 'encounter')} onClick={() => setTab('encounter')}>Encounter Creator</button>
      </div>

      {/* Content */}
      <div style={{ padding: '28px' }}>
        {tab === 'card' ? <CardCreator onCardSaved={refreshCards} /> : <EncounterCreator cardIds={cardIds} />}
      </div>
    </div>
  );
}
