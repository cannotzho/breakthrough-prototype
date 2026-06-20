import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CombatState, CombatAction, CombatPhase,
  CardDefinition, ColorIdentity, CardSupertype, CardSubtype, Keyword, CardEffectType,
  NuggetOverride, CardEffect,
} from '../../combat/types';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../../data/devCards';
import EncounterEditor from './EncounterEditor';
import CardCollection from './CardCollection';
import DeckBuilder from './DeckBuilder';

type View = 'State' | 'Cards' | 'NuggetOvr' | 'Encounters' | 'Collection' | 'Decks';

const VIEW_META: { id: View; label: string; icon: string }[] = [
  { id: 'State',       label: 'State',       icon: '⚙' },
  { id: 'Cards',       label: 'Cards',       icon: '🃏' },
  { id: 'NuggetOvr',   label: 'Nuggets',     icon: '💎' },
  { id: 'Encounters',  label: 'Encounters',  icon: '⚔' },
  { id: 'Collection',  label: 'Collection',  icon: '📦' },
  { id: 'Decks',       label: 'Decks',       icon: '📚' },
];

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

function EnemyCardPicker({ state, dispatch }: { state: CombatState; dispatch: (a: CombatAction) => void }) {
  if (state.phase !== 'EnemyPending' || state.enemyDeck.length === 0) return null;
  return (
    <div className="border border-red-700 rounded p-2 bg-red-950/30">
      <div className="text-xs text-red-400 font-bold mb-2">
        Pick enemy card ({state.enemyDeck.length} in deck)
      </div>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {state.enemyDeck.map((inst, i) => (
          <button key={inst.instanceId}
            onClick={() => dispatch({ type: 'DEV_PICK_ENEMY_FROM_DECK', instanceId: inst.instanceId })}
            className="text-left text-xs px-2 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:border-red-400 hover:text-red-300 hover:bg-red-950/50 transition-colors flex justify-between items-center"
          >
            <span>{i === 0 && <span className="text-zinc-500 mr-1">[top]</span>}{inst.definition.name}</span>
            <span className="text-zinc-500 text-[10px]">{inst.definition.color}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StateView({ state, dispatch }: { state: CombatState; dispatch: (a: CombatAction) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={state.manualEnemyMode}
            onChange={e => dispatch({ type: 'DEV_SET_MANUAL_ENEMY', enabled: e.target.checked })} />
          <span className="text-xs text-red-400 font-bold">Manual Enemy</span>
        </label>
      </div>

      {state.manualEnemyMode && <EnemyCardPicker state={state} dispatch={dispatch} />}

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

      {state.discoveredNuggetIds.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-2">Discovered Nuggets</div>
          <div className="flex gap-1 flex-wrap">
            {state.discoveredNuggetIds.map(id => (
              <span key={id} className="text-xs px-2 py-0.5 rounded border border-amber-700 text-amber-400 bg-amber-950/30">{id}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardCreatorView({ dispatch }: { dispatch: (a: CombatAction) => void }) {
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
    <div className="flex flex-col gap-3">
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

function NuggetOverrideCreatorView({ dispatch }: { dispatch: (a: CombatAction) => void }) {
  const [nuggetId, setNuggetId] = useState('');
  const [effectText, setEffectText] = useState('');
  const [effectsJson, setEffectsJson] = useState('[{"type":"MODIFY_PATIENCE","value":-1}]');
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
    const overrideCardDef: CardDefinition = {
      id: `override_${nuggetId}_${Date.now()}`,
      name: `Override for ${nuggetId}`,
      cost: 0,
      keywords: [],
      effects,
      color: 'Colorless',
      supertype: 'Information',
      subtype: null,
      effectText,
      nuggetId,
    };
    const override: NuggetOverride = { nuggetId, overrideCardDef };
    dispatch({ type: 'DEV_ADD_NUGGET_OVERRIDE', override });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Nugget ID</span>
        <input value={nuggetId} onChange={e => setNuggetId(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effect Text</span>
        <input value={effectText} onChange={e => setEffectText(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effects (JSON)</span>
        <textarea value={effectsJson} onChange={e => setEffectsJson(e.target.value)} rows={3}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white font-mono" />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </label>
      <button onClick={handleAdd}
        className="text-xs px-4 py-2 border border-amber-600 text-amber-400 hover:bg-amber-900 rounded transition-colors">
        Add Nugget Override to Combat
      </button>
    </div>
  );
}

function LogDrawer({ log, expanded, onToggle }: { log: string[]; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-t border-zinc-700 bg-zinc-900 flex flex-col shrink-0">
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Log</span>
          <span className="text-[10px] text-zinc-600">{log.length} entries</span>
        </div>
        <span className="text-xs text-zinc-500">{expanded ? '▼' : '▲'}</span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 overflow-y-auto max-h-52 px-3 pb-2">
          {log.length === 0 && (
            <div className="text-xs text-zinc-600 py-2">No log entries yet</div>
          )}
          {[...log].reverse().map((entry, i) => (
            <div key={log.length - 1 - i} className="text-xs text-zinc-300 border-b border-zinc-800 pb-0.5">
              {entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DevPanel({ open, onClose, state, dispatch, onLoadEncounter }: Props) {
  const [activeView, setActiveView] = useState<View>('State');
  const [logExpanded, setLogExpanded] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed right-0 top-0 bottom-0 w-[36rem] bg-zinc-900 border-l border-zinc-700 z-40 flex flex-col shadow-2xl"
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Dev Panel</span>
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

          {/* Main body: sidebar + content */}
          <div className="flex flex-1 min-h-0">
            {/* Activity bar (VS Code-style sidebar) */}
            <div className="w-11 shrink-0 border-r border-zinc-800 flex flex-col items-center py-2 gap-1 bg-zinc-950">
              {VIEW_META.map(v => (
                <button
                  key={v.id}
                  onClick={() => setActiveView(v.id)}
                  title={v.label}
                  className={`w-9 h-9 flex items-center justify-center rounded text-sm transition-colors
                    ${activeView === v.id
                      ? 'bg-zinc-800 text-white border-l-2 border-blue-400'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                >
                  {v.icon}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* View header */}
              <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
                <span className="text-xs text-zinc-500 uppercase tracking-widest">
                  {VIEW_META.find(v => v.id === activeView)?.label}
                </span>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-3">
                {activeView === 'State' && <StateView state={state} dispatch={dispatch} />}
                {activeView === 'Cards' && <CardCreatorView dispatch={dispatch} />}
                {activeView === 'NuggetOvr' && <NuggetOverrideCreatorView dispatch={dispatch} />}
                {activeView === 'Encounters' && <EncounterEditor onLoadEncounter={onLoadEncounter} />}
                {activeView === 'Collection' && <CardCollection dispatch={dispatch} />}
                {activeView === 'Decks' && <DeckBuilder hideCardEditor />}
              </div>

              {/* Log drawer at bottom */}
              <LogDrawer
                log={state.actionLog}
                expanded={logExpanded}
                onToggle={() => setLogExpanded(e => !e)}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
