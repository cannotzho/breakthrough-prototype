import { useState, useEffect, useCallback } from 'react';
import Overworld from './components/Overworld';
import DeckBuilder from './components/DeckBuilder';
import CombatScreen from './components/CombatScreen';
import { STARTER_COMPENDIUM } from './data/cards';
import DevTools from './components/DevTools';

const LS_COMPENDIUM = 'bt_compendium';
const LS_COLLECTED = 'bt_collected';

type AppScreen = 'overworld' | 'deckbuilder' | 'combat';

const isDevRoute = import.meta.env.DEV && window.location.pathname.replace(/\/$/, '').endsWith('/dev');

export default function App() {
  if (isDevRoute) return <DevTools />;

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

  const [collectedCards, setCollectedCards] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LS_COLLECTED);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(LS_COMPENDIUM, JSON.stringify(compendium));
  }, [compendium]);

  useEffect(() => {
    localStorage.setItem(LS_COLLECTED, JSON.stringify(collectedCards));
  }, [collectedCards]);

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

  function endCombat(won: boolean, newCollected?: string[]) {
    if (won && encounterId) {
      setCompletedEncounters(prev => new Set([...prev, encounterId]));
    }
    if (newCollected && newCollected.length > 0) {
      setCollectedCards(prev => {
        const additions = newCollected.filter(id => !prev.includes(id));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }
    setEncounterId(null);
    setChosenWorldDeck([]);
    setScreen('overworld');
  }

  function resetGame() {
    setCompletedEncounters(new Set());
    setCollectedCards([]);
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

  return (
    <Overworld
      completedEncounters={completedEncounters}
      onStartCombat={openDeckBuilder}
      onResetGame={resetGame}
      collectedCards={collectedCards}
      compendium={compendium}
    />
  );
}
