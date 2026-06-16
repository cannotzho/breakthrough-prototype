import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CombatState, CombatAction, CombatPhase,
  CardDefinition, ColorIdentity, CardSupertype, CardSubtype, Keyword, CardEffectType,
  RelevantCard, CardEffect,
} from '../../combat/types';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../../data/devCards';
import EncounterEditor from './EncounterEditor';
import CardCollection from './CardCollection';

type Tab = 'State' | 'Log' | 'Config' | 'Cards' | 'RelevantCards' | 'Encounters' | 'Collection';

const PHASES: CombatPhase[] = [
  'Check', 'PlayerPending', 'PlayerPlay', 'RevealPending', 'PlayerShieldChoice',
  'BotMSelect', 'EnemyPending', 'InterruptCheck', 'Interrupt', 'InterruptPlay', 'EnemyPlay', 'WIN', 'LOSE',
];
const COLORS: ColorIdentity[] = ['Red', 'Blue', 'Green', 'White', 'Black', 'Orange', 'Purple', 'Colorless'];
const SUPERTYPES: CardSupertype[] = ['Skill', 'Information'];
const SUBTYPES: CardSubtype[] = [null, 'Impression'];
const KEYWORDS: Keyword[] = ['Interrupt', 'Safety', 'Assemble', 'Counter', 'Lie'];
const EFFECT_TYPES: CardEffectType[] = [
  'BREAK_OPPONENT_SHIELD', 'BREAK_PLAYER_SHIELD', 'MODIFY_PRIORITY',
  'MODIFY_PATIENCE', 'DRAW_CARDS', 'PLACE_AS_SHIELD', 'INCREMENT_LIE_COUNTER', 'PLACE_IMPRESSION',
];

interface Props {
  open: boolean;
  onClose?: () => void;
  state: CombatState;
  dispatch: (action: CombatAction) => void;
  onLoadEncounter?: (config: import('../../combat/types').EncounterConfig) => void;
}

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span><span className="font-bold text-white">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-400"
      />
    </div>
  );
}

