import { useState, useEffect } from 'react';
import {
  CardDefinition, ColorIdentity, CardSupertype, CardSubtype, Keyword,
  CardEffectType, CardEffect, CombatAction,
} from '../../combat/types';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../../data/devCards';
import { useDevCardStore } from '../../stores/collectionStore';

const COLORS: ColorIdentity[] = ['Red', 'Blue', 'Green', 'White', 'Black', 'Orange', 'Purple', 'Colorless'];
const SUPERTYPES: CardSupertype[] = ['Skill', 'Information'];
const SUBTYPES: CardSubtype[] = [null, 'Impression'];
const KEYWORDS: Keyword[] = ['Interrupt', 'Safety', 'Assemble', 'Counter', 'Lie'];
const EFFECT_TYPES: CardEffectType[] = [
  'BREAK_OPPONENT_SHIELD', 'BREAK_PLAYER_SHIELD', 'MODIFY_PRIORITY',
  'MODIFY_PATIENCE', 'DRAW_CARDS', 'PLACE_AS_SHIELD', 'INCREMENT_LIE_COUNTER', 'PLACE_IMPRESSION',
];

const INPUT = 'text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white';
const BTN = 'text-xs px-3 py-1.5 rounded border transition-colors';

const COLOR_BADGE: Record<ColorIdentity, string> = {
  Red: 'bg-red-900/50 text-red-300 border-red-700',
  Blue: 'bg-blue-900/50 text-blue-300 border-blue-700',
  Green: 'bg-green-900/50 text-green-300 border-green-700',
  White: 'bg-zinc-700/50 text-zinc-200 border-zinc-500',
  Black: 'bg-zinc-900/50 text-zinc-400 border-zinc-600',
  Orange: 'bg-orange-900/50 text-orange-300 border-orange-700',
  Purple: 'bg-purple-900/50 text-purple-300 border-purple-700',
  Colorless: 'bg-zinc-800/50 text-zinc-400 border-zinc-600',
};

interface CardFormProps {
  initial?: CardDefinition;
  onSubmit: (card: CardDefinition) => void;
  submitLabel: string;
  onCancel?: () => void;
}

