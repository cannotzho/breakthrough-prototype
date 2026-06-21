import { useState, useMemo } from 'react';
import { CardDefinition, ColorIdentity } from '../../combat/types';

const COLOR_BORDER: Record<ColorIdentity, string> = {
  Red: 'border-red-500',
  Blue: 'border-blue-500',
  Green: 'border-green-500',
  White: 'border-white',
  Black: 'border-purple-900',
  Orange: 'border-orange-400',
  Purple: 'border-purple-500',
  Colorless: 'border-zinc-500',
};

const COLOR_BG: Record<ColorIdentity, string> = {
  Red: 'bg-red-950',
  Blue: 'bg-blue-950',
  Green: 'bg-green-950',
  White: 'bg-zinc-800',
  Black: 'bg-purple-950',
  Orange: 'bg-orange-950',
  Purple: 'bg-purple-950',
  Colorless: 'bg-zinc-900',
};

function GalleryCard({
  card,
  onClick,
  overlay,
}: {
  card: CardDefinition;
  onClick: () => void;
  overlay?: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const border = COLOR_BORDER[card.color] ?? 'border-zinc-500';
  const bg = COLOR_BG[card.color] ?? 'bg-zinc-900';

  const effectLines: string[] = [];
  for (const kw of card.keywords) effectLines.push(kw);
  const text = card.effectText ?? card.description ?? '';
  if (text) effectLines.push(text);
  const effectDisplay = effectLines.join('\n');

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => { if (card.longDescription) setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
      className={`relative w-[140px] h-[196px] shrink-0 rounded-xl border-2 ${border} ${bg} flex flex-col p-2.5 select-none cursor-pointer hover:scale-105 transition-transform text-left`}
    >
      {overlay && (
        <span className="absolute -top-2.5 -right-2.5 z-10">{overlay}</span>
      )}
      <div className="flex justify-between items-start gap-1">
        <span className="text-xs text-white font-semibold truncate leading-tight">{card.name}</span>
        <span className="text-base font-bold text-white shrink-0">{card.cost}</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-zinc-800/50 rounded-lg overflow-hidden mt-1">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 48 48" className="w-10 h-10 text-zinc-600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="10" width="36" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="17" cy="21" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 34l12-10 10 8 8-6 6 6v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <div className="flex gap-0.5 flex-wrap mt-1">
        <span className="text-[9px] px-1 rounded border border-zinc-600 text-zinc-400">{card.color}</span>
        <span className="text-[9px] px-1 rounded border border-zinc-600 text-zinc-400">{card.supertype}</span>
      </div>
      <p className="text-zinc-400 text-[10px] mt-0.5 leading-tight line-clamp-2 whitespace-pre-line">{effectDisplay}</p>

      {showTooltip && card.longDescription && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-xs text-zinc-200 leading-relaxed pointer-events-none">
          <span className="font-semibold text-white">{card.name}</span>
          <p className="mt-1">{card.longDescription}</p>
        </div>
      )}
    </button>
  );
}

const PAGE_SIZE = 8;

interface CardGalleryGridProps {
  cards: CardDefinition[];
  onCardClick: (card: CardDefinition) => void;
  filter?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;
  renderOverlay?: (card: CardDefinition) => React.ReactNode;
  emptyMessage?: string;
}

export default function CardGalleryGrid({
  cards,
  onCardClick,
  filter,
  onFilterChange,
  filterPlaceholder = 'Filter cards...',
  renderOverlay,
  emptyMessage = 'No cards found.',
}: CardGalleryGridProps) {
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!filter) return cards;
    const q = filter.toLowerCase();
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.color.toLowerCase().includes(q) ||
        c.supertype.toLowerCase().includes(q),
    );
  }, [cards, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageCards = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      {onFilterChange && (
        <input
          value={filter ?? ''}
          onChange={(e) => { onFilterChange(e.target.value); setPage(0); }}
          placeholder={filterPlaceholder}
          className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-white w-full"
        />
      )}

      {pageCards.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 justify-items-center">
          {pageCards.map((card) => (
            <GalleryCard
              key={card.id}
              card={card}
              onClick={() => onCardClick(card)}
              overlay={renderOverlay?.(card)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 text-center py-6">{emptyMessage}</div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-1">
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-zinc-500">
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export { GalleryCard };
