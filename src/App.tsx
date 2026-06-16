import { useState } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';
import CardCollectionScreen from './screens/CardCollectionScreen';
import EncounterGalleryScreen from './screens/EncounterGalleryScreen';

type Screen = 'title' | 'combat' | 'cardCollection' | 'encounterGallery';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');

  switch (screen) {
    case 'title':
      return (
        <TitleScreen
          onStart={() => setScreen('combat')}
          onCardCollection={() => setScreen('cardCollection')}
          onEncounterGallery={() => setScreen('encounterGallery')}
        />
      );
    case 'combat':
      return <CombatScreen onExit={() => setScreen('title')} />;
    case 'cardCollection':
      return <CardCollectionScreen onBack={() => setScreen('title')} />;
    case 'encounterGallery':
      return <EncounterGalleryScreen onBack={() => setScreen('title')} />;
  }
}
