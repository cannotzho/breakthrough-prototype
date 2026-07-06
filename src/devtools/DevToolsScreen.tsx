/**
 * Dev tools (Brief §5), built against the v1.4 types from day one:
 * card editor / collection browser, encounter builder (launch playtest
 * directly), nugget manager, deck builder. All editors validate with the
 * engine's authoring-time validation before save (v1.4 §15.5).
 */
import { useEffect, useMemo, useState } from 'react';
import type { CardDefinition, EncounterConfig, InfoNugget } from '../engine';
import { validateCard, validateEncounter, type ValidationIssue } from '../engine';
import {
  ALL_CARDS,
  DEV_COLLECTION_IDS,
  ENCOUNTERS,
  NUGGETS,
  RECIPES,
  STARTER_DECK_LISTS,
  TOKENS,
} from '../content';
import { navigate } from '../App';
import { useGameStore } from '../stores/gameStore';
import {
  deleteCard,
  deleteDeck,
  deleteEncounter,
  deleteNugget,
  fetchCards,
  fetchDecks,
  fetchEncounters,
  fetchNuggets,
  saveCard,
  saveDeck,
  saveEncounter,
  saveNugget,
  seedContent,
  type DeckRow,
} from '../net/persistence';

type Tab = 'cards' | 'encounters' | 'nuggets' | 'decks';

