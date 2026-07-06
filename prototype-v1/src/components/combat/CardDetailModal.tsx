import { motion, AnimatePresence } from 'framer-motion';
import { CardInstance } from '../../combat/types';
import { COLOR_BORDER } from './cardColors';
import KeywordBadge from './KeywordBadge';
import { formatAbilityCost } from './formatters';

interface CardDetailModalProps {
  card: CardInstance | null;
  onClose: () => void;
}

export default function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key="card-detail-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl p-8 max-w-md w-full mx-4 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">{card.definition.name}</h2>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 flex-wrap text-sm">
              <span className={`px-2 py-1 rounded border ${COLOR_BORDER[card.definition.color]} text-zinc-300`}>
                {card.definition.color}
              </span>
              <span className="px-2 py-1 rounded border border-zinc-600 text-zinc-400">
                {card.definition.supertype}
              </span>
              <span className="px-2 py-1 rounded border border-zinc-600 text-zinc-400">
                Cost {card.definition.cost}
              </span>
              {card.definition.keywords.map(kw => (
                <KeywordBadge key={kw} keyword={kw} />
              ))}
            </div>
            {(card.definition.effectText ?? card.definition.description) && (
              <div>
                <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Effect</div>
                <p className="text-base text-zinc-200 leading-relaxed">
                  {card.definition.effectText ?? card.definition.description}
                </p>
              </div>
            )}
            {card.definition.longDescription && (
              <div>
                <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Description</div>
                <p className="text-base text-zinc-300 leading-relaxed">
                  {card.definition.longDescription}
                </p>
              </div>
            )}
            {card.definition.activatedAbilities && card.definition.activatedAbilities.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Activated Abilities</div>
                {card.definition.activatedAbilities.map(ab => (
                  <div key={ab.id} className="flex items-center gap-2 text-sm text-amber-400">
                    <span className="font-medium">{ab.name}</span>
                    <span className="text-zinc-500">{formatAbilityCost(ab.cost)}</span>
                  </div>
                ))}
              </div>
            )}
            {card.definition.leavesTriggerEffects && card.definition.leavesTriggerEffects.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Leaves Battlefield</div>
                <p className="text-sm text-zinc-400">Triggers when this card leaves the field</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
