import { motion } from 'framer-motion';
import CardCollection from '../components/dev/CardCollection';

interface Props {
  onBack: () => void;
}

export default function CardCollectionScreen({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <motion.button
          onClick={onBack}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
          whileHover={{ x: -2 }}
        >
          &larr; Back
        </motion.button>
        <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-300">
          Dev Card Collection
        </h1>
      </header>
      <main className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <CardCollection />
      </main>
    </div>
  );
}
