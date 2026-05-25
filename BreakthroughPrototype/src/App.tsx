import { useState, useEffect, useCallback } from 'react';
import Overworld from './components/Overworld';
import DeckBuilder from './components/DeckBuilder';
import CombatScreen from './components/CombatScreen';
import { STARTER_COMPENDIUM } from './data/cards';

const LS_COMPENDIUM = 'bt_compendium';

type AppScreen = 'overworld' | 'deckbuilder' | 'combat';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('overworld');
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [chosenWorldDeck, setChosenWorldDeck] = useState<string[]>([]);
  const [completedEncounters, setCompletedEncounters] = useState<Set<string>>(new Set());

  const [compendium, setCompendium] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LS_COMPENDIUM);
      return saved ? (JSON.parse(saved) as string[]) : STARTER_COMPENDIUM;
    } catch {
      return STARTER_COMPENDIUM;
    }
  });

  useEffect(() => {
    localStorage.setItem(LS_COMPENDIUM, JSON.stringify(compendium));
  }, [compendium]);

  const addToCompendium = useCallback((cardId: string) => {
    setCompendium(prev => (prev.includes(cardId) ? prev : [...prev, cardId]));
  }, []);

  function openDeckBuilder(id: string) {
    setEncounterId(id);
    setScreen('deckbuilder');
  }

  function enterCombat(chosen: string[]) {
    setChosenWorldDeck(chosen);
    setScreen('combat');
  }

  function endCombat(won: boolean) {
    if (won && encounterId) {
      setCompletedEncounters(prev => new Set([...prev, encounterId]));
    }
    setEncounterId(null);
    setChosenWorldDeck([]);
    setScreen('overworld');
  }

  function resetGame() {
    setCompletedEncounters(new Set());
    setEncounterId(null);
    setChosenWorldDeck([]);
    setScreen('overworld');
  }

  if (screen === 'deckbuilder' && encounterId) {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <DeckBuilder
          compendium={compendium}
          encounterId={encounterId}
          onConfirm={enterCombat}
          onCancel={() => setScreen('overworld')}
        />
      </div>
    );
  }

  if (screen === 'combat' && encounterId) {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <CombatScreen
          encounterId={encounterId}
          chosenWorldDeck={chosenWorldDeck}
          compendium={compendium}
          addToCompendium={addToCompendium}
          onEnd={endCombat}
        />
      </div>
    );
  }

  return <Overworld completedEncounters={completedEncounters} onStartCombat={openDeckBuilder} onResetGame={resetGame} />;
}
