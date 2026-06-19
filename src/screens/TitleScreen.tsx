import { motion } from 'framer-motion';

interface TitleScreenProps {
  onStart: () => void;
  onCardCollection?: () => void;
  onEncounterGallery?: () => void;
  onDeckBuilder?: () => void;
}

export default function TitleScreen({ onStart, onCardCollection, onEncounterGallery, onDeckBuilder }: TitleScreenProps) {
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

        <motion.button
          onClick={onStart}
          className="mt-6 px-16 py-4 border-2 border-white text-white uppercase tracking-widest text-lg hover:bg-white hover:text-zinc-950 transition-colors duration-200 rounded-lg"
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
