import { useState, useEffect } from 'react';
import {
  CardDefinition, ColorIdentity, CardSupertype, CardSubtype, Keyword,
  CardEffectType, CardEffect, InfoNugget,
} from '../../combat/types';
import { useNuggetStore } from '../../stores/nuggetStore';

export const INPUT = 'text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white';
export const BTN = 'text-xs px-3 py-1.5 rounded border transition-colors';

const COLORS: ColorIdentity[] = ['Red', 'Blue', 'Green', 'White', 'Black', 'Orange', 'Purple', 'Colorless'];
const SUPERTYPES: CardSupertype[] = ['Skill', 'Information'];
const SUBTYPES: CardSubtype[] = [null, 'Impression', 'Trap', 'Token'];
const KEYWORDS: Keyword[] = ['Safety', 'Assemble', 'Shield Trigger', 'Lie', 'Trap'];
const EFFECT_TYPES: CardEffectType[] = [
  'BREAK_OPPONENT_SHIELD', 'MODIFY_PRIORITY',
  'MODIFY_PATIENCE', 'DRAW_CARDS', 'PLACE_AS_SHIELD', 'INCREMENT_LIE_COUNTER', 'PLACE_IMPRESSION',
  'CREATE_TOKEN', 'DESTROY_SELF',
];

function NuggetCreator({ onCreated, onCancel }: {
  onCreated: (nugget: InfoNugget) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [longDescription, setLongDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  return (
    <div className="border border-amber-700 rounded p-3 flex flex-col gap-2 bg-amber-950/20">
      <div className="text-xs text-amber-400 uppercase tracking-widest">New Info Nugget</div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Nugget ID</span>
        <input value={id} onChange={e => { setId(e.target.value); setIdManuallyEdited(true); }} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Name</span>
        <input value={name} onChange={e => {
          setName(e.target.value);
          if (!idManuallyEdited) setId(`nugget_${slugify(e.target.value)}`);
        }} className={INPUT} placeholder="Nugget display name" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Long Description</span>
        <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)}
          className={`${INPUT} resize-y`} rows={2} placeholder="Lore / story description" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Image URL (optional)</span>
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} className={INPUT} />
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!id || !name) return;
            onCreated({ id, name, longDescription, imageUrl: imageUrl || undefined });
          }}
          className={`${BTN} border-amber-500 text-amber-400 hover:bg-amber-900 flex-1`}
          disabled={!id || !name}
        >
          Create Nugget
        </button>
        <button onClick={onCancel} className={`${BTN} border-zinc-500 text-zinc-400 hover:border-white hover:text-white`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    || `card_${Date.now()}`;
}

export interface CardFormProps {
  initial?: CardDefinition;
  onSubmit: (card: CardDefinition, nugget?: InfoNugget) => void;
  submitLabel: string;
  onCancel?: () => void;
}

