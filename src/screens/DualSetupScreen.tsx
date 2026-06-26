import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { EncounterConfig, CardDefinition, CombatState } from '../combat/types';
import { useDevCardStore } from '../stores/collectionStore';
import { useDeckStore } from '../stores/deckStore';
import { useDevEncounterStore } from '../stores/encounterStore';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from '../data/devCards';
import { createRoom, joinRoom, DualSession } from '../lib/realtimeChannel';

const INPUT = 'px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-white text-sm';
const LABEL = 'text-xs text-zinc-500';
const BTN = 'px-3 py-1.5 rounded border text-xs transition-colors';

type Mode = 'choose' | 'host' | 'guest';

interface DualSetupScreenProps {
  onBack: () => void;
  onStartCombat: (session: DualSession, config: EncounterConfig, playerDeckDefs: CardDefinition[]) => void;
  onGuestStartCombat: (session: DualSession, initialState: CombatState) => void;
}

function defaultDualConfig(): EncounterConfig {
  return {
    id: `dual_${Date.now()}`,
    displayName: 'Dual Playtest',
    startingPriority: 10,
    defaultRestorePriority: 10,
    priorityMode: 'frame',
    opponentPatience: 15,
    opponentShields: [],
    shieldBreakOrder: [],
    playerDummyShieldSlots: 10,
    allowedCoreShields: [],
    unbreakablePlayerShields: false,
    nuggetOverrides: [],
    traits: [],
    retryable: true,
    lieThreshold: 3,
    npcDummyShieldSlots: 10,
    enemyDeckCardIds: [],
  };
}

