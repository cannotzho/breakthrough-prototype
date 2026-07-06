/**
 * Thin UI-side bridge to the pure engine. The engine owns all game state;
 * this store owns the driver concerns: action history, realtime session
 * plumbing, manual-enemy mode, and dev-panel patches.
 */
import { create } from 'zustand';
import type { CombatAction, CombatState, SetupInput } from '../engine';
import { buildInitialState, reduce } from '../engine';
import { GUEST_ACTIONS, PlaytestSession } from '../net/realtime';
import { saveCombatProgress } from '../net/persistence';

export interface GameStore {
  state: CombatState | null;
  setup: SetupInput | null;
  history: CombatAction[];
  /** Human drives the NPC hand locally (dev tool, v1.4 §10). */
  manualEnemy: boolean;
  session: PlaytestSession | null;
  role: 'solo' | 'host' | 'guest';
  peerConnected: boolean;
  devPanelOpen: boolean;
  resultSaved: boolean;

  startCombat: (setup: SetupInput) => void;
  /** Guest path: adopt a setup received over the wire. */
  adoptRemoteSetup: (setup: SetupInput) => void;
  dispatch: (action: CombatAction) => void;
  applyAuthorityAction: (seq: number, action: CombatAction) => void;
  setManualEnemy: (on: boolean) => void;
  setSession: (session: PlaytestSession | null, role: 'solo' | 'host' | 'guest') => void;
  setPeerConnected: (on: boolean) => void;
  toggleDevPanel: () => void;
  /** Dev panel direct patch — disabled in dual playtest (breaks determinism). */
  devPatch: (fn: (draft: CombatState) => void) => void;
  retry: () => void;
  quit: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  setup: null,
  history: [],
  manualEnemy: false,
  session: null,
  role: 'solo',
  peerConnected: false,
  devPanelOpen: false,
  resultSaved: false,

  startCombat: (setup) => {
    const state = buildInitialState(setup);
    set({ state, setup, history: [], resultSaved: false });
    const { session, role } = get();
    if (session && role === 'host') {
      const { seed, ...rest } = setup;
      void session.sendInit(rest, seed);
    }
  },

  adoptRemoteSetup: (setup) => {
    const state = buildInitialState(setup);
    set({ state, setup, history: [], resultSaved: false });
  },

  dispatch: (action) => {
    const { state, session, role, history } = get();
    if (!state) return;

    if (session && role === 'guest') {
      // Guests never apply locally first — the host authority orders actions.
      if (GUEST_ACTIONS.includes(action.type)) void session.requestAction(action);
      return;
    }

    const next = reduce(state, action);
    const applied = next.log.at(-1)?.type !== 'illegal-action';
    set({ state: next, history: applied ? [...history, action] : history });
    if (session && role === 'host' && applied) {
      void session.sendAction(history.length + 1, action);
    }
    maybePersist(next, set, get);
  },

  applyAuthorityAction: (_seq, action) => {
    const { state, history } = get();
    if (!state) return;
    const next = reduce(state, action);
    set({ state: next, history: [...history, action] });
    maybePersist(next, set, get);
  },

  setManualEnemy: (on) => set({ manualEnemy: on }),
  setSession: (session, role) => set({ session, role, peerConnected: false }),
  setPeerConnected: (on) => set({ peerConnected: on }),
  toggleDevPanel: () => set((s) => ({ devPanelOpen: !s.devPanelOpen })),

  devPatch: (fn) => {
    const { state, session } = get();
    if (!state || session) return; // never in dual playtest
    const draft = structuredClone(state);
    fn(draft);
    draft.logSeq += 1;
    draft.log.push({ seq: draft.logSeq, type: 'dev', message: 'Dev panel patch applied' });
    set({ state: draft });
  },

  retry: () => {
    const { setup } = get();
    if (!setup) return;
    // Retry keeps persistent breaks: carry the just-broken cores forward
    // (v1.4 §12) plus discovery state from the ended combat.
    const prev = get().state;
    const persistent = prev
      ? {
          ...setup.persistent,
          discoveredNuggetIds: prev.discoveredNuggetIds,
          playedNonRelevantCards: prev.playedNonRelevantCards,
          brokenCoreShieldCardIds: prev.config.retryable
            ? prev.npcCoreShields.filter((s) => s.broken).map((s) => s.cardId)
            : setup.persistent?.brokenCoreShieldCardIds,
        }
      : setup.persistent;
    const nextSetup: SetupInput = { ...setup, seed: (setup.seed * 1103515245 + 12345) | 0, persistent: persistent };
    get().startCombat(nextSetup);
  },

  quit: () => {
    const { session } = get();
    if (session) void session.close();
    set({ state: null, setup: null, history: [], session: null, role: 'solo', peerConnected: false });
  },
}));

function maybePersist(
  state: CombatState,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
): void {
  if (state.result && !get().resultSaved && get().role !== 'guest') {
    set({ resultSaved: true });
    void saveCombatProgress(state);
  }
}