export default function CardForm({ initial, onSubmit, submitLabel, onCancel }: CardFormProps) {
  const { getAllNuggets } = useNuggetStore();
  const allNuggets = getAllNuggets();

  const [id, setId] = useState(initial?.id ?? slugify('New Card'));
  const [name, setName] = useState(initial?.name ?? 'New Card');
  const [idManuallyEdited, setIdManuallyEdited] = useState(!!initial);
  const [cost, setCost] = useState(initial?.cost ?? 1);
  const [color, setColor] = useState<ColorIdentity>(initial?.color ?? 'Red');
  const [supertype, setSupertype] = useState<CardSupertype>(initial?.supertype ?? 'Skill');
  const [subtype, setSubtype] = useState<CardSubtype>(initial?.subtype ?? null);
  const [keywords, setKeywords] = useState<Keyword[]>(initial?.keywords ?? []);
  const [effectText, setEffectText] = useState(initial?.effectText ?? initial?.description ?? '');
  const [longDescription, setLongDescription] = useState(initial?.longDescription ?? '');
  const [effects, setEffects] = useState<CardEffect[]>(initial?.effects ?? [{ type: 'MODIFY_PRIORITY', value: 1 }]);
  const [nuggetId, setNuggetId] = useState<string>(initial?.nuggetId ?? '');
  const [creatingNugget, setCreatingNugget] = useState(false);
  const [pendingNugget, setPendingNugget] = useState<InfoNugget | null>(null);

  const isInfo = supertype === 'Information';
  const selectedNugget = pendingNugget ?? allNuggets.find(n => n.id === nuggetId);

  useEffect(() => {
    if (initial) {
      setId(initial.id);
      setName(initial.name);
      setIdManuallyEdited(true);
      setCost(initial.cost);
      setColor(initial.color);
      setSupertype(initial.supertype);
      setSubtype(initial.subtype);
      setKeywords([...initial.keywords]);
      setEffectText(initial.effectText ?? initial.description ?? '');
      setLongDescription(initial.longDescription ?? '');
      setEffects([...initial.effects]);
      setNuggetId(initial.nuggetId ?? '');
      setPendingNugget(null);
    }
  }, [initial]);

  useEffect(() => {
    if (selectedNugget && isInfo) {
      setName(selectedNugget.name);
      setLongDescription(selectedNugget.longDescription);
      if (!idManuallyEdited) setId(slugify(selectedNugget.name));
    }
  }, [selectedNugget, isInfo]);

  const toggleKw = (kw: Keyword) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  const handleSubmit = () => {
    const card: CardDefinition = {
      id, name, cost, color, supertype, subtype, keywords, effects, effectText, longDescription,
      ...(isInfo && nuggetId ? { nuggetId } : {}),
    };
    onSubmit(card, pendingNugget ?? undefined);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">ID</span>
          <input value={id} onChange={e => { setId(e.target.value); setIdManuallyEdited(true); }} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Supertype</span>
          <select value={supertype} onChange={e => {
            const st = e.target.value as CardSupertype;
            setSupertype(st);
            if (st !== 'Information') {
              setNuggetId('');
              setPendingNugget(null);
            }
          }} className={INPUT}>
            {SUPERTYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {/* Nugget selection for Information cards */}
      {isInfo && (
        <div className="border border-amber-700/50 rounded p-2 flex flex-col gap-2 bg-amber-950/10">
          <div className="text-xs text-amber-400 uppercase tracking-widest">Info Nugget</div>
          {creatingNugget ? (
            <NuggetCreator
              onCreated={(nugget) => {
                setPendingNugget(nugget);
                setNuggetId(nugget.id);
                setCreatingNugget(false);
              }}
              onCancel={() => setCreatingNugget(false)}
            />
          ) : (
            <div className="flex gap-2 items-end">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-zinc-500">Select Nugget</span>
                <select value={nuggetId} onChange={e => {
                  setNuggetId(e.target.value);
                  setPendingNugget(null);
                }} className={INPUT}>
                  <option value="">— Select —</option>
                  {allNuggets.map(n => (
                    <option key={n.id} value={n.id}>{n.name} ({n.id})</option>
                  ))}
                  {pendingNugget && !allNuggets.find(n => n.id === pendingNugget.id) && (
                    <option value={pendingNugget.id}>{pendingNugget.name} (new)</option>
                  )}
                </select>
              </label>
              <button onClick={() => setCreatingNugget(true)}
                className={`${BTN} border-amber-500 text-amber-400 hover:bg-amber-900`}>
                + New
              </button>
            </div>
          )}
          {selectedNugget && (
            <div className="text-xs text-zinc-400">
              <span className="text-zinc-500">Name:</span> {selectedNugget.name}
              {selectedNugget.longDescription && (
                <> · <span className="text-zinc-500">Desc:</span> {selectedNugget.longDescription.slice(0, 80)}{selectedNugget.longDescription.length > 80 ? '…' : ''}</>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Name{isInfo && selectedNugget ? ' (from nugget)' : ''}</span>
          <input value={name} onChange={e => {
              setName(e.target.value);
              if (!idManuallyEdited) setId(slugify(e.target.value));
            }} className={INPUT}
            disabled={isInfo && !!selectedNugget} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Cost</span>
          <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Color</span>
          <select value={color} onChange={e => setColor(e.target.value as ColorIdentity)} className={INPUT}>
            {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Subtype</span>
          <select value={subtype ?? ''} onChange={e => setSubtype(e.target.value === '' ? null : e.target.value as CardSubtype)} className={INPUT}>
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
          <button onClick={() => setEffects(prev => [...prev, { type: 'MODIFY_PRIORITY', value: 1 }])}
            className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
        </div>
        {effects.map((eff, i) => (
          <div key={i} className="flex gap-2 items-center mb-1">
            <select value={eff.type}
              onChange={e => setEffects(prev => prev.map((e2, j) => j === i ? { ...e2, type: e.target.value as CardEffectType } : e2))}
              className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white flex-1">
              {EFFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" value={eff.value ?? 0}
              onChange={e => setEffects(prev => prev.map((e2, j) => j === i ? { ...e2, value: Number(e.target.value) } : e2))}
              className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white w-12" />
            <button onClick={() => setEffects(prev => prev.filter((_, j) => j !== i))}
              className="text-xs text-red-500 hover:text-red-400">✕</button>
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Effect Text</span>
        <input value={effectText} onChange={e => setEffectText(e.target.value)} className={INPUT}
          placeholder="Short text shown on the card face" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Long Description{isInfo && selectedNugget ? ' (from nugget)' : ''}</span>
        <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)}
          className={`${INPUT} resize-y`} rows={2}
          placeholder="Detailed description shown in Details view and hover tooltip"
          disabled={isInfo && !!selectedNugget} />
      </label>

      <div className="flex gap-2">
        <button onClick={handleSubmit}
          className={`${BTN} border-blue-500 text-blue-400 hover:bg-blue-900 flex-1`}
          disabled={isInfo && !nuggetId}>
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className={`${BTN} border-zinc-500 text-zinc-400 hover:border-white hover:text-white`}>
            Cancel
          </button>
        )}
      </div>
      {isInfo && !nuggetId && (
        <div className="text-xs text-amber-400">Information cards must be linked to an info nugget.</div>
      )}
    </div>
  );
}
