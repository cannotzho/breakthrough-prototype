import { useState, useMemo } from 'react';
import {
  CardDefinition, CombatAction, InfoNugget,
} from '../../combat/types';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../../data/devCards';
import { useDevCardStore } from '../../stores/collectionStore';
import { useNuggetStore } from '../../stores/nuggetStore';
import SupabaseStatus from './SupabaseStatus';
import CardForm, { BTN } from './CardEditorForm';
import CardGalleryGrid from './CardGalleryGrid';

type View = 'gallery' | 'create' | 'edit';

interface CardCollectionProps {
  dispatch?: (action: CombatAction) => void;
}

export default function CardCollection({ dispatch }: CardCollectionProps) {
  const { addCard, updateCard, getAllCards, loading, error, importFromLocalStorage } = useDevCardStore();
  const { addNugget, setDefaultCardId } = useNuggetStore();
  const [view, setView] = useState<View>('gallery');
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [saved, setSaved] = useState(false);

  const builtInCards = [...DEV_SKILL_CARDS, ...DEV_ENEMY_CARDS];
  const customCards = getAllCards();

  const allCards = useMemo(() => [
    ...customCards.map(c => ({ card: c, builtIn: false })),
    ...builtInCards.map(c => ({ card: c, builtIn: true })),
  ], [customCards, builtInCards]);

  const cardList = useMemo(() => allCards.map(({ card }) => card), [allCards]);

  const builtInIds = useMemo(() => new Set(builtInCards.map(c => c.id)), [builtInCards]);

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

  const handleEdit = (card: CardDefinition) => {
    const isBuiltIn = builtInIds.has(card.id);
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
        {dispatch && (
          <span className="text-xs text-zinc-600 self-center">Click a card to edit · right-click info below</span>
        )}
        {saved && <span className="text-xs text-green-400 self-center">Saved!</span>}
      </div>

      <div className="text-xs text-zinc-500">
        {customCards.length} custom &middot; {builtInCards.length} built-in
      </div>

      <CardGalleryGrid
        cards={cardList}
        onCardClick={(card) => handleEdit(card)}
        filter={filter}
        onFilterChange={setFilter}
        filterPlaceholder="Filter cards by name, id, color, type..."
        renderOverlay={(card) => {
          if (builtInIds.has(card.id)) {
            return (
              <span className="flex items-center justify-center px-1.5 py-0.5 rounded-full bg-zinc-600 text-zinc-300 text-[9px] font-medium">
                built-in
              </span>
            );
          }
          return null;
        }}
        emptyMessage="No cards match filter."
      />
    </div>
  );
}
