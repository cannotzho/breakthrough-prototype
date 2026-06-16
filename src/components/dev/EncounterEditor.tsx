import { useState } from 'react';
import {
  EncounterConfig, OpponentShieldSlot, RelevantCard, Trait,
  CardEffect, CardEffectType,
} from '../../combat/types';
import { useDevEncounterStore } from '../../stores/encounterStore';

const EFFECT_TYPES: CardEffectType[] = [
  'BREAK_OPPONENT_SHIELD', 'BREAK_PLAYER_SHIELD', 'MODIFY_PRIORITY',
  'MODIFY_PATIENCE', 'DRAW_CARDS', 'PLACE_AS_SHIELD', 'INCREMENT_LIE_COUNTER', 'PLACE_IMPRESSION',
];

const INPUT = 'text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white w-full';
const LABEL = 'text-xs text-zinc-500';
const BTN = 'text-xs px-3 py-1.5 rounded border transition-colors';

function defaultEncounter(): EncounterConfig {
  return {
    id: `encounter_${Date.now()}`,
    displayName: 'New Encounter',
    startingPriority: 5,
    defaultRestorePriority: 5,
    opponentPatience: 10,
    opponentShields: [
      { cardId: 'shield_1', isHint: false, broken: false, loreDescription: '' },
    ],
    shieldBreakOrder: [0],
    playerShields: [],
    unbreakablePlayerShields: false,
    relevantCards: [],
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

function RelevantCardEditor({ cards, onChange }: {
  cards: RelevantCard[];
  onChange: (cards: RelevantCard[]) => void;
}) {
  const addCard = () => onChange([
    ...cards,
    { cardId: '', effectDescription: '', discovered: false, effects: [] },
  ]);
  const removeCard = (i: number) => onChange(cards.filter((_, j) => j !== i));
  const update = (i: number, partial: Partial<RelevantCard>) =>
    onChange(cards.map((c, j) => j === i ? { ...c, ...partial } : c));
  const updateEffect = (ci: number, ei: number, partial: Partial<CardEffect>) =>
    onChange(cards.map((c, j) => j === ci ? {
      ...c,
      effects: c.effects.map((e, k) => k === ei ? { ...e, ...partial } : e),
    } : c));
  const addEffect = (ci: number) =>
    onChange(cards.map((c, j) => j === ci ? {
      ...c, effects: [...c.effects, { type: 'MODIFY_PRIORITY' as CardEffectType, value: 1 }],
    } : c));
  const removeEffect = (ci: number, ei: number) =>
    onChange(cards.map((c, j) => j === ci ? {
      ...c, effects: c.effects.filter((_, k) => k !== ei),
    } : c));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className={LABEL}>Relevant Cards ({cards.length})</span>
        <button onClick={addCard} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
      </div>
      {cards.map((c, i) => (
        <div key={i} className="border border-zinc-700 rounded p-2 flex flex-col gap-1">
          <div className="flex gap-1 items-center">
            <input value={c.cardId} onChange={e => update(i, { cardId: e.target.value })}
              placeholder="Card ID" className={INPUT} />
            <button onClick={() => removeCard(i)} className="text-xs text-red-500 hover:text-red-400">✕</button>
          </div>
          <input value={c.effectDescription} onChange={e => update(i, { effectDescription: e.target.value })}
            placeholder="Effect description" className={INPUT} />
          <label className="flex items-center gap-1 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={c.discovered} onChange={e => update(i, { discovered: e.target.checked })} />
            Discovered
          </label>
          <div className="ml-2 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-600">Effects</span>
              <button onClick={() => addEffect(i)} className="text-xs text-blue-400 hover:text-blue-300">+</button>
            </div>
            {c.effects.map((eff, ei) => (
              <div key={ei} className="flex gap-1 items-center">
                <select value={eff.type} onChange={e => updateEffect(i, ei, { type: e.target.value as CardEffectType })}
                  className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white flex-1">
                  {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" value={eff.value ?? 0}
                  onChange={e => updateEffect(i, ei, { value: Number(e.target.value) })}
                  className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white w-12" />
                <button onClick={() => removeEffect(i, ei)} className="text-xs text-red-500">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EncounterEditorProps {
  onLoadEncounter?: (config: EncounterConfig) => void;
}

export default function EncounterEditor({ onLoadEncounter }: EncounterEditorProps) {
  const { addEncounter, updateEncounter, removeEncounter, getAllEncounters } = useDevEncounterStore();
  const [config, setConfig] = useState<EncounterConfig>(defaultEncounter);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(true);

  const savedEncounters = getAllEncounters();

  const patch = (partial: Partial<EncounterConfig>) => setConfig(c => ({ ...c, ...partial }));

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
    onLoadEncounter?.(config);
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
        setConfig(imported);
        setEditingId(null);
      } catch { /* ignore invalid files */ }
    };
    input.click();
  };

  if (showList && savedEncounters.length > 0) {
    return (
      <div className="flex flex-col gap-3">
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
    <div className="flex flex-col gap-3">
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

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Enemy Deck Card IDs (comma-separated)</span>
        <input value={config.enemyDeckCardIds.join(', ')}
          onChange={e => patch({ enemyDeckCardIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className={INPUT} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Player Shield Card IDs (comma-separated)</span>
        <input value={(config.playerShields ?? []).join(', ')}
          onChange={e => patch({ playerShields: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className={INPUT} />
      </label>

      <ShieldEditor shields={config.opponentShields}
        onChange={opponentShields => patch({
          opponentShields,
          shieldBreakOrder: opponentShields.map((_, i) => i),
        })} />

      <TraitEditor traits={config.traits} onChange={traits => patch({ traits })} />

      <RelevantCardEditor cards={config.relevantCards} onChange={relevantCards => patch({ relevantCards })} />

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
      </div>
    </div>
  );
}
