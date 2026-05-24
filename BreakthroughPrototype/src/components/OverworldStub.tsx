import { ENCOUNTERS } from '../data/encounters';

interface Props {
  completedEncounters: Set<string>;
  onStartCombat: (encounterId: string) => void;
}

const ENCOUNTER_FLAVOR: Record<string, { subtitle: string; difficulty: string; color: string }> = {
  gutterfang: {
    subtitle: 'A blood dealer with something to hide',
    difficulty: 'Easier',
    color: '#8B4513',
  },
  maryann: {
    subtitle: 'Far more dangerous than she appears',
    difficulty: 'Harder',
    color: '#800080',
  },
};

export default function OverworldStub({ completedEncounters, onStartCombat }: Props) {
  const gutterfangDone = completedEncounters.has('gutterfang');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1a2e] text-white px-4 py-8">
      {/* Title */}
      <h1 className="text-5xl font-bold tracking-widest text-[#e94560] mb-1"
        style={{ textShadow: '0 0 20px rgba(233,69,96,0.4)' }}>
        BREAKTHROUGH
      </h1>
      <p className="text-[#888] text-lg mb-2">A Detective Card Game</p>
      <p className="text-[#0f3460] text-sm mb-10 italic">Overworld — coming soon in 3D</p>

      {/* Objective */}
      <div className="bg-[#16213e] border border-[#0f3460] rounded-lg px-6 py-4 mb-8 max-w-md text-center">
        <p className="text-[#bbb] text-sm leading-relaxed">
          A beast-man of high renown has been grievously injured. Your investigation
          points to an illegal blood trade network — and a vampire noble pulling the strings.
          Break all of your target's Shields to extract the key information.
        </p>
      </div>

      {/* Encounter buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
        {Object.values(ENCOUNTERS).map(enc => {
          const done = completedEncounters.has(enc.id);
          const flavor = ENCOUNTER_FLAVOR[enc.id];
          const locked = enc.id === 'maryann' && !gutterfangDone;

          return (
            <button
              key={enc.id}
              onClick={locked ? undefined : () => onStartCombat(enc.id)}
              disabled={locked}
              className={[
                'flex-1 flex flex-col items-center gap-2 rounded-lg border-2 p-5 transition-all',
                done
                  ? 'border-[#4ecca3] opacity-60 cursor-default bg-[#0a1a10]'
                  : locked
                    ? 'border-[#333] opacity-40 cursor-not-allowed bg-[#16213e]'
                    : 'border-[#0f3460] bg-[#16213e] hover:border-[#e94560] hover:bg-[#1a1a2e] cursor-pointer',
              ].join(' ')}
            >
              {/* Avatar dot */}
              <div
                className="w-12 h-12 rounded-full border-2 border-white"
                style={{ background: flavor?.color ?? '#888' }}
              />

              <div className="text-center">
                <p className="text-white font-semibold">{enc.name}</p>
                <p className="text-[#888] text-xs mt-0.5">{flavor?.subtitle}</p>
                <p className="text-[10px] mt-1" style={{ color: flavor?.color ?? '#888' }}>
                  {flavor?.difficulty}
                </p>
              </div>

              {done ? (
                <span className="text-[#4ecca3] text-xs font-semibold">✓ Complete</span>
              ) : locked ? (
                <span className="text-[#666] text-xs">🔒 Find Gutterfang first</span>
              ) : (
                <span className="text-[#e94560] text-sm font-semibold">Talk →</span>
              )}
            </button>
          );
        })}
      </div>

      {/* How to play */}
      <div className="mt-10 max-w-md text-[#666] text-xs text-center leading-relaxed">
        <p className="font-semibold text-[#888] mb-1">How to Play</p>
        <p>
          <strong className="text-[#bbb]">Priority</strong> determines who acts.
          When positive you are in <strong className="text-[#4ecca3]">Attack Phase</strong> — play cards or place a Shield.
          When zero or negative, the opponent acts in <strong className="text-[#e94560]">Defense Phase</strong>.
          You can still play <em>Instant</em> cards to regain priority.
        </p>
        <p className="mt-1">
          Break all opponent Shields to win. Lose all yours and the conversation ends.
        </p>
      </div>
    </div>
  );
}
