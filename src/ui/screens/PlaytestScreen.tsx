/**
 * Dual playtest lobby (Brief §4.4): host builds the encounter and shares a
 * code; guest connects and drives the NPC side. Actions broadcast over
 * Supabase Realtime; both clients replay the identical action sequence
 * through the pure reducer (byte-identical states).
 */
import { useState } from 'react';
import { navigate } from '../../App';
import { useGameStore } from '../../stores/gameStore';
import { PlaytestSession, randomJoinCode } from '../../net/realtime';
import type { SetupInput } from '../../engine';
import { ALL_CARDS, DEV_COLLECTION_IDS, ENCOUNTERS, NUGGETS, RECIPES, STARTER_DECK_LISTS, TOKENS } from '../../content';

export function PlaytestScreen() {
  const store = useGameStore;
  const [mode, setMode] = useState<'pick' | 'hosting' | 'joining'>('pick');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [encounterId, setEncounterId] = useState('fan_club_president');
  const [deckKey, setDeckKey] = useState('dev');
  const [status, setStatus] = useState('');

  const host = async () => {
    const c = randomJoinCode();
    setCode(c);
    setMode('hosting');
    setStatus('Creating channel…');
    const session = new PlaytestSession('host', c, {
      onAction: () => {}, // host is the authority; it never receives foreign actions
      onGuestRequest: (action) => {
        // Host authority: validate via the reducer and broadcast if legal.
        useGameStore.getState().dispatch(action);
      },
      onPeerJoin: () => {
        useGameStore.getState().setPeerConnected(true);
        setStatus('Guest connected — starting combat.');
        const setup: SetupInput = {
          config: ENCOUNTERS[encounterId],
          cards: ALL_CARDS,
          tokens: TOKENS,
          nuggets: NUGGETS,
          recipes: RECIPES,
          playerDeckCardIds: STARTER_DECK_LISTS[deckKey],
          collectionCardIds: DEV_COLLECTION_IDS,
          seed: Date.now() | 0,
        };
        useGameStore.getState().startCombat(setup);
        navigate('combat');
      },
    });
    store.getState().setSession(session, 'host');
    try {
      await session.connect();
      setStatus(`Waiting for a guest… share code ${c}`);
    } catch (e) {
      setStatus(`Connection failed: ${String(e)}`);
    }
  };

  const join = async () => {
    setMode('joining');
    setStatus('Connecting…');
    const session = new PlaytestSession('guest', joinCode, {
      onInit: (setup, seed) => {
        useGameStore.getState().adoptRemoteSetup({ ...setup, seed } as SetupInput);
        setStatus('Combat received — you drive the NPC side.');
        navigate('combat');
      },
      onAction: (seq, action) => {
        useGameStore.getState().applyAuthorityAction(seq, action);
      },
    });
    store.getState().setSession(session, 'guest');
    try {
      await session.connect();
      setStatus('Connected. Waiting for the host to start…');
    } catch (e) {
      setStatus(`Connection failed: ${String(e)}`);
    }
  };

  return (
    <div className="screen screen-center">
      <h1 className="title-logo" style={{ fontSize: 36 }}>
        Dual Playtest
      </h1>
      <p className="title-sub">Two clients, one combat. Host plays the Detective; guest drives the NPC.</p>

      {mode === 'pick' && (
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
            Host deck{' '}
            <select value={deckKey} onChange={(e) => setDeckKey(e.target.value)} style={{ width: '100%' }}>
              {Object.keys(STARTER_DECK_LISTS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={host}>
            Host a session
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{ flex: 1 }}
            />
            <button onClick={join} disabled={joinCode.trim().length < 4}>
              Join
            </button>
          </div>
          <button onClick={() => navigate('title')}>Back</button>
        </div>
      )}

      {mode !== 'pick' && (
        <div className="menu" style={{ textAlign: 'center' }}>
          {mode === 'hosting' && (
            <h2 style={{ letterSpacing: '0.3em', color: 'var(--accent)', fontSize: 40, margin: 0 }}>{code}</h2>
          )}
          <p>{status}</p>
          <button
            onClick={() => {
              useGameStore.getState().quit();
              setMode('pick');
              setStatus('');
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
