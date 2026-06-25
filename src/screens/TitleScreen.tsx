import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CardDefinition } from '../combat/types';
import { useDeckStore } from '../stores/deckStore';
import { useDevCardStore } from '../stores/collectionStore';

interface TitleScreenProps {
  onStart: (deckDefs?: CardDefinition[]) => void;
  onCardCollection?: () => void;
  onEncounterGallery?: () => void;
  onDeckBuilder?: () => void;
}

export default function TitleScreen({ onStart, onCardCollection, onEncounterGallery, onDeckBuilder }: TitleScreenProps) {
  const decks = useDeckStore(s => s.decks);
  const allDecks = useMemo(() => Object.values(decks), [decks]);
  const getCard = useDevCardStore(s => s.getCard);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');

  const handlePlaytest = () => {
    if (!selectedDeckId) {
      onStart();
      return;
    }
    const deck = decks[selectedDeckId];
    if (!deck) { onStart(); return; }
    const defs: CardDefinition[] = [];
    for (const entry of deck.cards) {
      const card = getCard(entry.cardId);
      if (card) {
        for (let i = 0; i < entry.quantity; i++) defs.push(card);
      }
    }
    onStart(defs.length > 0 ? defs : undefined);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
      <motion.div
        className="flex flex-col items-center gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <div className="w-96 h-96 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center text-zinc-600 text-lg">
          [Splash Art]
        </div>

        <div className="text-center">
          <h1 className="text-8xl font-bold tracking-widest uppercase text-white">
            Breakthrough
          </h1>
          <p className="text-zinc-400 text-2xl mt-3 tracking-wide">
            A detective card game
          </p>
        </div>

        {allDecks.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <label className="text-xs text-zinc-500 uppercase tracking-widest">Player Deck</label>
            <select
              value={selectedDeckId}
              onChange={e => setSelectedDeckId(e.target.value)}
              className="text-sm bg-zinc-800 border border-zinc-600 rounded px-4 py-2 text-white min-w-[240px] text-center"
            >
              <option value="">Default (dev cards)</option>
              {allDecks.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cards.reduce((n, e) => n + e.quantity, 0)} cards)
                </option>
              ))}
            </select>
          </div>
        )}

        <motion.button
          onClick={handlePlaytest}
          className="mt-2 px-16 py-4 border-2 border-white text-white uppercase tracking-widest text-lg hover:bg-white hover:text-zinc-950 transition-colors duration-200 rounded-lg"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Playtest
        </motion.button>

        {(onCardCollection || onEncounterGallery || onDeckBuilder) && (
          <div className="flex gap-6 mt-4 flex-wrap justify-center">
            {onCardCollection && (
              <motion.button
                onClick={onCardCollection}
                className="px-6 py-3 border border-zinc-700 text-zinc-500 text-sm uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors duration-200 rounded-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Dev: Card Collection
              </motion.button>
            )}
            {onEncounterGallery && (
              <motion.button
                onClick={onEncounterGallery}
                className="px-6 py-3 border border-zinc-700 text-zinc-500 text-sm uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors duration-200 rounded-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Dev: Encounter Gallery
              </motion.button>
            )}
            {onDeckBuilder && (
              <motion.button
                onClick={onDeckBuilder}
                className="px-6 py-3 border border-zinc-700 text-zinc-500 text-sm uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors duration-200 rounded-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Dev: Deck Builder
              </motion.button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
