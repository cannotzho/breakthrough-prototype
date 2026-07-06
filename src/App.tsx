import { useEffect, useState } from 'react';
import { TitleScreen } from './ui/screens/TitleScreen';
import { CombatScreen } from './ui/screens/CombatScreen';
import { PlaytestScreen } from './ui/screens/PlaytestScreen';
import { DevToolsScreen } from './devtools/DevToolsScreen';
import { useGameStore } from './stores/gameStore';

export type Route = 'title' | 'combat' | 'playtest' | 'dev';

function currentRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('dev')) return 'dev';
  if (hash.startsWith('playtest')) return 'playtest';
  if (hash.startsWith('combat')) return 'combat';
  return 'title';
}

export function navigate(route: Route): void {
  window.location.hash = route === 'title' ? '/' : `/${route}`;
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute());
  const combatActive = useGameStore((s) => s.state !== null);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'combat' && combatActive) return <CombatScreen />;
  if (route === 'dev') return <DevToolsScreen />;
  if (route === 'playtest') return <PlaytestScreen />;
  return <TitleScreen />;
}
