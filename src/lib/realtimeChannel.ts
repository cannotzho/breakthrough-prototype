import { supabase } from './supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CombatAction, CombatState } from '../combat/types';

export type DualRole = 'player' | 'npc';

export interface DualCallbacks {
  onAction: (action: CombatAction) => void;
  onGuestJoined: () => void;
  onStart: (state: CombatState) => void;
  onConfig: (config: unknown) => void;
}

export interface DualSession {
  channel: RealtimeChannel;
  roomCode: string;
  role: DualRole;
  callbacks: { current: Partial<DualCallbacks> };
  broadcastAction: (action: CombatAction) => void;
  broadcastStart: (initialState: CombatState) => void;
  broadcastConfig: (config: unknown) => void;
  disconnect: () => void;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(): DualSession {
  const roomCode = generateRoomCode();
  const callbacks: { current: Partial<DualCallbacks> } = { current: {} };

  const channel = supabase.channel(`dual-${roomCode}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'action' }, ({ payload }) => {
    callbacks.current.onAction?.(payload.action as CombatAction);
  });

  channel.on('broadcast', { event: 'join' }, () => {
    callbacks.current.onGuestJoined?.();
  });

  channel.subscribe();

  return {
    channel,
    roomCode,
    role: 'player',
    callbacks,
    broadcastAction: (action: CombatAction) => {
      channel.send({ type: 'broadcast', event: 'action', payload: { action } });
    },
    broadcastStart: (initialState: CombatState) => {
      channel.send({ type: 'broadcast', event: 'start', payload: { state: initialState } });
    },
    broadcastConfig: (config: unknown) => {
      channel.send({ type: 'broadcast', event: 'config', payload: { config } });
    },
    disconnect: () => {
      supabase.removeChannel(channel);
    },
  };
}

export function joinRoom(roomCode: string): DualSession {
  const callbacks: { current: Partial<DualCallbacks> } = { current: {} };

  const channel = supabase.channel(`dual-${roomCode}`, {
    config: { broadcast: { self: false } },
  });

  channel.on('broadcast', { event: 'action' }, ({ payload }) => {
    callbacks.current.onAction?.(payload.action as CombatAction);
  });

  channel.on('broadcast', { event: 'start' }, ({ payload }) => {
    callbacks.current.onStart?.(payload.state as CombatState);
  });

  channel.on('broadcast', { event: 'config' }, ({ payload }) => {
    callbacks.current.onConfig?.(payload.config);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({ type: 'broadcast', event: 'join', payload: {} });
    }
  });

  return {
    channel,
    roomCode,
    role: 'npc',
    callbacks,
    broadcastAction: (action: CombatAction) => {
      channel.send({ type: 'broadcast', event: 'action', payload: { action } });
    },
    broadcastStart: () => {},
    broadcastConfig: () => {},
    disconnect: () => {
      supabase.removeChannel(channel);
    },
  };
}

const AUTO_TRANSITIONS = new Set([
  'CHECK', 'RESOLVE_FIELD_TRIGGERS', 'RESOLVE_ENEMY_CARD', 'TRIGGER_ENEMY_ACTION',
]);

export function shouldBroadcast(action: CombatAction): boolean {
  return !AUTO_TRANSITIONS.has(action.type);
}

const PLAYER_ACTIONS = new Set<string>([
  'PLAY_CARD', 'PLACE_SHIELD', 'RESEQUENCE_SHIELDS', 'END_TURN',
  'SELECT_BOTM', 'COMBINE', 'CONFIRM_PLACE_AS_SHIELD', 'CONFIRM_BOTM',
  'ACTIVATE_ABILITY', 'DESTROY_TOKEN', 'DISMISS_REVEAL', 'DISMISS_DISCOVERY',
]);

const NPC_ACTIONS = new Set<string>([
  'DEV_PICK_ENEMY_FROM_DECK', 'DISMISS_REVEAL', 'DISMISS_DISCOVERY',
]);

export function isActionAllowed(action: CombatAction, role: DualRole): boolean {
  if (AUTO_TRANSITIONS.has(action.type)) return true;
  if (action.type === 'DEV_RESET') return false;
  if (action.type.startsWith('DEV_') && action.type !== 'DEV_PICK_ENEMY_FROM_DECK') return false;
  if (role === 'player') return PLAYER_ACTIONS.has(action.type);
  if (role === 'npc') return NPC_ACTIONS.has(action.type);
  return false;
}
