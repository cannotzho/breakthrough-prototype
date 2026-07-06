/**
 * Dual playtest mode (Brief §4.4 — launch requirement).
 *
 * Two clients, one combat. The host builds the encounter and owns the
 * authoritative action sequence; the guest drives the NPC side (replacing the
 * §10 leftmost-play policy with human choice). Every applied action is
 * broadcast with a sequence number; both clients run the identical pure
 * reducer over the identical seeded initial state, so state transitions are
 * byte-identical to single-player for the same action sequence.
 *
 * Role gating: the host may perform player-side actions (and ACK/CHOOSE
 * blocking prompts); the guest may only stage NPC plays. The host validates
 * every guest request before applying + broadcasting it.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CombatAction } from '../engine';
import type { SetupInput } from '../engine';
import { supabase } from './supabaseClient';

export type PlaytestRole = 'host' | 'guest';

export const GUEST_ACTIONS: CombatAction['type'][] = ['NPC_PLAY_CARD', 'NPC_END_TURN'];

export interface SessionCallbacks {
  /** Guest: received the encounter setup — build the initial state from it. */
  onInit?: (setup: SerializableSetup, seed: number) => void;
  /** Both: an action was applied by the authority — apply it locally. */
  onAction: (seq: number, action: CombatAction) => void;
  /** Host: a guest requested an NPC action — validate & apply via authority. */
  onGuestRequest?: (action: CombatAction) => void;
  onPeerJoin?: () => void;
  onPeerLeave?: () => void;
}

/** SetupInput minus anything non-serializable (it is already plain data). */
export type SerializableSetup = Omit<SetupInput, 'seed'>;

export class PlaytestSession {
  readonly role: PlaytestRole;
  readonly code: string;
  private channel: RealtimeChannel;

  private initPayload: { setup: SerializableSetup; seed: number } | null = null;

  constructor(role: PlaytestRole, code: string, callbacks: SessionCallbacks) {
    this.role = role;
    this.code = code.trim().toUpperCase();

    this.channel = supabase.channel(`bt-playtest-${this.code}`, {
      config: { broadcast: { self: false }, presence: { key: role } },
    });

    this.channel.on('broadcast', { event: 'init' }, ({ payload }) => {
      if (this.role === 'guest') {
        callbacks.onInit?.(payload.setup as SerializableSetup, payload.seed as number);
      }
    });
    this.channel.on('broadcast', { event: 'action' }, ({ payload }) => {
      callbacks.onAction(payload.seq as number, payload.action as CombatAction);
    });
    this.channel.on('broadcast', { event: 'guest-request' }, ({ payload }) => {
      if (this.role === 'host') {
        const action = payload.action as CombatAction;
        if (GUEST_ACTIONS.includes(action.type)) {
          callbacks.onGuestRequest?.(action); // host authority validates + applies
        }
      }
    });
    this.channel.on('broadcast', { event: 'hello' }, () => {
      callbacks.onPeerJoin?.();
      // Re-send init so late joiners can sync a fresh combat.
      if (this.role === 'host' && this.initPayload) {
        void this.channel.send({ type: 'broadcast', event: 'init', payload: this.initPayload });
      }
    });
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
    });
    await this.channel.send({ type: 'broadcast', event: 'hello', payload: { role: this.role } });
  }

  /** Host: announce the combat setup (also re-sent on later joins). */
  async sendInit(setup: SerializableSetup, seed: number): Promise<void> {
    this.initPayload = { setup, seed };
    await this.channel.send({ type: 'broadcast', event: 'init', payload: this.initPayload });
  }

  /** Authority (host): broadcast an applied action. */
  async sendAction(seq: number, action: CombatAction): Promise<void> {
    await this.channel.send({ type: 'broadcast', event: 'action', payload: { seq, action } });
  }

  /** Guest: request an NPC action from the host authority. */
  async requestAction(action: CombatAction): Promise<void> {
    await this.channel.send({ type: 'broadcast', event: 'guest-request', payload: { action } });
  }

  async close(): Promise<void> {
    await supabase.removeChannel(this.channel);
  }
}

export function randomJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