function CardForm({ initial, onSubmit, submitLabel, onCancel }: CardFormProps) {
  const [id, setId] = useState(initial?.id ?? `dev_custom_${Date.now()}`);
  const [name, setName] = useState(initial?.name ?? 'New Card');
  const [cost, setCost] = useState(initial?.cost ?? 1);
  const [color, setColor] = useState<ColorIdentity>(initial?.color ?? 'Red');
  const [supertype, setSupertype] = useState<CardSupertype>(initial?.supertype ?? 'Skill');
  const [subtype, setSubtype] = useState<CardSubtype>(initial?.subtype ?? null);
  const [keywords, setKeywords] = useState<Keyword[]>(initial?.keywords ?? []);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [effects, setEffects] = useState<CardEffect[]>(initial?.effects ?? [{ type: 'MODIFY_PRIORITY', value: 1 }]);

  useEffect(() => {
    if (initial) {
      setId(initial.id);
      setName(initial.name);
      setCost(initial.cost);
      setColor(initial.color);
      setSupertype(initial.supertype);
      setSubtype(initial.subtype);
      setKeywords([...initial.keywords]);
      setDescription(initial.description ?? '');
      setEffects([...initial.effects]);
    }
  }, [initial]);

  const toggleKw = (kw: Keyword) =>
    setKeywords(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);

  const handleSubmit = () => {
    onSubmit({ id, name, cost, color, supertype, subtype, keywords, effects, description });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">ID</span>
          <input value={id} onChange={e => setId(e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />
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
          <span className="text-xs text-zinc-500">Supertype</span>
          <select value={supertype} onChange={e => setSupertype(e.target.value as CardSupertype)} className={INPUT}>
            {SUPERTYPES.map(s => <option key={s} value={s}>{s}</option>)}
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
        <span className="text-xs text-zinc-500">Description</span>
        <input value={description} onChange={e => setDescription(e.target.value)} className={INPUT} />
      </label>

      <div className="flex gap-2">
        <button onClick={handleSubmit}
          className={`${BTN} border-blue-500 text-blue-400 hover:bg-blue-900 flex-1`}>
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className={`${BTN} border-zinc-500 text-zinc-400 hover:border-white hover:text-white`}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function CardGalleryItem({ card, isBuiltIn, onEdit, onDelete, onAddToHand }: {
  card: CardDefinition;
  isBuiltIn: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onAddToHand?: () => void;
}) {
  const badgeClass = COLOR_BADGE[card.color] ?? COLOR_BADGE.Colorless;

  return (
    <div className="border border-zinc-700 rounded p-2 flex flex-col gap-1 hover:border-zinc-500 transition-colors">
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs text-white font-medium truncate">{card.name}</span>
        <span className="text-xs text-zinc-500 shrink-0">{card.cost}</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        <span className={`text-xs px-1 rounded border ${badgeClass}`}>{card.color}</span>
        <span className="text-xs px-1 rounded border border-zinc-600 text-zinc-400">{card.supertype}</span>
        {card.keywords.map(kw => (
          <span key={kw} className="text-xs px-1 rounded border border-zinc-600 text-zinc-400">{kw}</span>
        ))}
      </div>
      {card.description && (
        <p className="text-xs text-zinc-400 line-clamp-2">{card.description}</p>
      )}
      <div className="flex gap-1 mt-1">
        {!isBuiltIn && (
          <button onClick={onEdit} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
        )}
        {isBuiltIn && (
          <button onClick={onEdit} className="text-xs text-blue-400 hover:text-blue-300">Duplicate</button>
        )}
        {!isBuiltIn && onDelete && (
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400">Delete</button>
        )}
        {onAddToHand && (
          <button onClick={onAddToHand} className="text-xs text-green-400 hover:text-green-300 ml-auto">+ Hand</button>
        )}
      </div>
    </div>
  );
}

type View = 'gallery' | 'create' | 'edit';

interface CardCollectionProps {
  dispatch: (action: CombatAction) => void;
}

export default function CardCollection({ dispatch }: CardCollectionProps) {
  const { addCard, updateCard, removeCard, getAllCards } = useDevCardStore();
  const [view, setView] = useState<View>('gallery');
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [saved, setSaved] = useState(false);

  const builtInCards = [...DEV_SKILL_CARDS, ...DEV_ENEMY_CARDS];
  const customCards = getAllCards();

  const allCards = [
    ...customCards.map(c => ({ card: c, builtIn: false })),
    ...builtInCards.map(c => ({ card: c, builtIn: true })),
  ];

  const filtered = filter
    ? allCards.filter(({ card }) =>
        card.name.toLowerCase().includes(filter.toLowerCase()) ||
        card.id.toLowerCase().includes(filter.toLowerCase()) ||
        card.color.toLowerCase().includes(filter.toLowerCase()) ||
        card.supertype.toLowerCase().includes(filter.toLowerCase()))
    : allCards;

  const handleCreate = (card: CardDefinition) => {
    addCard(card);
    flashSaved();
    setView('gallery');
  };

  const handleEdit = (card: CardDefinition, isBuiltIn: boolean) => {
    if (isBuiltIn) {
      setEditingCard({ ...card, id: `${card.id}_copy_${Date.now()}`, name: `${card.name} (Copy)` });
      setEditingOriginalId(null);
      setView('create');
    } else {
      setEditingCard({ ...card });
      setEditingOriginalId(card.id);
      setView('edit');
    }
  };

  const handleSaveEdit = (card: CardDefinition) => {
    if (editingOriginalId) {
      updateCard(editingOriginalId, card);
    } else {
      addCard(card);
    }
    flashSaved();
    setEditingCard(null);
    setEditingOriginalId(null);
    setView('gallery');
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (view === 'create') {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => { setView('gallery'); setEditingCard(null); }}
          className="text-xs text-zinc-400 hover:text-white self-start">
          &larr; Back to gallery
        </button>
        <div className="text-xs text-zinc-500 uppercase tracking-widest">
          {editingCard ? 'Duplicate Card' : 'Create Card'}
        </div>
        <CardForm
          initial={editingCard ?? undefined}
          onSubmit={handleCreate}
          submitLabel="Save to Collection"
          onCancel={() => { setView('gallery'); setEditingCard(null); }}
        />
      </div>
    );
  }

  if (view === 'edit' && editingCard) {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => { setView('gallery'); setEditingCard(null); }}
          className="text-xs text-zinc-400 hover:text-white self-start">
          &larr; Back to gallery
        </button>
        <div className="text-xs text-zinc-500 uppercase tracking-widest">Edit Card</div>
        <CardForm
          initial={editingCard}
          onSubmit={handleSaveEdit}
          submitLabel="Save Changes"
          onCancel={() => { setView('gallery'); setEditingCard(null); }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button onClick={() => { setEditingCard(null); setView('create'); }}
          className={`${BTN} border-blue-500 text-blue-400 hover:bg-blue-900`}>
          + New Card
        </button>
        {saved && <span className="text-xs text-green-400 self-center">Saved!</span>}
      </div>

      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter cards..."
        className={`${INPUT} w-full`}
      />

      <div className="text-xs text-zinc-500">
        {customCards.length} custom &middot; {builtInCards.length} built-in
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map(({ card, builtIn }) => (
          <CardGalleryItem
            key={card.id}
            card={card}
            isBuiltIn={builtIn}
            onEdit={() => handleEdit(card, builtIn)}
            onDelete={builtIn ? undefined : () => removeCard(card.id)}
            onAddToHand={() => dispatch({ type: 'DEV_ADD_CARD_TO_HAND', card })}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-zinc-500 text-center py-4">No cards match filter</div>
        )}
      </div>
    </div>
  );
}
