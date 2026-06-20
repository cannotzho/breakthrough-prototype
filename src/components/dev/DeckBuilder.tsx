import { useState, useMemo } from 'react';
import { CardDefinition, DeckDefinition, InfoNugget } from '../../combat/types';
import { useDeckStore } from '../../stores/deckStore';
import { useDevCardStore } from '../../stores/collectionStore';
import { useNuggetStore } from '../../stores/nuggetStore';
import CardForm, { INPUT, BTN } from './CardEditorForm';

function emptyDeck(): DeckDefinition {
  return { id: `deck_${Date.now()}`, name: '', description: '', cards: [] };
}

export default function DeckBuilder() {
  const { getAllDecks, addDeck, updateDeck, removeDeck, loading, error } = useDeckStore();
  const { addCard, updateCard, getAllCards } = useDevCardStore();
  const cardMap = useDevCardStore((s) => s.cards);
  const cardsLoading = useDevCardStore((s) => s.loading);
  const { addNugget, setDefaultCardId } = useNuggetStore();

  const [editing, setEditing] = useState<DeckDefinition>(emptyDeck());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [cardEditorOpen, setCardEditorOpen] = useState(true);
  const [editingCard, setEditingCard] = useState<CardDefinition | null>(null);
  const [editingCardOriginalId, setEditingCardOriginalId] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState(false);

  const decks = getAllDecks();
  const customCards = getAllCards();
  const skillCards = useMemo(
    () => Object.values(cardMap).filter((c) => c.supertype === 'Skill').sort((a, b) => a.name.localeCompare(b.name)),
    [cardMap],
  );

  const usedCardIds = new Set(editing.cards.map((e) => e.cardId));
  const availableCards = skillCards.filter((c) => !usedCardIds.has(c.id));

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const flashCardSaved = () => {
    setCardSaved(true);
    setTimeout(() => setCardSaved(false), 2000);
  };

  const handleLoad = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    setEditing({ ...deck, cards: deck.cards.map((c) => ({ ...c })) });
    setLoadedId(deck.id);
    setValidationError('');
  };

  const handleNew = () => {
    setEditing(emptyDeck());
    setLoadedId(null);
    setValidationError('');
  };

  const handleSave = () => {
    if (!editing.name.trim()) {
      setValidationError('Deck name is required.');
      return;
    }
    setValidationError('');
    const cleaned: DeckDefinition = {
      ...editing,
      name: editing.name.trim(),
      cards: editing.cards.filter((c) => c.quantity > 0),
    };
    if (loadedId) {
      updateDeck(loadedId, cleaned);
    } else {
      addDeck(cleaned);
    }
    setLoadedId(cleaned.id);
    flashSaved();
  };

  const handleDelete = () => {
    if (!loadedId) return;
    removeDeck(loadedId);
    handleNew();
  };

  const addCardEntry = (cardId: string) => {
    const existing = editing.cards.find((c) => c.cardId === cardId);
    if (existing) {
      setEditing({
        ...editing,
        cards: editing.cards.map((c) => (c.cardId === cardId ? { ...c, quantity: c.quantity + 1 } : c)),
      });
    } else {
      setEditing({ ...editing, cards: [...editing.cards, { cardId, quantity: 1 }] });
    }
  };

  const setQuantity = (cardId: string, qty: number) => {
    if (qty <= 0) {
      setEditing({ ...editing, cards: editing.cards.filter((c) => c.cardId !== cardId) });
    } else {
      setEditing({
        ...editing,
        cards: editing.cards.map((c) => (c.cardId === cardId ? { ...c, quantity: qty } : c)),
      });
    }
  };

  const removeEntry = (cardId: string) => {
    setEditing({ ...editing, cards: editing.cards.filter((c) => c.cardId !== cardId) });
  };

  const resolveCardName = (cardId: string) => {
    return cardMap[cardId]?.name ?? cardId;
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

  const totalCards = editing.cards.reduce((sum, c) => sum + c.quantity, 0);

  if (loading || cardsLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
        <span className="inline-block w-3 h-3 border-2 border-zinc-500 border-t-blue-400 rounded-full animate-spin" />
        Loading {loading && cardsLoading ? 'decks & cards' : loading ? 'decks' : 'cards'}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-2 py-1.5">
        Supabase error: {error}
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left column — Deck Builder */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
        {/* Deck selector */}
        <div className="flex gap-2 items-end">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-zinc-500">Load Deck</span>
            <select
              value={loadedId ?? ''}
              onChange={(e) => {
                if (e.target.value) handleLoad(e.target.value);
              }}
              className={INPUT}
            >
              <option value="">— Select a deck —</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.id}
                </option>
              ))}
            </select>
          </label>
          <button onClick={handleNew} className={`${BTN} border-blue-500 text-blue-400 hover:bg-blue-900`}>
            + New
          </button>
        </div>

        {/* ID / Name / Description */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Deck ID</span>
          <input
            value={editing.id}
            onChange={(e) => setEditing({ ...editing, id: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Name</span>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="e.g. Red Starter Deck"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Description</span>
          <textarea
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="Describe this deck's archetype, color identity, playstyle..."
            className={`${INPUT} resize-y`}
            rows={2}
          />
        </label>

        {/* Card list */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-zinc-500">
              Cards ({editing.cards.length} unique · {totalCards} total)
            </span>
          </div>

          {editing.cards.length > 0 && (
            <div className="flex flex-col gap-1 mb-3">
              {editing.cards.map((entry) => (
                <div key={entry.cardId} className="flex items-center gap-2 border border-zinc-700 rounded px-2 py-1">
                  <span className="text-xs text-white flex-1 truncate">{resolveCardName(entry.cardId)}</span>
                  <span className="text-xs text-zinc-500">{entry.cardId}</span>
                  <button
                    onClick={() => setQuantity(entry.cardId, entry.quantity - 1)}
                    className="text-xs text-zinc-400 hover:text-white px-1"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={entry.quantity}
                    onChange={(e) => setQuantity(entry.cardId, Math.max(0, Number(e.target.value)))}
                    className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-white w-10 text-center"
                    min={0}
                  />
                  <button
                    onClick={() => setQuantity(entry.cardId, entry.quantity + 1)}
                    className="text-xs text-zinc-400 hover:text-white px-1"
                  >
                    +
                  </button>
                  <button onClick={() => removeEntry(entry.cardId)} className="text-xs text-red-500 hover:text-red-400">
                    ✕
                  </button>
                  {/* Edit card button */}
                  {cardMap[entry.cardId] && (
                    <button
                      onClick={() => handleCardEdit(cardMap[entry.cardId])}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add card dropdown */}
          {availableCards.length > 0 ? (
            <div className="flex gap-2 items-end">
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    addCardEntry(e.target.value);
                    e.target.value = '';
                  }
                }}
                className={`${INPUT} flex-1`}
              >
                <option value="">+ Add a skill card...</option>
                {availableCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-zinc-500">
              {skillCards.length === 0 ? 'No skill cards in the collection yet.' : 'All skill cards added.'}
            </div>
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="text-xs text-red-400">{validationError}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 items-center">
          <button
            onClick={handleSave}
            className={`${BTN} border-green-600 text-green-400 hover:bg-green-900 flex-1`}
          >
            {loadedId ? 'Save Changes' : 'Create Deck'}
          </button>
          {loadedId && (
            <button
              onClick={handleDelete}
              className={`${BTN} border-red-600 text-red-400 hover:bg-red-900`}
            >
              Delete
            </button>
          )}
          {saved && <span className="text-xs text-green-400">Saved!</span>}
        </div>
      </div>

      {/* Right column — Card Creator */}
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
            {/* Quick list of custom cards for editing */}
            {customCards.length > 0 && !editingCard && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Custom cards ({customCards.length})</span>
                <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                  {customCards.map((c) => (
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
    </div>
  );
}
