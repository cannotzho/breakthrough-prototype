import { useState, useMemo } from 'react';
import {
  EncounterConfig, OpponentShieldSlot, Trait, CardDefinition, InfoNugget,
} from '../../combat/types';
import { useDevEncounterStore } from '../../stores/encounterStore';
import { useNuggetStore } from '../../stores/nuggetStore';
import { useDevCardStore } from '../../stores/collectionStore';
import { useEncounterRelevantCardStore } from '../../stores/encounterRelevantCardStore';
import SupabaseStatus from './SupabaseStatus';
import CardGalleryGrid from './CardGalleryGrid';
import CardForm, { INPUT, BTN } from './CardEditorForm';

const LABEL = 'text-xs text-zinc-500';

function defaultEncounter(): EncounterConfig {
  return {
    id: `encounter_${Date.now()}`,
    displayName: 'New Encounter',
    startingPriority: 10,
    defaultRestorePriority: 10,
    priorityMode: 'frame',
    opponentPatience: 15,
    opponentShields: [
      { cardId: 'shield_1', isHint: false, broken: false, loreDescription: '' },
    ],
    shieldBreakOrder: [0],
    playerDummyShieldSlots: 10,
    allowedCoreShields: [],
    unbreakablePlayerShields: false,
    nuggetOverrides: [],
    traits: [],
    retryable: true,
    lieThreshold: 3,
    enemyDeckCardIds: [],
  };
}

function ShieldEditor({ shields, onChange }: {
  shields: OpponentShieldSlot[];
  onChange: (shields: OpponentShieldSlot[]) => void;
}) {
  const addShield = () => onChange([
    ...shields,
    { cardId: `shield_${shields.length + 1}`, isHint: false, broken: false, loreDescription: '' },
  ]);
  const removeShield = (i: number) => onChange(shields.filter((_, j) => j !== i));
  const update = (i: number, partial: Partial<OpponentShieldSlot>) =>
    onChange(shields.map((s, j) => j === i ? { ...s, ...partial } : s));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className={LABEL}>Opponent Shields ({shields.length})</span>
        <button onClick={addShield} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
      </div>
      {shields.map((s, i) => (
        <div key={i} className="border border-zinc-700 rounded p-2 flex flex-col gap-1">
          <div className="flex gap-1 items-center">
            <input value={s.cardId} onChange={e => update(i, { cardId: e.target.value })}
              placeholder="Card ID" className={INPUT} />
            <button onClick={() => removeShield(i)} className="text-xs text-red-500 hover:text-red-400">✕</button>
          </div>
          <label className="flex items-center gap-1 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={s.isHint} onChange={e => update(i, { isHint: e.target.checked })} />
            Hint
          </label>
          {s.isHint && (
            <input value={s.hintText ?? ''} onChange={e => update(i, { hintText: e.target.value })}
              placeholder="Hint text" className={INPUT} />
          )}
          <input value={s.loreDescription ?? ''} onChange={e => update(i, { loreDescription: e.target.value })}
            placeholder="Lore description" className={INPUT} />
        </div>
      ))}
    </div>
  );
}

function TraitEditor({ traits, onChange }: {
  traits: Trait[];
  onChange: (traits: Trait[]) => void;
}) {
  const addTrait = () => onChange([
    ...traits,
    { id: `trait_${Date.now()}`, name: '', description: '', discovered: false },
  ]);
  const removeTrait = (i: number) => onChange(traits.filter((_, j) => j !== i));
  const update = (i: number, partial: Partial<Trait>) =>
    onChange(traits.map((t, j) => j === i ? { ...t, ...partial } : t));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className={LABEL}>Traits ({traits.length})</span>
        <button onClick={addTrait} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
      </div>
      {traits.map((t, i) => (
        <div key={i} className="border border-zinc-700 rounded p-2 flex flex-col gap-1">
          <div className="flex gap-1 items-center">
            <input value={t.name} onChange={e => update(i, { name: e.target.value })}
              placeholder="Name" className={INPUT} />
            <button onClick={() => removeTrait(i)} className="text-xs text-red-500 hover:text-red-400">✕</button>
          </div>
          <input value={t.description} onChange={e => update(i, { description: e.target.value })}
            placeholder="Description" className={INPUT} />
        </div>
      ))}
    </div>
  );
}

