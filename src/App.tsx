import { useState } from 'react';
import TitleScreen from './screens/TitleScreen';
import CombatScreen from './screens/CombatScreen';

type Screen = 'title' | 'combat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');

  return screen === 'title'
    ? <TitleScreen onStart={() => setScreen('combat')} />
    : <CombatScreen onExit={() => setScreen('title')} />;
}