export function DevToolsScreen() {
  const [tab, setTab] = useState<Tab>('cards');
  const [cards, setCards] = useState<Record<string, CardDefinition>>(ALL_CARDS);
  const [encounters, setEncounters] = useState<Record<string, EncounterConfig>>(ENCOUNTERS);
  const [nuggets, setNuggets] = useState<Record<string, InfoNugget>>(NUGGETS);
  const [decks, setDecks] = useState<DeckRow[]>(
    Object.entries(STARTER_DECK_LISTS).map(([id, card_ids]) => ({
      id,
      name: `${id} starter`,
      description: 'bundled',
      card_ids,
    })),
  );
  const [online, setOnline] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void (async () => {
      const [c, e, n, d] = await Promise.all([fetchCards(), fetchEncounters(), fetchNuggets(), fetchDecks()]);
      const anyOnline = c !== null || e !== null || n !== null;
      setOnline(anyOnline);
      // Supabase rows overlay the bundled content (bundled stays as fallback).
      if (c && Object.keys(c).length > 0) setCards((prev) => ({ ...prev, ...c }));
      if (e && Object.keys(e).length > 0) setEncounters((prev) => ({ ...prev, ...e }));
      if (n && Object.keys(n).length > 0) setNuggets((prev) => ({ ...prev, ...n }));
      if (d && d.length > 0) setDecks((prev) => {
        const ids = new Set(d.map((x) => x.id));
        return [...prev.filter((x) => !ids.has(x.id)), ...d];
      });
    })();
  }, []);

  const seed = async () => {
    setNotice('Seeding Supabase from bundled content…');
    const err = await seedContent(ALL_CARDS, NUGGETS, ENCOUNTERS);
    setNotice(err ? `Seed failed: ${err}` : 'Seeded.');
  };

  return (
    <div className="devtools">
      <nav className="devtools-nav">
        <h2 style={{ margin: '4px 0 10px' }}>Dev Tools</h2>
        {(['cards', 'encounters', 'nuggets', 'decks'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          Supabase: {online === null ? 'checking…' : online ? 'connected' : 'offline (bundled content)'}
        </span>
        <button onClick={seed} disabled={!online}>
          Seed Supabase
        </button>
        {notice && <span style={{ fontSize: 11 }}>{notice}</span>}
        <button onClick={() => navigate('title')}>← Title</button>
      </nav>
      <main className="devtools-main">
        {tab === 'cards' && <CardEditor cards={cards} setCards={setCards} nuggets={nuggets} />}
        {tab === 'encounters' && (
          <EncounterBuilder encounters={encounters} setEncounters={setEncounters} cards={cards} nuggets={nuggets} decks={decks} />
        )}
        {tab === 'nuggets' && <NuggetManager nuggets={nuggets} setNuggets={setNuggets} encounters={encounters} cards={cards} />}
        {tab === 'decks' && <DeckBuilder decks={decks} setDecks={setDecks} cards={cards} encounters={encounters} />}
      </main>
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return <p className="validation-ok">✓ Valid (v1.4 §15.5 authoring checks pass)</p>;
  return (
    <div className="validation-issues">
      {issues.map((i, k) => (
        <div key={k}>
          <b>{i.severity}</b> [{i.where}] {i.message}
        </div>
      ))}
    </div>
  );
}

/** JSON editor with live engine validation — the full v1.4 vocabulary. */
function CardEditor({
  cards,
  setCards,
  nuggets,
}: {
  cards: Record<string, CardDefinition>;
  setCards: (c: Record<string, CardDefinition>) => void;
  nuggets: Record<string, InfoNugget>;
}) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');

  const parsed = useMemo(() => {
    try {
      return { card: JSON.parse(text) as CardDefinition, error: null };
    } catch (e) {
      return { card: null, error: String(e) };
    }
  }, [text]);
  const issues = parsed.card ? validateCard(parsed.card) : [];

  const open = (id: string | null) => {
    setEditing(id ?? '__new__');
    setText(
      JSON.stringify(
        id
          ? cards[id]
          : ({
              id: 'new_card',
              name: 'New Card',
              cost: 1,
              color: 'Colorless',
              supertype: 'Skill',
              subtype: null,
              keywords: [],
              effects: [],
              effectText: '',
            } satisfies CardDefinition),
        null,
        2,
      ),
    );
  };

  const save = async () => {
    if (!parsed.card || issues.some((i) => i.severity === 'error')) return;
    setCards({ ...cards, [parsed.card.id]: parsed.card });
    const err = await saveCard(parsed.card);
    setNotice(err ? `Saved locally; Supabase: ${err}` : 'Saved.');
    setEditing(null);
  };

  const remove = async (id: string) => {
    const next = { ...cards };
    delete next[id];
    setCards(next);
    await deleteCard(id);
  };

  if (editing !== null) {
    return (
      <div>
        <h2>Card editor</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Full v1.4 vocabulary: effects/scales/conditions, keywords (Rapport prediction config, Heavy Hand alternate
          effects), trap trigger conditions (canonical events only), shield-trigger effects, triggered/activated
          abilities, counters/thresholds/amplifiers.
        </p>
        <div className="editor-grid">
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div>
            {parsed.error && <div className="validation-issues">JSON: {parsed.error}</div>}
            {parsed.card && <IssueList issues={issues} />}
            {parsed.card?.nuggetId && !nuggets[parsed.card.nuggetId] && (
              <div className="validation-issues">nuggetId "{parsed.card.nuggetId}" does not exist yet.</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={save} disabled={!parsed.card || issues.some((i) => i.severity === 'error')}>
                Save
              </button>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
            {notice && <p style={{ fontSize: 12 }}>{notice}</p>}
          </div>
        </div>
      </div>
    );
  }

  const list = Object.values(cards)
    .filter((c) => c.id.includes(filter) || c.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div>
      <h2>Cards ({list.length})</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="primary" onClick={() => open(null)}>
          New card
        </button>
      </div>
      {list.map((c) => (
        <div key={c.id} className="list-row">
          <b>{c.name}</b>
          <span className="badge">{c.id}</span>
          <span className="badge">{c.color}</span>
          <span className="badge">{c.supertype}{c.subtype ? `/${c.subtype}` : ''}</span>
          {c.keywords.map((k) => (
            <span key={k} className="badge gold">
              {k}
            </span>
          ))}
          <span className="grow" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.effectText}</span>
          <button onClick={() => open(c.id)}>Edit</button>
          <button className="danger" onClick={() => remove(c.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

function EncounterBuilder({
  encounters,
  setEncounters,
  cards,
  nuggets,
  decks,
}: {
  encounters: Record<string, EncounterConfig>;
  setEncounters: (e: Record<string, EncounterConfig>) => void;
  cards: Record<string, CardDefinition>;
  nuggets: Record<string, InfoNugget>;
  decks: DeckRow[];
}) {
  const startCombat = useGameStore((s) => s.startCombat);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [deckKey, setDeckKey] = useState('dev');

  const parsed = useMemo(() => {
    try {
      return { enc: JSON.parse(text) as EncounterConfig, error: null };
    } catch (e) {
      return { enc: null, error: String(e) };
    }
  }, [text]);
  const issues = parsed.enc ? validateEncounter(parsed.enc, cards, nuggets) : [];

  const open = (id: string | null) => {
    setEditing(id ?? '__new__');
    setText(
      JSON.stringify(
        id
          ? encounters[id]
          : ({
              id: 'new_encounter',
              displayName: 'New Encounter',
              minTurnStartPriority: 3,
              firstTurnBonusPriority: 2,
              maxPriority: 10,
              startingSide: 'player',
              opponentPatience: 10,
              npcGuardShieldCount: 3,
              opponentShields: [],
              npcHandLimit: 5,
              playerDummyShieldSlots: 3,
              allowedCoreShields: [],
              nuggetOverrides: [],
              traits: [],
              enemyDeckCardIds: [],
            } satisfies EncounterConfig),
        null,
        2,
      ),
    );
  };

  const save = async () => {
    if (!parsed.enc || issues.some((i) => i.severity === 'error')) return;
    setEncounters({ ...encounters, [parsed.enc.id]: parsed.enc });
    const err = await saveEncounter(parsed.enc);
    setNotice(err ? `Saved locally; Supabase: ${err}` : 'Saved.');
    setEditing(null);
  };

  const launch = (enc: EncounterConfig) => {
    const deck = decks.find((d) => d.id === deckKey);
    startCombat({
      config: enc,
      cards,
      tokens: TOKENS,
      nuggets,
      recipes: RECIPES,
      playerDeckCardIds: deck?.card_ids ?? STARTER_DECK_LISTS.dev,
      collectionCardIds: DEV_COLLECTION_IDS,
      seed: Date.now() | 0,
    });
    navigate('combat');
  };

  if (editing !== null) {
    return (
      <div>
        <h2>Encounter builder</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Full v1.4 §7 config. Validation enforces ≥1 opponent shield, ≥1 key nugget per lock, keys referencing real
          nuggets, real deck/impression/scheduled-play card ids.
        </p>
        <div className="editor-grid">
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div>
            {parsed.error && <div className="validation-issues">JSON: {parsed.error}</div>}
            {parsed.enc && <IssueList issues={issues} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={save} disabled={!parsed.enc || issues.some((i) => i.severity === 'error')}>
                Save
              </button>
              {parsed.enc && issues.every((i) => i.severity !== 'error') && (
                <button onClick={() => launch(parsed.enc as EncounterConfig)}>Launch playtest</button>
              )}
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
            {notice && <p style={{ fontSize: 12 }}>{notice}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Encounters</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button className="primary" onClick={() => open(null)}>
          New encounter
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Playtest deck:</span>
        <select value={deckKey} onChange={(e) => setDeckKey(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      {Object.values(encounters).map((enc) => (
        <div key={enc.id} className="list-row">
          <b>{enc.displayName}</b>
          <span className="badge">{enc.id}</span>
          <span className="badge purple">{enc.npcGuardShieldCount} guards</span>
          <span className="badge gold">{enc.opponentShields.length} locks</span>
          <span className="grow" />
          <button className="primary" onClick={() => launch(enc)}>
            Playtest
          </button>
          <button onClick={() => open(enc.id)}>Edit</button>
          <button
            className="danger"
            onClick={async () => {
              const next = { ...encounters };
              delete next[enc.id];
              setEncounters(next);
              await deleteEncounter(enc.id);
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

function NuggetManager({
  nuggets,
  setNuggets,
  encounters,
  cards,
}: {
  nuggets: Record<string, InfoNugget>;
  setNuggets: (n: Record<string, InfoNugget>) => void;
  encounters: Record<string, EncounterConfig>;
  cards: Record<string, CardDefinition>;
}) {
  const [draft, setDraft] = useState<InfoNugget>({ id: '', name: '', description: '' });

  const usage = (nuggetId: string) => {
    const overriding = Object.values(encounters).filter((e) => e.nuggetOverrides.some((o) => o.nuggetId === nuggetId));
    const keying = Object.values(encounters).flatMap((e) =>
      e.opponentShields.filter((s) => s.keyNuggetIds.includes(nuggetId)).map((s) => `${e.id}:${s.cardId}`),
    );
    const manifests = Object.values(cards).filter((c) => c.nuggetId === nuggetId);
    return { overriding, keying, manifests };
  };

  return (
    <div>
      <h2>Info Nuggets</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input placeholder="id" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
        <input placeholder="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input
          placeholder="description"
          style={{ flex: 1 }}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        <button
          className="primary"
          disabled={!draft.id || !draft.name}
          onClick={async () => {
            setNuggets({ ...nuggets, [draft.id]: draft });
            await saveNugget(draft);
            setDraft({ id: '', name: '', description: '' });
          }}
        >
          Save
        </button>
      </div>
      {Object.values(nuggets).map((n) => {
        const u = usage(n.id);
        return (
          <div key={n.id} className="list-row">
            <b>{n.name}</b>
            <span className="badge">{n.id}</span>
            <span className="grow" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {n.description}
            </span>
            <span className="badge gold" title="Locks this nugget keys">
              🔑 {u.keying.length > 0 ? u.keying.join(', ') : '—'}
            </span>
            <span className="badge" title="Encounters overriding this nugget">
              ⚙ {u.overriding.map((e) => e.id).join(', ') || '—'}
            </span>
            <span className="badge purple" title="Information Cards manifesting it">
              🃏 {u.manifests.map((c) => c.id).join(', ') || '—'}
            </span>
            <button onClick={() => setDraft(n)}>Edit</button>
            <button
              className="danger"
              onClick={async () => {
                const next = { ...nuggets };
                delete next[n.id];
                setNuggets(next);
                await deleteNugget(n.id);
              }}
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DeckBuilder({
  decks,
  setDecks,
  cards,
  encounters,
}: {
  decks: DeckRow[];
  setDecks: (d: DeckRow[]) => void;
  cards: Record<string, CardDefinition>;
  encounters: Record<string, EncounterConfig>;
}) {
  const startCombat = useGameStore((s) => s.startCombat);
  const [editing, setEditing] = useState<DeckRow | null>(null);
  const [encounterId, setEncounterId] = useState(Object.keys(encounters)[0] ?? '');

  const launch = (deck: DeckRow) => {
    const enc = encounters[encounterId];
    if (!enc) return;
    startCombat({
      config: enc,
      cards,
      tokens: TOKENS,
      nuggets: NUGGETS,
      recipes: RECIPES,
      playerDeckCardIds: deck.card_ids,
      collectionCardIds: DEV_COLLECTION_IDS,
      seed: Date.now() | 0,
    });
    navigate('combat');
  };

  if (editing) {
    const counts = new Map<string, number>();
    for (const id of editing.card_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    const eligible = Object.values(cards).filter((c) => c.subtype !== 'Token');
    return (
      <div>
        <h2>Deck: {editing.name}</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <span className="badge">{editing.card_ids.length} cards</span>
          <button
            className="primary"
            onClick={async () => {
              setDecks([...decks.filter((d) => d.id !== editing.id), editing]);
              await saveDeck(editing);
              setEditing(null);
            }}
          >
            Save
          </button>
          <button onClick={() => setEditing(null)}>Cancel</button>
        </div>
        {eligible.map((c) => (
          <div key={c.id} className="list-row">
            <b>{c.name}</b>
            <span className="badge">{c.supertype}</span>
            <span className="grow" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.effectText}</span>
            <span className="badge gold">×{counts.get(c.id) ?? 0}</span>
            <button onClick={() => setEditing({ ...editing, card_ids: [...editing.card_ids, c.id] })}>+</button>
            <button
              onClick={() => {
                const i = editing.card_ids.indexOf(c.id);
                if (i >= 0)
                  setEditing({ ...editing, card_ids: editing.card_ids.filter((_, k) => k !== i) });
              }}
            >
              −
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2>Decks</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          className="primary"
          onClick={() => setEditing({ id: `deck_${Date.now()}`, name: 'New Deck', description: '', card_ids: [] })}
        >
          New deck
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Playtest against:</span>
        <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)}>
          {Object.values(encounters).map((e) => (
            <option key={e.id} value={e.id}>
              {e.displayName}
            </option>
          ))}
        </select>
      </div>
      {decks.map((d) => (
        <div key={d.id} className="list-row">
          <b>{d.name}</b>
          <span className="badge">{d.card_ids.length} cards</span>
          <span className="grow" />
          <button className="primary" onClick={() => launch(d)}>
            Playtest
          </button>
          <button onClick={() => setEditing(d)}>Edit</button>
          <button
            className="danger"
            onClick={async () => {
              setDecks(decks.filter((x) => x.id !== d.id));
              await deleteDeck(d.id);
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
