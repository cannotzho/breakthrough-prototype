import { useState, useCallback } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';
import CardCollectionScreen from './screens/CardCollectionScreen';
import EncounterGalleryScreen from './screens/EncounterGalleryScreen';
import DeckBuilderScreen from './screens/DeckBuilderScreen';
import DualSetupScreen from './screens/DualSetupScreen';
import IssueSubmitButton from './components/dev/IssueSubmitButton';
import { EncounterConfig, CardDefinition, CombatState } from './combat/types';
import { buildInitialCombatState } from './data/encounterDefs';
import { DualSession } from './lib/realtimeChannel';

type Screen = 'title' | 'combat' | 'cardCollection' | 'encounterGallery' | 'deckBuilder' | 'dualSetup' | 'dualCombat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [encounterConfig, setEncounterConfig] = useState<EncounterConfig | null>(null);
  const [playerDeckDefs, setPlayerDeckDefs] = useState<CardDefinition[] | undefined>(undefined);
  const [dualSession, setDualSession] = useState<DualSession | null>(null);
  const [dualInitialState, setDualInitialState] = useState<CombatState | null>(null);

  const startPlaytest = useCallback((config?: EncounterConfig, deckDefs?: CardDefinition[]) => {
    setEncounterConfig(config ?? null);
    setPlayerDeckDefs(deckDefs);
    setScreen('combat');
  }, []);

  const startDualCombat = useCallback((session: DualSession, config: EncounterConfig, deckDefs: CardDefinition[]) => {
    const initialState = buildInitialCombatState(config, deckDefs);
    setDualSession(session);
    setEncounterConfig(config);
    setPlayerDeckDefs(deckDefs);
    setDualInitialState(initialState);
    session.broadcastStart(initialState);
    setScreen('dualCombat');
  }, []);

  const guestStartDualCombat = useCallback((session: DualSession, initialState: CombatState) => {
    setDualSession(session);
    setDualInitialState(initialState);
    setScreen('dualCombat');
  }, []);

  const handleDualExit = useCallback(() => {
    dualSession?.disconnect();
    setDualSession(null);
    setDualInitialState(null);
    setScreen('title');
  }, [dualSession]);

  let content: React.ReactNode;
  switch (screen) {
    case 'title':
      content = (
        <TitleScreen
          onStart={(deckDefs) => startPlaytest(undefined, deckDefs)}
          onCardCollection={() => setScreen('cardCollection')}
          onEncounterGallery={() => setScreen('encounterGallery')}
          onDeckBuilder={() => setScreen('deckBuilder')}
          onDualPlaytest={() => setScreen('dualSetup')}
        />
      );
      break;
    case 'combat':
      content = (
        <CombatScreen
          onExit={() => setScreen('title')}
          encounterConfig={encounterConfig ?? undefined}
          playerDeckDefs={playerDeckDefs}
        />
      );
      break;
    case 'cardCollection':
      content = <CardCollectionScreen onBack={() => setScreen('title')} />;
      break;
    case 'encounterGallery':
      content = (
        <EncounterGalleryScreen
          onBack={() => setScreen('title')}
          onPlaytestEncounter={startPlaytest}
        />
      );
      break;
    case 'deckBuilder':
      content = <DeckBuilderScreen onBack={() => setScreen('title')} />;
      break;
    case 'dualSetup':
      content = (
        <DualSetupScreen
          onBack={() => setScreen('title')}
          onStartCombat={startDualCombat}
          onGuestStartCombat={guestStartDualCombat}
        />
      );
      break;
    case 'dualCombat':
      content = dualSession && dualInitialState ? (
        <CombatScreen
          onExit={handleDualExit}
          encounterConfig={encounterConfig ?? undefined}
          playerDeckDefs={playerDeckDefs}
          dualSession={dualSession}
          initialCombatState={dualInitialState}
        />
      ) : null;
      break;
  }

  return (
    <>
      {content}
      <IssueSubmitButton />
    </>
  );
}
