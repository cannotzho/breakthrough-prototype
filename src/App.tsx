import { useState, useCallback } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';
import CardCollectionScreen from './screens/CardCollectionScreen';
import EncounterGalleryScreen from './screens/EncounterGalleryScreen';
import { EncounterConfig } from './combat/types';

type Screen = 'title' | 'combat' | 'cardCollection' | 'encounterGallery';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [encounterConfig, setEncounterConfig] = useState<EncounterConfig | null>(null);

  const startPlaytest = useCallback((config?: EncounterConfig) => {
    setEncounterConfig(config ?? null);
    setScreen('combat');
  }, []);

  switch (screen) {
    case 'title':
      return (
        <TitleScreen
          onStart={() => startPlaytest()}
          onCardCollection={() => setScreen('cardCollection')}
          onEncounterGallery={() => setScreen('encounterGallery')}
        />
      );
    case 'combat':
      return (
        <CombatScreen
          onExit={() => setScreen('title')}
          encounterConfig={encounterConfig ?? undefined}
        />
      );
    case 'cardCollection':
      return <CardCollectionScreen onBack={() => setScreen('title')} />;
    case 'encounterGallery':
      return (
        <EncounterGalleryScreen
          onBack={() => setScreen('title')}
          onPlaytestEncounter={startPlaytest}
        />
      );
  }
}
