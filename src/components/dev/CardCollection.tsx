import { useState } from 'react';
import {
  CardDefinition, ColorIdentity, CombatAction, InfoNugget,
} from '../../combat/types';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../../data/devCards';
import { useDevCardStore } from '../../stores/collectionStore';
import { useNuggetStore } from '../../stores/nuggetStore';
import SupabaseStatus from './SupabaseStatus';
import CardForm, { INPUT, BTN } from './CardEditorForm';

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

function CardGalleryItem({ card, isBuiltIn, onEdit, onDelete, onAddToHand, nuggetName }: {
  card: CardDefinition;
  isBuiltIn: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onAddToHand?: () => void;
  nuggetName?: string;
}) {
  const badgeClass = COLOR_BADGE[card.color] ?? COLOR_BADGE.Colorless;
  const displayText = card.supertype === 'Skill'
    ? [
        ...card.keywords,
        card.effectText ?? card.description ?? '',
      ].filter(Boolean).join('\n')
    : card.effectText ?? card.description ?? '';

  return (
    <div className="border border-zinc-700 rounded p-2 flex flex-col gap-1 hover:border-zinc-500 transition-colors group relative">
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs text-white font-medium truncate">{card.name}</span>
        <span className="text-xs text-zinc-500 shrink-0">{card.cost}</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        <span className={`text-xs px-1 rounded border ${badgeClass}`}>{card.color}</span>
        <span className="text-xs px-1 rounded border border-zinc-600 text-zinc-400">{card.supertype}</span>
        {card.nuggetId && (
          <span className="text-xs px-1 rounded border border-amber-700 text-amber-400">{nuggetName ?? card.nuggetId}</span>
        )}
        {card.keywords.map(kw => (
          <span key={kw} className="text-xs px-1 rounded border border-zinc-600 text-zinc-400">{kw}</span>
        ))}
      </div>
      {displayText && (
        <p className="text-xs text-zinc-400 line-clamp-3 whitespace-pre-line">{displayText}</p>
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
      {card.longDescription && (
        <div className="absolute z-40 bottom-full left-0 mb-1 w-64 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-xs text-zinc-200 leading-relaxed pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          {card.longDescription}
        </div>
      )}
    </div>
  );
}

type View = 'gallery' | 'create' | 'edit';

interface CardCollectionProps {
  dispatch?: (action: CombatAction) => void;
}

export default function CardCollection({ dispatch }: CardCollectionProps) {
  const { addCard, updateCard, removeCard, getAllCards, loading, error, importFromLocalStorage } = useDevCardStore();
  const { addNugget, setDefaultCardId, getNugget } = useNuggetStore();
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

  const handleCreate = (card: CardDefinition, nugget?: InfoNugget) => {
    if (nugget) {
      addNugget(nugget);
      addCard(card);
      setDefaultCardId(nugget.id, card.id);
    } else {
      addCard(card);
    }
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

  const handleSaveEdit = (card: CardDefinition, nugget?: InfoNugget) => {
    if (nugget) {
      addNugget(nugget);
      if (editingOriginalId) {
        updateCard(editingOriginalId, card);
      } else {
        addCard(card);
      }
      setDefaultCardId(nugget.id, card.id);
    } else if (editingOriginalId) {
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
      <SupabaseStatus
        loading={loading}
        error={error}
        table="cards"
        importFromLocalStorage={importFromLocalStorage}
      />

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
            onAddToHand={dispatch ? () => dispatch({ type: 'DEV_ADD_CARD_TO_HAND', card }) : undefined}
            nuggetName={card.nuggetId ? getNugget(card.nuggetId)?.name : undefined}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-zinc-500 text-center py-4">No cards match filter</div>
        )}
      </div>
    </div>
  );
}