function StateTab({ state, dispatch }: { state: CombatState; dispatch: (a: CombatAction) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-zinc-500">Phase:</span>
        <select
          value={state.phase}
          onChange={e => dispatch({ type: 'DEV_SET_PHASE', phase: e.target.value as CombatPhase })}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white"
        >
          {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <Slider label="Priority" value={state.priority} min={-10} max={10}
        onChange={v => dispatch({ type: 'DEV_SET_PRIORITY', value: v })} />
      <Slider label="Patience" value={state.patience} min={0} max={30}
        onChange={v => dispatch({ type: 'DEV_SET_PATIENCE', value: v })} />
      <Slider label="Lie Counter" value={state.lieCounter} min={0} max={10}
        onChange={v => dispatch({ type: 'DEV_SET_LIE_COUNTER', value: v })} />

      <div>
        <div className="text-xs text-zinc-500 mb-2">Opponent Shields</div>
        <div className="flex gap-2">
          {state.opponentShields.map((s, i) => (
            <button key={i}
              onClick={() => dispatch({ type: 'DEV_BREAK_OPPONENT_SHIELD', idx: i })}
              disabled={s.broken}
              className={`text-xs px-2 py-1 rounded border transition-colors
                ${s.broken ? 'border-zinc-700 text-zinc-600 cursor-not-allowed' : 'border-red-600 text-red-400 hover:bg-red-900'}`}
            >
              Break {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-2">Player Shields</div>
        <div className="flex gap-2">
          {state.playerShields.map((s, i) => (
            <button key={i}
              onClick={() => dispatch({ type: 'DEV_BREAK_PLAYER_SHIELD', idx: i })}
              disabled={s === null}
              className={`text-xs px-2 py-1 rounded border transition-colors
                ${s === null ? 'border-zinc-700 text-zinc-600 cursor-not-allowed' : 'border-orange-600 text-orange-400 hover:bg-orange-900'}`}
            >
              Break {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-2">Quick-add card to hand</div>
        <div className="flex gap-2 flex-wrap">
          {DEV_SKILL_CARDS.map(def => (
            <button key={def.id}
              onClick={() => dispatch({ type: 'DEV_ADD_CARD_TO_HAND', card: def })}
              className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:border-white hover:text-white transition-colors"
            >
              {def.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-2">Set staged enemy card</div>
        <div className="flex gap-2 flex-wrap">
          {DEV_ENEMY_CARDS.map(def => (
            <button key={def.id}
              onClick={() => dispatch({ type: 'DEV_SET_ENEMY_CARD', card: def })}
              className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:border-red-400 hover:text-red-300 transition-colors"
            >
              {def.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LogTab({ log }: { log: string[] }) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto max-h-96">
      {[...log].reverse().map((entry, i) => (
        <div key={log.length - 1 - i} className="text-xs text-zinc-300 border-b border-zinc-800 pb-1">
          {entry}
        </div>
      ))}
    </div>
  );
}

function ConfigTab({ state }: { state: CombatState }) {
  const [copied, setCopied] = useState(false);

  const encounterJson = JSON.stringify(state.config, null, 2);

  const handleDownload = () => {
    const blob = new Blob([encounterJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.config.id || 'encounter'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(encounterJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 overflow-auto max-h-96">
      <div className="flex gap-2">
        <button onClick={handleDownload}
          className="text-xs px-3 py-1.5 border border-blue-500 text-blue-400 hover:bg-blue-900 rounded transition-colors">
          Download JSON
        </button>
        <button onClick={handleCopy}
          className={`text-xs px-3 py-1.5 border rounded transition-colors
            ${copied ? 'border-green-500 text-green-400' : 'border-zinc-500 text-zinc-400 hover:border-white hover:text-white'}`}>
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap">
        {JSON.stringify({ combatConfig: state.combatConfig, encounterConfig: state.config }, null, 2)}
      </pre>
    </div>
  );
}

function CardCreatorTab({ dispatch }: { dispatch: (a: CombatAction) => void }) {
  const [name, setName] = useState('Test Card');
  const [cost, setCost] = useState(1);
  const [color, setColor] = useState<ColorIdentity>('Red');
  const [supertype, setSupertype] = useState<CardSupertype>('Skill');
  const [subtype, setSubtype] = useState<CardSubtype>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [effectText, setEffectText] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [effects, setEffects] = useState<CardEffect[]>([{ type: 'MODIFY_PRIORITY', value: 1 }]);

  const toggleKw = (kw: Keyword) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  const addEffect = () => setEffects(prev => [...prev, { type: 'MODIFY_PRIORITY', value: 1 }]);
  const removeEffect = (i: number) => setEffects(prev => prev.filter((_, j) => j !== i));
  const updateEffectType = (i: number, t: CardEffectType) =>
    setEffects(prev => prev.map((e, j) => j === i ? { ...e, type: t } : e));
  const updateEffectValue = (i: number, v: number) =>
    setEffects(prev => prev.map((e, j) => j === i ? { ...e, value: v } : e));

  const handleAdd = () => {
    const card: CardDefinition = {
      id: `dev_custom_${Date.now()}`,
      name, cost, color, supertype, subtype, keywords, effects, effectText, longDescription,
    };
    dispatch({ type: 'DEV_ADD_CARD_TO_HAND', card });
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-96">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Name</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Cost</span>
          <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Color</span>
          <select value={color} onChange={e => setColor(e.target.value as ColorIdentity)}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white">
            {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Supertype</span>
          <select value={supertype} onChange={e => setSupertype(e.target.value as CardSupertype)}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white">
            {SUPERTYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Subtype</span>
          <select value={subtype ?? ''} onChange={e => setSubtype(e.target.value === '' ? null : e.target.value as CardSubtype)}
            className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white">
            {SUBTYPES.map(s => <option key={s ?? 'null'} value={s ?? ''}>{s ?? '(none)'}</option>)}
          </select>
        </label>
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-1">Keywords</div>
        <div className="flex gap-2 flex-wrap">
          {KEYWORDS.map(kw => (
            <label key={kw} className="flex items-center gap-1 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={keywords.includes(kw)} onChange={() => toggleKw(kw)} />
              {kw}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-zinc-500">Effects</span>
          <button onClick={addEffect} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
        </div>
        {effects.map((eff, i) => (
          <div key={i} className="flex gap-2 items-center mb-1">
            <select value={eff.type} onChange={e => updateEffectType(i, e.target.value as CardEffectType)}
              className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white flex-1">
              {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" value={eff.value ?? 0} onChange={e => updateEffectValue(i, Number(e.target.value))}
              className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white w-12" />
            <button onClick={() => removeEffect(i)} className="text-xs text-red-500 hover:text-red-400">✕</button>
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effect Text</span>
        <input value={effectText} onChange={e => setEffectText(e.target.value)}
          placeholder="Short text shown on card face"
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Long Description</span>
        <input value={longDescription} onChange={e => setLongDescription(e.target.value)}
          placeholder="Detailed description for hover/details"
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>

      <button onClick={handleAdd}
        className="text-xs px-4 py-2 border border-blue-500 text-blue-400 hover:bg-blue-900 rounded transition-colors">
        Add to Hand
      </button>
    </div>
  );
}

function RelevantCardCreatorTab({ dispatch }: { dispatch: (a: CombatAction) => void }) {
  const [cardId, setCardId] = useState('info_example');
  const [effectDescription, setEffectDescription] = useState('');
  const [discovered, setDiscovered] = useState(false);
  const [effectsJson, setEffectsJson] = useState('[]');
  const [error, setError] = useState('');

  const handleAdd = () => {
    let effects: CardEffect[];
    try {
      effects = JSON.parse(effectsJson) as CardEffect[];
      setError('');
    } catch {
      setError('Invalid JSON');
      return;
    }
    const rc: RelevantCard = { cardId, effectDescription, discovered, effects };
    dispatch({ type: 'DEV_ADD_RELEVANT_CARD', card: rc });
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-96">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Card ID</span>
        <input value={cardId} onChange={e => setCardId(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effect Description</span>
        <input value={effectDescription} onChange={e => setEffectDescription(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effects (JSON)</span>
        <textarea value={effectsJson} onChange={e => setEffectsJson(e.target.value)} rows={3}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white font-mono" />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </label>
      <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
        <input type="checkbox" checked={discovered} onChange={e => setDiscovered(e.target.checked)} />
        Discovered
      </label>
      <button onClick={handleAdd}
        className="text-xs px-4 py-2 border border-green-600 text-green-400 hover:bg-green-900 rounded transition-colors">
        Add to Encounter
      </button>
    </div>
  );
}

export default function DevPanel({ open, onClose, state, dispatch, onLoadEncounter }: Props) {
  const [tab, setTab] = useState<Tab>('State');

  const tabs: Tab[] = ['State', 'Log', 'Config', 'Cards', 'RelevantCards', 'Encounters', 'Collection'];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed right-0 top-0 bottom-0 w-80 lg:w-96 xl:w-[28rem] 2xl:w-[32rem] bg-zinc-900 border-l border-zinc-700 z-40 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-3 lg:px-4 py-2 lg:py-3 border-b border-zinc-800">
            <span className="text-xs lg:text-sm font-bold text-zinc-400 uppercase tracking-widest">Dev Panel</span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
                title="Close dev panel"
              >
                ✕
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            {tabs.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs lg:text-sm py-2 lg:py-2.5 transition-colors
                  ${tab === t ? 'text-white border-b-2 border-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t === 'RelevantCards' ? 'RC' : t === 'Encounters' ? 'Enc' : t === 'Collection' ? 'Col' : t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 lg:p-4 xl:p-5 text-sm lg:text-base [&_*]:lg:text-sm [&_.text-xs]:lg:text-sm">
            {tab === 'State' && <StateTab state={state} dispatch={dispatch} />}
            {tab === 'Log' && <LogTab log={state.actionLog} />}
            {tab === 'Config' && <ConfigTab state={state} />}
            {tab === 'Cards' && <CardCreatorTab dispatch={dispatch} />}
            {tab === 'RelevantCards' && <RelevantCardCreatorTab dispatch={dispatch} />}
            {tab === 'Encounters' && <EncounterEditor onLoadEncounter={onLoadEncounter} />}
            {tab === 'Collection' && <CardCollection dispatch={dispatch} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