function RelevantCardGallery({ encounterId }: { encounterId: string }) {
  const { getNugget } = useNuggetStore();
  const { getCardsByNugget } = useDevCardStore();
  const cardMap = useDevCardStore(s => s.cards);
  const { getByEncounter, addRow, removeRow, updateRow } = useEncounterRelevantCardStore();

  const overrides = getByEncounter(encounterId);

  const [galleryFilter, setGalleryFilter] = useState('');

  const allInfoCards = useMemo(() => {
    return Object.values(cardMap)
      .filter((c) => c.supertype === 'Information')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cardMap]);

  const overridesByNuggetId = useMemo(() => {
    const map: Record<string, typeof overrides[number]> = {};
    for (const o of overrides) map[o.nuggetId] = o;
    return map;
  }, [overrides]);

  const handleCardClick = async (card: CardDefinition) => {
    if (!card.nuggetId) return;
    const existing = overrides.find(o => o.nuggetId === card.nuggetId);
    if (existing) {
      if (existing.cardId === card.id) {
        removeRow(existing.id);
      } else {
        updateRow(existing.id, card.id);
      }
    } else {
      await addRow(encounterId, card.nuggetId, card.id);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>Relevant Cards ({overrides.length})</span>

      {overrides.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {overrides.map(o => {
            const nugget = getNugget(o.nuggetId);
            const cards = getCardsByNugget(o.nuggetId).filter(c => c.id !== nugget?.defaultCardId);
            return (
              <div key={o.id} className="border border-amber-700/50 rounded p-2 flex flex-col gap-1 bg-amber-950/10">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-amber-400">{nugget?.name ?? o.nuggetId}</span>
                  <button onClick={() => removeRow(o.id)} className="text-xs text-red-500 hover:text-red-400">✕</button>
                </div>
                {cards.length > 1 && (
                  <select value={o.cardId} onChange={e => updateRow(o.id, e.target.value)} className={INPUT}>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.effectText ?? c.id}</option>
                    ))}
                    {!cards.find(c => c.id === o.cardId) && (
                      <option value={o.cardId}>{o.cardId} (missing)</option>
                    )}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <span className="text-xs text-zinc-500 uppercase tracking-widest mb-1">
        Click an info card to add/remove from encounter
      </span>
      <CardGalleryGrid
        cards={allInfoCards}
        onCardClick={handleCardClick}
        filter={galleryFilter}
        onFilterChange={setGalleryFilter}
        filterPlaceholder="Filter information cards..."
        renderOverlay={(card) => {
          if (!card.nuggetId) return null;
          const override = overridesByNuggetId[card.nuggetId];
          if (!override) return null;
          const isThisVariant = override.cardId === card.id;
          return (
            <span className={`flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold ${
              isThisVariant ? 'bg-amber-500' : 'bg-amber-800'
            }`}>
              {isThisVariant ? '★' : '◆'}
            </span>
          );
        }}
        emptyMessage="No information cards available. Create one using the card creator."
      />
    </div>
  );
}

interface EncounterEditorProps {
  onLoadEncounter?: (config: EncounterConfig) => void;
  onStartPlaytest?: (config: EncounterConfig) => void;
  hideCardEditor?: boolean;
}

export default function EncounterEditor({ onLoadEncounter, onStartPlaytest, hideCardEditor }: EncounterEditorProps) {
  const { addEncounter, updateEncounter, removeEncounter, getAllEncounters, loading, error, importFromLocalStorage } = useDevEncounterStore();
  const { getByEncounter } = useEncounterRelevantCardStore();
  const { getCard, addCard, updateCard, getAllCards } = useDevCardStore();
  const { addNugget, setDefaultCardId } = useNuggetStore();

  const [config, setConfig] = useState<EncounterConfig>(defaultEncounter);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(true);

  const [cardEditorOpen, setCardEditorOpen] = useState(true);
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [editingCardOriginalId, setEditingCardOriginalId] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState(false);

  const savedEncounters = getAllEncounters();
  const customCards = getAllCards();

  const patch = (partial: Partial<EncounterConfig>) => setConfig(c => ({ ...c, ...partial }));

  const flashCardSaved = () => {
    setCardSaved(true);
    setTimeout(() => setCardSaved(false), 2000);
  };

  const resolveNuggetOverrides = (encId: string): EncounterConfig['nuggetOverrides'] => {
    const rows = getByEncounter(encId);
    return rows
      .map(r => {
        const cardDef = getCard(r.cardId);
        if (!cardDef) return null;
        return { nuggetId: r.nuggetId, overrideCardDef: cardDef };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);
  };

  const handleSave = () => {
    if (editingId && editingId !== config.id) {
      updateEncounter(editingId, config);
    } else {
      addEncounter(config);
    }
    setEditingId(config.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLoad = (enc: EncounterConfig) => {
    setConfig({ ...enc });
    setEditingId(enc.id);
    setShowList(false);
  };

  const handleNew = () => {
    setConfig(defaultEncounter());
    setEditingId(null);
    setShowList(false);
  };

  const handleDelete = (id: string) => {
    removeEncounter(id);
    if (editingId === id) {
      setConfig(defaultEncounter());
      setEditingId(null);
    }
  };

  const handleExportDownload = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadIntoCombat = () => {
    const resolved = { ...config, nuggetOverrides: resolveNuggetOverrides(config.id) };
    onLoadEncounter?.(resolved);
  };

  const handlePlaytest = (enc: EncounterConfig) => {
    const resolved = { ...enc, nuggetOverrides: resolveNuggetOverrides(enc.id) };
    onStartPlaytest?.(resolved);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text) as EncounterConfig;
        if (!imported.nuggetOverrides) imported.nuggetOverrides = [];
        setConfig(imported);
        setEditingId(null);
      } catch { /* ignore invalid files */ }
    };
    input.click();
  };

  const handleCardCreate = (card: CardDefinition, nugget?: InfoNugget) => {
    if (nugget) {
      addNugget(nugget);
      addCard(card);
      setDefaultCardId(nugget.id, card.id);
    } else {
      addCard(card);
    }
    flashCardSaved();
    setEditingCard(null);
    setEditingCardOriginalId(null);
  };

  const handleCardEdit = (card: CardDefinition) => {
    setEditingCard({ ...card });
    setEditingCardOriginalId(card.id);
  };

  const handleCardSaveEdit = (card: CardDefinition, nugget?: InfoNugget) => {
    if (nugget) {
      addNugget(nugget);
      if (editingCardOriginalId) {
        updateCard(editingCardOriginalId, card);
      } else {
        addCard(card);
      }
      setDefaultCardId(nugget.id, card.id);
    } else if (editingCardOriginalId) {
      updateCard(editingCardOriginalId, card);
    } else {
      addCard(card);
    }
    flashCardSaved();
    setEditingCard(null);
    setEditingCardOriginalId(null);
  };

  if (showList && (savedEncounters.length > 0 || loading)) {
    return (
      <div className="flex flex-col gap-3">
        <SupabaseStatus
          loading={loading}
          error={error}
          table="encounters"
          importFromLocalStorage={importFromLocalStorage}
        />
        <div className="flex gap-2">
          <button onClick={handleNew} className={`${BTN} border-blue-500 text-blue-400 hover:bg-blue-900`}>
            + New Encounter
          </button>
          <button onClick={handleImport} className={`${BTN} border-zinc-500 text-zinc-400 hover:border-white hover:text-white`}>
            Import JSON
          </button>
        </div>
        <div className="text-xs text-zinc-500 uppercase tracking-widest">Saved Encounters</div>
        {savedEncounters.map(enc => (
          <div key={enc.id} className="border border-zinc-700 rounded p-2 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white truncate">{enc.displayName}</div>
              <div className="text-xs text-zinc-500 truncate">{enc.id}</div>
            </div>
            <div className="flex gap-1 ml-2">
              {onStartPlaytest && (
                <button onClick={() => handlePlaytest(enc)}
                  className="text-xs px-2 py-1 text-green-400 hover:text-green-300">Playtest</button>
              )}
              <button onClick={() => handleLoad(enc)}
                className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300">Edit</button>
              <button onClick={() => handleDelete(enc.id)}
                className="text-xs px-2 py-1 text-red-500 hover:text-red-400">✕</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={hideCardEditor ? "flex flex-col gap-3" : "flex gap-6"}>
      {/* Left column — Encounter Editor */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <SupabaseStatus
          loading={loading}
          error={error}
          table="encounters"
          importFromLocalStorage={importFromLocalStorage}
        />
        {savedEncounters.length > 0 && (
          <button onClick={() => setShowList(true)}
            className="text-xs text-zinc-400 hover:text-white self-start">
            &larr; Back to list
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>ID</span>
            <input value={config.id} onChange={e => patch({ id: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Display Name</span>
            <input value={config.displayName} onChange={e => patch({ displayName: e.target.value })} className={INPUT} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Starting Priority</span>
            <input type="number" value={config.startingPriority}
              onChange={e => patch({ startingPriority: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Restore Priority</span>
            <input type="number" value={config.defaultRestorePriority}
              onChange={e => patch({ defaultRestorePriority: Number(e.target.value) })} className={INPUT} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Patience</span>
            <input type="number" value={config.opponentPatience}
              onChange={e => patch({ opponentPatience: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Lie Threshold</span>
            <input type="number" value={config.lieThreshold ?? 3}
              onChange={e => patch({ lieThreshold: Number(e.target.value) })} className={INPUT} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={config.retryable}
              onChange={e => patch({ retryable: e.target.checked })} />
            Retryable
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={config.unbreakablePlayerShields ?? false}
              onChange={e => patch({ unbreakablePlayerShields: e.target.checked })} />
            Unbreakable Player Shields
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Player Dummy Shield Slots</span>
            <input type="number" value={config.playerDummyShieldSlots ?? 10}
              onChange={e => patch({ playerDummyShieldSlots: Number(e.target.value) })}
              className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Priority Mode</span>
            <select value={config.priorityMode ?? 'frame'}
              onChange={e => patch({ priorityMode: e.target.value as 'frame' | 'classic' })}
              className={INPUT}>
              <option value="frame">Frame</option>
              <option value="classic">Classic</option>
            </select>
          </label>
        </div>

        <ShieldEditor shields={config.opponentShields}
          onChange={opponentShields => patch({
            opponentShields,
            shieldBreakOrder: opponentShields.map((_, i) => i),
          })} />

        <TraitEditor traits={config.traits} onChange={traits => patch({ traits })} />

        {editingId && <RelevantCardGallery encounterId={editingId} />}
        {!editingId && (
          <div className="text-xs text-zinc-500 italic">Save encounter first to manage relevant cards.</div>
        )}

        <div className="flex gap-2 flex-wrap border-t border-zinc-700 pt-3">
          <button onClick={handleSave}
            className={`${BTN} ${saved ? 'border-green-500 text-green-400' : 'border-blue-500 text-blue-400 hover:bg-blue-900'}`}>
            {saved ? 'Saved!' : editingId ? 'Update' : 'Save'}
          </button>
          <button onClick={handleExportDownload}
            className={`${BTN} border-zinc-500 text-zinc-400 hover:border-white hover:text-white`}>
            Download
          </button>
          <button onClick={handleExportCopy}
            className={`${BTN} ${copied ? 'border-green-500 text-green-400' : 'border-zinc-500 text-zinc-400 hover:border-white hover:text-white'}`}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {onLoadEncounter && (
            <button onClick={handleLoadIntoCombat}
              className={`${BTN} border-orange-500 text-orange-400 hover:bg-orange-900`}>
              Load into Combat
            </button>
          )}
          {onStartPlaytest && (
            <button onClick={() => handlePlaytest(config)}
              className={`${BTN} border-green-500 text-green-400 hover:bg-green-900`}>
              Playtest
            </button>
          )}
        </div>
      </div>

      {/* Right column — Card Creator (hidden when embedded in DevPanel) */}
      {!hideCardEditor && (
        <div className="w-80 shrink-0 flex flex-col gap-3 border-l border-zinc-800 pl-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-widest">
              {editingCard ? 'Edit Card' : 'Create Card'}
            </span>
            <button
              onClick={() => setCardEditorOpen(!cardEditorOpen)}
              className="text-xs text-zinc-500 hover:text-white"
            >
              {cardEditorOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {cardEditorOpen && (
            <>
              {cardSaved && <span className="text-xs text-green-400">Card saved!</span>}
              {customCards.length > 0 && !editingCard && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-600">Custom cards ({customCards.length})</span>
                  <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                    {customCards.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleCardEdit(c)}
                        className="text-left text-xs text-zinc-400 hover:text-white truncate px-1 py-0.5 rounded hover:bg-zinc-800"
                      >
                        {c.name} <span className="text-zinc-600">({c.id})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <CardForm
                key={editingCard?.id ?? 'new'}
                initial={editingCard ?? undefined}
                onSubmit={editingCard ? handleCardSaveEdit : handleCardCreate}
                submitLabel={editingCard ? 'Save Changes' : 'Create Card'}
                onCancel={editingCard ? () => {
                  setEditingCard(null);
                  setEditingCardOriginalId(null);
                } : undefined}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
