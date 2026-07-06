const PHASE_DISPLAY: Record<string, string> = {
  BotMSelect: 'Select',
};

export default function PhaseBar({ phase }: { phase: string }) {
  const isPlayer = ['PlayerPending', 'PlayerPlay', 'BotMSelect'].includes(phase);
  const isEnemy = ['EnemyPending', 'EnemyPlay', 'FieldTriggerCheck'].includes(phase);

  return (
    <div className={`px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-widest
      ${isPlayer ? 'bg-blue-900 text-blue-200' :
        isEnemy ? 'bg-red-900 text-red-200' :
        'bg-zinc-800 text-zinc-300'}
    `}>
      {PHASE_DISPLAY[phase] ?? phase}
    </div>
  );
}
