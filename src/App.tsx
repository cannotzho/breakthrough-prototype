import { useState, useCallback } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';
import CardCollectionScreen from './screens/CardCollectionScreen';
import EncounterGalleryScreen from './screens/EncounterGalleryScreen';
import DeckBuilderScreen from './screens/DeckBuilderScreen';
import IssueSubmitButton from './components/dev/IssueSubmitButton';
import { EncounterConfig, CardDefinition } from './combat/types';

type Screen = 'title' | 'combat' | 'cardCollection' | 'encounterGallery' | 'deckBuilder';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [encounterConfig, setEncounterConfig] = useState<EncounterConfig | null>(null);
  const [playerDeckDefs, setPlayerDeckDefs] = useState<CardDefinition[] | undefined>(undefined);

  const startPlaytest = useCallback((config?: EncounterConfig, deckDefs?: CardDefinition[]) => {
    setEncounterConfig(config ?? null);
    setPlayerDeckDefs(deckDefs);
    setScreen('combat');
  }, []);

  let content: React.ReactNode;
  switch (screen) {
    case 'title':
      content = (
        <TitleScreen
          onStart={(deckDefs) => startPlaytest(undefined, deckDefs)}
          onCardCollection={() => setScreen('cardCollection')}
          onEncounterGallery={() => setScreen('encounterGallery')}
          onDeckBuilder={() => setScreen('deckBuilder')}
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
  }

  return (
    <>
      {content}
      <IssueSubmitButton />
    </>
  );
}
