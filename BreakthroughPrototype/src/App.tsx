import { useState, useEffect, useCallback } from 'react';
import Overworld from './components/Overworld';
import DeckBuilder from './components/DeckBuilder';
import ShieldSelector from './components/ShieldSelector';
import CombatScreen from './components/CombatScreen';
import DeckPreviewScreen from './components/DeckPreviewScreen';
import TitleScreen from './components/TitleScreen';
import SceneDescriptionScreen from './components/SceneDescriptionScreen';
import { STARTER_COMPENDIUM, CARDS, DETECTIVE_PERSONAL_DECK } from './data/cards';
import { ENCOUNTERS } from './data/encounters';

const MAX_DECK = 15;
import DevTools from './components/DevTools';

// Clear all persisted game state on every page load — each session starts fresh
Object.keys(localStorage)
  .filter(k => k.startsWith('bt_'))
  .forEach(k => localStorage.removeItem(k));

const LS_COMPENDIUM = 'bt_compendium';
const LS_COLLECTED = 'bt_collected';
const LS_BEATEN = 'bt_beaten_encounters';

type AppScreen = 'title' | 'overworld' | 'scenedesc' | 'deckbuilder' | 'deckpreview' | 'shieldselector' | 'combat';

const isDevRoute = import.meta.env.DEV && window.location.pathname.replace(/\/$/, '').endsWith('/dev');

export default function App() {
  if (isDevRoute) return <DevTools />;

  const [screen, setScreen] = useState<AppScreen>('title');
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [chosenWorldDeck, setChosenWorldDeck] = useState<string[]>([]);
  const [preShields, setPreShields] = useState<string[]>([]);
  const [completedEncounters, setCompletedEncounters] = useState<Set<string>>(new Set());
  const [personalDeck, setPersonalDeck] = useState<string[]>(DETECTIVE_PERSONAL_DECK);

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

  useEffect(() => {
    localStorage.setItem(LS_BEATEN, JSON.stringify([...completedEncounters]));
  }, [completedEncounters]);

  const addToCompendium = useCallback((cardId: string) => {
    setCompendium(prev => (prev.includes(cardId) ? prev : [...prev, cardId]));
  }, []);

  function openDeckBuilder(id: string) {
    const enc = ENCOUNTERS[id];
    if (enc?.tutorialMode) {
      // Tutorial encounters bypass the deckbuilder/deckpreview/shieldselector flow entirely.
      setEncounterId(id);
      setChosenWorldDeck(enc.scriptedDrawOrder ?? []);
      setPreShields(enc.tutorialPreShields ?? []);
      // pettyCriminal gets a cinematic scene description before combat
      setScreen(id === 'pettyCriminal' ? 'scenedesc' : 'combat');
      return;
    }
    setEncounterId(id);
    const uniqueIds = [...new Set(compendium)].filter(cid => CARDS[cid]);
    if (uniqueIds.length <= MAX_DECK) {
      enterCombat(uniqueIds);
    } else {
      setScreen('deckbuilder');
    }
  }

  function enterCombat(chosen: string[]) {
    setChosenWorldDeck(chosen);
    setScreen('deckpreview');
  }

  function proceedToShields() {
    setScreen('shieldselector');
  }

  function startCombat(shields: string[]) {
    setPreShields(shields);
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
    setPreShields([]);
    setScreen('overworld');
  }

  function resetGame() {
    setCompletedEncounters(new Set());
    setCollectedCards([]);
    setPersonalDeck(DETECTIVE_PERSONAL_DECK);
    setEncounterId(null);
    setChosenWorldDeck([]);
    setPreShields([]);
    setScreen('title');
  }

  if (screen === 'title') {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <TitleScreen onNewGame={() => setScreen('overworld')} />
      </div>
    );
  }

  if (screen === 'scenedesc') {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <SceneDescriptionScreen onContinue={() => setScreen('combat')} />
      </div>
    );
  }

  if (screen === 'deckbuilder' && encounterId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <DeckBuilder
          compendium={compendium}
          encounterId={encounterId}
          onConfirm={enterCombat}
          onCancel={() => setScreen('overworld')}
        />
      </div>
    );
  }

  if (screen === 'deckpreview' && encounterId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <DeckPreviewScreen
          encounterId={encounterId}
          personalDeck={personalDeck}
          onConfirm={proceedToShields}
          onCancel={() => setScreen('overworld')}
        />
      </div>
    );
  }

  if (screen === 'shieldselector' && encounterId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <ShieldSelector
          chosenWorldDeck={chosenWorldDeck}
          encounterId={encounterId}
          onConfirm={startCombat}
          onCancel={() => setScreen('overworld')}
        />
      </div>
    );
  }

  if (screen === 'combat' && encounterId) {
    return (
      <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
        <CombatScreen
          encounterId={encounterId}
          chosenWorldDeck={chosenWorldDeck}
          preShields={preShields}
          personalDeck={personalDeck}
          addToCompendium={addToCompendium}
          onEnd={endCombat}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', height: '100vh', overflow: 'hidden' }}>
      <Overworld
        completedEncounters={completedEncounters}
        onStartCombat={openDeckBuilder}
        onResetGame={resetGame}
        collectedCards={collectedCards}
        compendium={compendium}
        onCollectItem={addToCompendium}
        personalDeck={personalDeck}
        onUpdatePersonalDeck={setPersonalDeck}
      />
    </div>
  );
}
