import { useState } from 'react';
import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';

interface Props {
  state: CombatState;
  encounterName: string;
}

function PileModal({ title, cardIds, onClose }: { title: string; cardIds: string[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border-2 border-[#0f3460] rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-auto font-mono text-[#ddd]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <p className="text-[#4ecca3] font-bold text-sm">{title} — {cardIds.length} card{cardIds.length !== 1 ? 's' : ''}</p>
          <button onClick={onClose} className="text-[#888] text-lg leading-none hover:text-white bg-transparent border-0 cursor-pointer">✕</button>
        </div>
        {cardIds.length === 0 ? (
          <p className="text-[#555] text-xs text-center py-4">Empty</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 justify-items-center">
            {cardIds.map((id, i) => {
              const card = CARDS[id];
              if (!card) return null;
              return <CardComponent key={i} card={card} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CombatHUD({ state, encounterName }: Props) {
  const { priority, oppPatience, oppMaxPatience, phase, awaitingShieldChoice } = state;
  const [showDeck, setShowDeck] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  const drawPile = [...state.personalDeck.cards, ...state.worldDeck.cards];
  const discardPile = [...state.personalDeck.discard, ...state.worldDeck.discard];

  const patiencePct = Math.max(0, (oppPatience / oppMaxPatience) * 100);

  const phaseLabel = awaitingShieldChoice
    ? 'Choose Shield'
    : phase === 'attack' ? 'Attack Phase' : 'Defense Phase';
  const phaseColor = awaitingShieldChoice
    ? '#f4d03f'
    : phase === 'attack' ? '#4ecca3' : '#e94560';

  const hint = awaitingShieldChoice
    ? 'Click one of your shields to sacrifice it.'
    : phase === 'attack'
      ? 'Your turn: tap a card to select, tap again to play. Or place a Shield.'
      : 'Defense Phase — Opponent acting… You may still play Instant cards.';

  return (
    <div className="flex flex-wrap items-start gap-2 p-2 bg-[rgba(10,15,30,0.95)] border-b border-[#0f3460]">

      {/* Opponent info */}
      <div className="flex-1 min-w-[140px] bg-[#16213e] rounded p-2 border border-[#0f3460]">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Opponent</p>
        <p className="text-white font-bold text-sm truncate">{encounterName}</p>
        <p className="text-[#888] text-[10px] mt-1">
          Patience <span className="text-white">{oppPatience}/{oppMaxPatience}</span>
        </p>
        <div className="w-full h-1.5 bg-[#333] rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#e94560] transition-all duration-300"
            style={{ width: `${patiencePct}%` }}
          />
        </div>
        <p className="text-[#888] text-[10px] mt-1">
          Shields: {state.oppShields.filter(s => !s.broken).length} / {state.oppShields.length}
        </p>
      </div>

      {/* Phase */}
      <div className="flex-1 min-w-[120px] bg-[#16213e] rounded p-2 border border-[#0f3460] text-center">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Phase</p>
        <p className="font-bold text-sm" style={{ color: phaseColor }}>{phaseLabel}</p>
        <p className="text-[#888] text-[10px] mt-1">Priority</p>
        <p className="font-bold text-lg leading-none" style={{ color: priority > 0 ? '#4ecca3' : priority < 0 ? '#e94560' : '#888' }}>
          {priority > 0 ? `+${priority}` : priority}
        </p>
      </div>

      {/* Player info */}
      <div className="flex-1 min-w-[140px] bg-[#16213e] rounded p-2 border border-[#0f3460]">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Detective</p>
        <p className="text-white font-bold text-sm">You</p>
        <p className="text-[#888] text-[10px] mt-1">
          Shields: {state.playerShields.filter(s => !s.broken).length} / {state.playerShields.length}
        </p>
        <p className="text-[#888] text-[10px] mt-0.5">
          Hand: <span className="text-white">{state.hand.length}</span> cards
        </p>
        <div className="flex gap-2 mt-0.5">
          <button
            onClick={() => setShowDeck(true)}
            className="text-[10px] text-[#4ecca3] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white"
          >
            Deck: {drawPile.length}
          </button>
          <button
            onClick={() => setShowDiscard(true)}
            className="text-[10px] text-[#888] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white"
          >
            Discard: {discardPile.length}
          </button>
        </div>
      </div>

      {/* Hint bar — full width below the boxes */}
      <div className="w-full">
        <p className="text-[#888] text-[10px] text-center italic px-2">{hint}</p>
      </div>

      {showDeck && (
        <PileModal title="Draw Pile" cardIds={drawPile} onClose={() => setShowDeck(false)} />
      )}
      {showDiscard && (
        <PileModal title="Discard Pile" cardIds={discardPile} onClose={() => setShowDiscard(false)} />
      )}
    </div>
  );
}
