import { useState } from 'react';
import { navigate } from '../../App';
import { useGameStore } from '../../stores/gameStore';
import { ALL_CARDS, DEV_COLLECTION_IDS, ENCOUNTERS, NUGGETS, RECIPES, STARTER_DECK_LISTS, TOKENS } from '../../content';

export function TitleScreen() {
  const startCombat = useGameStore((s) => s.startCombat);
  const [encounterId, setEncounterId] = useState('test_encounter');
  const [deckKey, setDeckKey] = useState('dev');

  const begin = () => {
    startCombat({
      config: ENCOUNTERS[encounterId],
      cards: ALL_CARDS,
      tokens: TOKENS,
      nuggets: NUGGETS,
      recipes: RECIPES,
      playerDeckCardIds: STARTER_DECK_LISTS[deckKey],
      collectionCardIds: DEV_COLLECTION_IDS,
      seed: Date.now() | 0,
    });
    navigate('combat');
  };

  return (
    <div className="screen screen-center">
      <h1 className="title-logo">Breakthrough</h1>
      <p className="title-sub">Every conversation is a case to crack.</p>
      <div className="menu">
        <label>
          Encounter{' '}
          <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)} style={{ width: '100%' }}>
            {Object.values(ENCOUNTERS).map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deck{' '}
          <select value={deckKey} onChange={(e) => setDeckKey(e.target.value)} style={{ width: '100%' }}>
            {Object.keys(STARTER_DECK_LISTS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={begin}>
          Begin Encounter
        </button>
        <button onClick={() => navigate('playtest')}>Dual Playtest</button>
        <button onClick={() => navigate('dev')}>Dev Tools</button>
      </div>
    </div>
  );
}
