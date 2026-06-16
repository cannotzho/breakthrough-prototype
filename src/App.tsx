import { useState, useCallback } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';
import CardCollectionScreen from './screens/CardCollectionScreen';
import EncounterGalleryScreen from './screens/EncounterGalleryScreen';
import IssueSubmitButton from './components/dev/IssueSubmitButton';
import { EncounterConfig } from './combat/types';

type Screen = 'title' | 'combat' | 'cardCollection' | 'encounterGallery';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [encounterConfig, setEncounterConfig] = useState<EncounterConfig | null>(null);

  const startPlaytest = useCallback((config?: EncounterConfig) => {
    setEncounterConfig(config ?? null);
    setScreen('combat');
  }, []);

  let content: React.ReactNode;
  switch (screen) {
    case 'title':
      content = (
        <TitleScreen
          onStart={() => startPlaytest()}
          onCardCollection={() => setScreen('cardCollection')}
          onEncounterGallery={() => setScreen('encounterGallery')}
        />
      );
      break;
    case 'combat':
      content = (
        <CombatScreen
          onExit={() => setScreen('title')}
          encounterConfig={encounterConfig ?? undefined}
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
  }

  return (
    <>
      {content}
      <IssueSubmitButton />
    </>
  );
}
