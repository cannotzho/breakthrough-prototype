import { motion } from 'framer-motion';

interface TitleScreenProps {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
      <motion.div
        className="flex flex-col items-center gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <div className="w-64 h-64 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-600 text-sm">
          [Splash Art]
        </div>

        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-widest uppercase text-white">
            Breakthrough
          </h1>
          <p className="text-zinc-400 text-lg mt-2 tracking-wide">
            A detective card game
          </p>
        </div>

        <motion.button
          onClick={onStart}
          className="mt-4 px-12 py-3 border border-white text-white uppercase tracking-widest text-sm hover:bg-white hover:text-zinc-950 transition-colors duration-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Begin
        </motion.button>
      </motion.div>
    </div>
  );
}