export default function DualSetupScreen({ onBack, onStartCombat, onGuestStartCombat }: DualSetupScreenProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [session, setSession] = useState<DualSession | null>(null);
  const [guestJoined, setGuestJoined] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [config, setConfig] = useState<EncounterConfig>(defaultDualConfig);
  const [playerDeckId, setPlayerDeckId] = useState('');
  const [enemyDeckId, setEnemyDeckId] = useState('');

  const decks = useDeckStore(s => s.decks);
  const allDecks = useMemo(() => Object.values(decks), [decks]);
  const getCard = useDevCardStore(s => s.getCard);
  const cardMap = useDevCardStore(s => s.cards);
  const savedEncounters = useDevEncounterStore(s => s.getAllEncounters)();

  const patch = useCallback((partial: Partial<EncounterConfig>) =>
    setConfig(c => ({ ...c, ...partial })), []);

  useEffect(() => {
    return () => { session?.disconnect(); };
  }, [session]);

  const handleHost = useCallback(() => {
    const s = createRoom();
    s.callbacks.current.onGuestJoined = () => setGuestJoined(true);
    setSession(s);
    setMode('host');
  }, []);

  const handleJoin = useCallback(() => {
    if (roomCodeInput.length !== 6) return;
    setConnectionStatus('connecting');
    const s = joinRoom(roomCodeInput.toUpperCase());
    s.callbacks.current.onConfig = (cfg) => {
      setConfig(cfg as EncounterConfig);
    };
    s.callbacks.current.onStart = (initialState: CombatState) => {
      onGuestStartCombat(s, initialState);
    };
    setSession(s);
    setMode('guest');
    setTimeout(() => setConnectionStatus('connected'), 1500);
  }, [roomCodeInput]);

  const resolvePlayerDeck = useCallback((): CardDefinition[] => {
    if (!playerDeckId) return [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS];
    const deck = decks[playerDeckId];
    if (!deck) return [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS];
    const defs: CardDefinition[] = [];
    for (const entry of deck.cards) {
      const card = getCard(entry.cardId);
      if (card) {
        for (let i = 0; i < entry.quantity; i++) defs.push(card);
      }
    }
    return defs.length > 0 ? defs : [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS];
  }, [playerDeckId, decks, getCard]);

  const handleStartCombat = useCallback(() => {
    if (!session) return;
    const playerDeckDefs = resolvePlayerDeck();
    session.broadcastConfig(config);
    onStartCombat(session, config, playerDeckDefs);
  }, [session, config, resolvePlayerDeck, onStartCombat]);

  const loadEnemyFromDeck = (deckId: string) => {
    const deck = decks[deckId];
    if (!deck) return;
    const ids: string[] = [];
    for (const entry of deck.cards) {
      for (let i = 0; i < entry.quantity; i++) ids.push(entry.cardId);
    }
    patch({ enemyDeckCardIds: ids });
    setEnemyDeckId(deckId);
  };

  const loadFromEncounter = (encId: string) => {
    const enc = savedEncounters.find(e => e.id === encId);
    if (enc) setConfig({ ...enc });
  };

  const allCards = useMemo(() => {
    const builtInIds = new Set([...DEV_SKILL_CARDS, ...DEV_ENEMY_CARDS].map(c => c.id));
    const custom = Object.values(cardMap).filter(c => !builtInIds.has(c.id));
    return [...DEV_ENEMY_CARDS, ...DEV_SKILL_CARDS, ...custom]
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cardMap]);

  const enemyQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const id of config.enemyDeckCardIds) map[id] = (map[id] ?? 0) + 1;
    return map;
  }, [config.enemyDeckCardIds]);

  const enemyUniqueEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: { cardId: string; qty: number }[] = [];
    for (const id of config.enemyDeckCardIds) {
      if (!seen.has(id)) {
        seen.add(id);
        entries.push({ cardId: id, qty: enemyQuantities[id] });
      }
    }
    return entries;
  }, [config.enemyDeckCardIds, enemyQuantities]);

  const resolveCardName = (cardId: string) => {
    if (cardMap[cardId]) return cardMap[cardId].name;
    const builtIn = [...DEV_SKILL_CARDS, ...DEV_ENEMY_CARDS].find(c => c.id === cardId);
    return builtIn?.name ?? cardId;
  };

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
        <motion.div
          className="flex flex-col items-center gap-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold tracking-widest uppercase">Dual Playtest</h1>
          <p className="text-zinc-400 text-sm max-w-md text-center">
            Two browsers, two controllers. One plays as the detective, the other controls the NPC responses.
          </p>
          <div className="flex gap-6">
            <motion.button
              onClick={handleHost}
              className="px-12 py-4 border-2 border-blue-500 text-blue-400 uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-colors rounded-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Host Session
            </motion.button>
            <motion.button
              onClick={() => setMode('guest')}
              className="px-12 py-4 border-2 border-red-500 text-red-400 uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors rounded-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Join Session
            </motion.button>
          </div>
          <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm mt-4">
            Back to Title
          </button>
        </motion.div>
      </div>
    );
  }

  if (mode === 'guest' && !session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
        <motion.div
          className="flex flex-col items-center gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h2 className="text-2xl font-bold tracking-widest uppercase">Join Session</h2>
          <p className="text-zinc-400 text-sm">Enter the 6-character room code from the host.</p>
          <input
            value={roomCodeInput}
            onChange={e => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ROOM CODE"
            className="text-center text-2xl tracking-[0.5em] font-mono px-6 py-3 rounded bg-zinc-800 border border-zinc-600 text-white w-64"
            maxLength={6}
            autoFocus
          />
          <motion.button
            onClick={handleJoin}
            disabled={roomCodeInput.length !== 6}
            className="px-8 py-3 border-2 border-red-500 text-red-400 uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Connect
          </motion.button>
          <button onClick={() => setMode('choose')} className="text-zinc-500 hover:text-white text-sm">
            Back
          </button>
        </motion.div>
      </div>
    );
  }

  // Guest waiting view
  if (mode === 'guest' && session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
        <motion.div
          className="flex flex-col items-center gap-6 max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h2 className="text-2xl font-bold tracking-widest uppercase">NPC Controller</h2>
          <div className="text-sm text-zinc-400 flex items-center gap-2">
            {connectionStatus === 'connecting' && <span className="animate-pulse text-amber-400">Connecting...</span>}
            {connectionStatus === 'connected' && <span className="text-green-400">Connected to room {session.roomCode}</span>}
          </div>
          <p className="text-zinc-500 text-sm text-center">
            Waiting for the host to configure and start the session. You will control the NPC side during combat.
          </p>

          {config.displayName !== 'Dual Playtest' && (
            <div className="border border-zinc-700 rounded p-4 w-full text-sm">
              <div className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Encounter Config</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-zinc-500">Name</span>
                <span className="text-zinc-300">{config.displayName}</span>
                <span className="text-zinc-500">Priority Mode</span>
                <span className="text-zinc-300">{config.priorityMode}</span>
                <span className="text-zinc-500">Starting Priority</span>
                <span className="text-zinc-300">{config.startingPriority}</span>
                <span className="text-zinc-500">Patience</span>
                <span className="text-zinc-300">{config.opponentPatience}</span>
                <span className="text-zinc-500">Enemy Deck</span>
                <span className="text-zinc-300">{config.enemyDeckCardIds.length} cards</span>
              </div>
            </div>
          )}

          <button onClick={() => { session.disconnect(); setSession(null); setMode('choose'); }}
            className="text-zinc-500 hover:text-white text-sm mt-4">
            Disconnect
          </button>
        </motion.div>
      </div>
    );
  }

  // Host config view
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-widest uppercase">Host: Configure Session</h1>
            <p className="text-zinc-500 text-sm mt-1">Set up the encounter, then start when the guest has joined.</p>
          </div>
          <button onClick={() => { session?.disconnect(); onBack(); }}
            className="text-zinc-500 hover:text-white text-sm">
            Cancel
          </button>
        </div>

        {/* Room Code + Status */}
        <div className="flex items-center gap-6 mb-6 p-4 border border-zinc-700 rounded-lg bg-zinc-900/50">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Room Code</div>
            <div className="text-3xl font-mono tracking-[0.5em] text-blue-400 font-bold">
              {session?.roomCode ?? '------'}
            </div>
          </div>
          <div className="flex-1 text-right">
            {guestJoined ? (
              <span className="text-green-400 text-sm font-medium">NPC Controller connected</span>
            ) : (
              <span className="text-amber-400 text-sm animate-pulse">Waiting for NPC controller to join...</span>
            )}
          </div>
        </div>

        {/* Load from Encounter */}
        {savedEncounters.length > 0 && (
          <div className="mb-4">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Load from Saved Encounter</span>
              <select
                defaultValue=""
                onChange={e => { if (e.target.value) loadFromEncounter(e.target.value); }}
                className={INPUT}
              >
                <option value="">-- Select encounter to load settings --</option>
                {savedEncounters.map(enc => (
                  <option key={enc.id} value={enc.id}>{enc.displayName || enc.id}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Config Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Display Name</span>
            <input value={config.displayName} onChange={e => patch({ displayName: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Priority Mode</span>
            <select value={config.priorityMode} onChange={e => patch({ priorityMode: e.target.value as 'frame' | 'classic' })} className={INPUT}>
              <option value="frame">Frame</option>
              <option value="classic">Classic</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Starting Priority</span>
            <input type="number" value={config.startingPriority}
              onChange={e => patch({ startingPriority: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Restore Priority</span>
            <input type="number" value={config.defaultRestorePriority}
              onChange={e => patch({ defaultRestorePriority: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Patience</span>
            <input type="number" value={config.opponentPatience}
              onChange={e => patch({ opponentPatience: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Lie Threshold</span>
            <input type="number" value={config.lieThreshold ?? 3}
              onChange={e => patch({ lieThreshold: Number(e.target.value) })} className={INPUT} />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Player Dummy Shields</span>
            <input type="number" min={0} max={30} value={config.playerDummyShieldSlots}
              onChange={e => patch({ playerDummyShieldSlots: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>NPC Dummy Shields</span>
            <input type="number" min={0} max={30} value={config.npcDummyShieldSlots}
              onChange={e => patch({ npcDummyShieldSlots: Number(e.target.value) })} className={INPUT} />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer col-span-2 self-end pb-1">
            <input type="checkbox" checked={config.unbreakablePlayerShields ?? false}
              onChange={e => patch({ unbreakablePlayerShields: e.target.checked })} />
            Unbreakable Player Shields
          </label>
        </div>

        {/* Player Deck */}
        <div className="border border-zinc-700 rounded p-3 mb-4">
          <span className="text-xs text-zinc-400 uppercase tracking-widest">Player Deck</span>
          <div className="mt-2">
            <select value={playerDeckId} onChange={e => setPlayerDeckId(e.target.value)} className={INPUT + ' w-full'}>
              <option value="">Default (dev cards)</option>
              {allDecks.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cards.reduce((n, e) => n + e.quantity, 0)} cards)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Enemy Deck */}
        <div className="border border-zinc-700 rounded p-3 mb-4">
          <span className="text-xs text-zinc-400 uppercase tracking-widest">
            Enemy Deck ({config.enemyDeckCardIds.length} cards)
          </span>

          {allDecks.length > 0 && (
            <div className="mt-2">
              <select value={enemyDeckId}
                onChange={e => { if (e.target.value) loadEnemyFromDeck(e.target.value); }}
                className={INPUT + ' w-full'}>
                <option value="">-- Load from deck --</option>
                {allDecks.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.cards.reduce((n, e) => n + e.quantity, 0)} cards)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Current enemy deck cards */}
          {enemyUniqueEntries.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              {enemyUniqueEntries.map(({ cardId, qty }) => (
                <div key={cardId} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-zinc-300">{resolveCardName(cardId)}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-500">x{qty}</span>
                    <button onClick={() => patch({ enemyDeckCardIds: config.enemyDeckCardIds.filter(id => id !== cardId) })}
                      className="text-red-500 hover:text-red-300 text-[10px]">
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add cards */}
          <div className="mt-2">
            <select defaultValue=""
              onChange={e => {
                if (e.target.value) {
                  patch({ enemyDeckCardIds: [...config.enemyDeckCardIds, e.target.value] });
                  e.target.value = '';
                }
              }}
              className={INPUT + ' w-full'}>
              <option value="">-- Add a card --</option>
              {allCards.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.color}, cost {c.cost})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Opponent Shields (Story) */}
        <div className="border border-zinc-700 rounded p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 uppercase tracking-widest">
              NPC Story Shields ({config.opponentShields.length})
            </span>
            <button onClick={() => patch({
              opponentShields: [...config.opponentShields, { cardId: `shield_${Date.now()}`, isHint: false, broken: false, loreDescription: '' }],
              shieldBreakOrder: [...(config.shieldBreakOrder ?? []), config.opponentShields.length],
            })} className={`${BTN} border-zinc-600 text-zinc-400 hover:text-white`}>
              + Add
            </button>
          </div>
          {config.opponentShields.map((shield, i) => (
            <div key={i} className="flex gap-2 items-center mt-2">
              <input value={shield.loreDescription ?? ''} placeholder="Lore description..."
                onChange={e => {
                  const shields = [...config.opponentShields];
                  shields[i] = { ...shields[i], loreDescription: e.target.value };
                  patch({ opponentShields: shields });
                }}
                className={INPUT + ' flex-1 text-xs'} />
              <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                <input type="checkbox" checked={shield.isHint}
                  onChange={e => {
                    const shields = [...config.opponentShields];
                    shields[i] = { ...shields[i], isHint: e.target.checked };
                    patch({ opponentShields: shields });
                  }} />
                Hint
              </label>
              <button onClick={() => {
                const shields = config.opponentShields.filter((_, j) => j !== i);
                patch({ opponentShields: shields, shieldBreakOrder: shields.map((_, j) => j) });
              }} className="text-red-500 hover:text-red-300 text-xs">x</button>
            </div>
          ))}
        </div>

        {/* Traits */}
        <div className="border border-zinc-700 rounded p-3 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 uppercase tracking-widest">Traits ({config.traits.length})</span>
            <button onClick={() => patch({ traits: [...config.traits, { id: `trait_${Date.now()}`, name: '', description: '', discovered: false }] })}
              className={`${BTN} border-zinc-600 text-zinc-400 hover:text-white`}>
              + Add
            </button>
          </div>
          {config.traits.map((trait, i) => (
            <div key={i} className="flex gap-2 items-center mt-2">
              <input value={trait.name} placeholder="Name"
                onChange={e => {
                  const traits = [...config.traits];
                  traits[i] = { ...traits[i], name: e.target.value };
                  patch({ traits });
                }}
                className={INPUT + ' w-24 text-xs'} />
              <input value={trait.description} placeholder="Description"
                onChange={e => {
                  const traits = [...config.traits];
                  traits[i] = { ...traits[i], description: e.target.value };
                  patch({ traits });
                }}
                className={INPUT + ' flex-1 text-xs'} />
              <button onClick={() => patch({ traits: config.traits.filter((_, j) => j !== i) })}
                className="text-red-500 hover:text-red-300 text-xs">x</button>
            </div>
          ))}
        </div>

        {/* Start Button */}
        <div className="flex justify-center">
          <motion.button
            onClick={handleStartCombat}
            disabled={!guestJoined || config.enemyDeckCardIds.length === 0}
            className="px-16 py-4 border-2 border-green-500 text-green-400 uppercase tracking-widest text-lg hover:bg-green-500 hover:text-white transition-colors rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Start Combat
          </motion.button>
        </div>
        {!guestJoined && (
          <p className="text-center text-zinc-600 text-xs mt-2">
            Waiting for NPC controller to join before starting...
          </p>
        )}
        {config.enemyDeckCardIds.length === 0 && guestJoined && (
          <p className="text-center text-amber-500/60 text-xs mt-2">
            Add at least one card to the enemy deck to start.
          </p>
        )}
      </div>
    </div>
  );
}
