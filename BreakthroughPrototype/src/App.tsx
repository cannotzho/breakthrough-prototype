import { useState } from 'react';
import Overworld from './components/Overworld';
import CombatScreen from './components/CombatScreen';

export default function App() {
  const [screen, setScreen] = useState<'overworld' | 'combat'>('overworld');
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [completedEncounters, setCompletedEncounters] = useState<Set<string>>(new Set());

  function startCombat(id: string) {
    setEncounterId(id);
    setScreen('combat');
  }

  function endCombat(won: boolean) {
    if (won && encounterId) {
      setCompletedEncounters(prev => new Set([...prev, encounterId]));
    }
    setEncounterId(null);
    setScreen('overworld');
  }

  if (screen === 'combat' && encounterId) {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <CombatScreen encounterId={encounterId} onEnd={endCombat} />
      </div>
    );
  }

  return <Overworld completedEncounters={completedEncounters} onStartCombat={startCombat} />;
}
