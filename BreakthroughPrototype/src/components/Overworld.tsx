import { useRef, useEffect, useState, useCallback } from 'react';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';

/* ── Props ──────────────────────────────────────────────────── */
interface Props {
  completedEncounters: Set<string>;
  onStartCombat: (encounterId: string) => void;
  onResetGame: () => void;
  collectedCards: string[];
  compendium: string[];
  onCollectItem: (cardId: string) => void;
}

/* ── World constants ─────────────────────────────────────────── */
const MAP_W = 1600;
const MAP_H = 1200;
const SPEED = 3;
const P_R = 12;
const I_R = 64;

/* ── Buildings ───────────────────────────────────────────────── */
interface Bldg {
  x: number; y: number; w: number; h: number;
  wall: string; roof: string; glow: string; label: string;
}
const BUILDINGS: Bldg[] = [
  { x: 64,  y: 220, w: 352, h: 260, wall: '#2a1408', roof: '#3d1e0a', glow: '#d4720a', label: 'The Rusty Tap' },
  { x: 800, y: 120, w: 448, h: 360, wall: '#0d1a36', roof: '#162040', glow: '#4070e0', label: "Larkgrove Women's College" },
  { x: 64,  y: 720, w: 416, h: 320, wall: '#200a30', roof: '#380850', glow: '#c030d0', label: 'Seashaker Casino' },
  { x: 800, y: 720, w: 368, h: 320, wall: '#0a180a', roof: '#0f250f', glow: '#30a050', label: "Moneylender's Office" },
];

/* ── NPCs ────────────────────────────────────────────────────── */
interface NpcDef {
  id: string; x: number; y: number;
  color: string; name: string;
  encounterId: string; lockedUntil?: string; lockedUntilCompendium?: string;
}
const NPCS: NpcDef[] = [
  { id: 'gutterfang', x: 500, y: 430, color: '#8B4513', name: 'Gutterfang',       encounterId: 'gutterfang' },
  { id: 'maryann',   x: 800, y: 500, color: '#9b30d0', name: 'Mary-Ann Mariposa', encounterId: 'maryann',   lockedUntil: 'gutterfang', lockedUntilCompendium: 'bloodAnalysis' },
];

/* ── Items / Interaction points ──────────────────────────────── */
interface ItemDef {
  id: string; label: string;
  x: number; y: number; radius: number;
  cardRewards: string[];
  lockedUntilEncounter?: string;
  lockedUntilCompendium?: string;
  panelTitle?: string;
  panelText?: string;
}
const ITEMS: ItemDef[] = [
  { id: 'crumpledNote', label: 'Crumpled Note', x: 460, y: 510, radius: 48, cardRewards: ['bloodTrail'] },
  {
    id: 'rustytapEavesdrop1', label: 'Overheard', x: 200, y: 492, radius: 52,
    cardRewards: ['loanLedger'],
    lockedUntilEncounter: 'gutterfang',
    panelTitle: 'The Rusty Tap — Overheard',
    panelText: 'You lean against the bar, nursing a glass you\'re not drinking. Two men in the corner lower their voices — but not enough. "Mariposa lot borrowed heavy from the Fellas on Mill Street. Word is repayments started early. Too early for a family that broke." The other man shrugs. "None of my business." You set down your glass. It is.',
  },
  {
    id: 'moneylendingOffice', label: 'The Ledger', x: 984, y: 1052, radius: 52,
    cardRewards: ['distributionNet'],
    lockedUntilCompendium: 'loanLedger',
    panelTitle: "The Moneylender's Office — The Ledger",
    panelText: 'The side door off the alley is unlocked — sloppy work. You slip inside. The ledger\'s open on the desk. You work through the columns quickly. The Mariposas borrowed heavily. But the repayment schedule is wrong: accelerating well above the interest rate, consistent, monthly — more than a family paying down old debt would manage. That pattern has a name. Active income, running very hot.',
  },
  {
    id: 'rustytapEavesdrop2', label: 'Overheard', x: 200, y: 492, radius: 52,
    cardRewards: ['larkgroveLead'],
    lockedUntilCompendium: 'distributionNet',
    panelTitle: 'The Rusty Tap — Overheard Again',
    panelText: 'Same corner, different night. A woman two stools down is talking too freely. "Victor Mariposa was in here last week — throwing silver around, jumpy as a cat in a dog kennel." Her companion nods. "The sister\'s worse. Kara. She was Red Moon, you know. Got out before it collapsed, but mud sticks." A pause, then quieter: "Word is the one to find is the other one. College girl. Larkgrove. Goes by Mary-Ann."',
  },
  {
    id: 'larkgroveObservation', label: 'Forensics Workshop', x: 1060, y: 508, radius: 52,
    cardRewards: ['bloodAnalysis', 'collegeRecords'],
    lockedUntilCompendium: 'larkgroveLead',
    panelTitle: "Larkgrove Women's College — Forensics Workshop",
    panelText: "The contact from White Deer PD runs forensics workshops at the college — keeps his hand in, he says. You ask to sit in. The room is a converted lab: twenty students, half of them watching the clock. One isn't. She works near the back, away from the clusters — each sample laid out in sequence, each result noted before the next is opened. You recognise the technique: magical blood analysis, advanced enough that most licensed practitioners don't bother with it. She doesn't look like someone doing homework. She looks like someone who already knows the answers. You ask your contact her name on the way out. Mary-Ann Mariposa. Specially recommended, he says. Best he's ever seen.",
  },
];
const LS_COLLECTED_ITEMS = 'bt_collected_items';

/* ── Dialog text ─────────────────────────────────────────────── */
const DIALOG_TEXT: Record<string, string> = {
  gutterfang: 'A rough figure in a blood-stained coat. He\'s trying to act casual — but his hands won\'t stop moving.',
  maryann:    'She greets you with a smile that doesn\'t reach her eyes. There\'s steel beneath the silk.',
};

/* ── Pre-computed cobblestone dots ───────────────────────────── */
function lcg(n: number) { return ((n * 1664525 + 1013904223) >>> 0) / 0x100000000; }
const COBBLES = Array.from({ length: 700 }, (_, i) => ({
  x: lcg(i * 3) * MAP_W,
  y: lcg(i * 3 + 1) * MAP_H,
  r: lcg(i * 3 + 2) * 2 + 0.5,
}));

/* ── Helpers ─────────────────────────────────────────────────── */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  coat: string, skin: string, hat: string,
) {
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(x, y + 14, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = coat;  ctx.fillRect(x - 7, y - 2, 14, 18);
  ctx.fillStyle = skin;  ctx.fillRect(x - 5, y - 14, 10, 12);
  ctx.fillStyle = hat;   ctx.fillRect(x - 8, y - 18, 16, 4);
                         ctx.fillRect(x - 5, y - 26, 10, 9);
}

function isBlocked(x: number, y: number): boolean {
  for (const b of BUILDINGS) {
    if (x > b.x + P_R && x < b.x + b.w - P_R &&
        y > b.y + P_R && y < b.y + b.h - P_R) return true;
  }
  return x < P_R || x > MAP_W - P_R || y < P_R || y > MAP_H - P_R;
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, border: 'none', color: '#fff',
    padding: '8px 18px', borderRadius: 6,
    fontFamily: 'monospace', fontSize: 13, cursor: 'pointer',
  };
}

/* ── Component ───────────────────────────────────────────────── */
export default function Overworld({ completedEncounters, onStartCombat, onResetGame, collectedCards, compendium, onCollectItem }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const keysRef     = useRef(new Set<string>());
  const playerRef   = useRef({ x: 576, y: 600 });
  const completedRef = useRef(completedEncounters);
  completedRef.current = completedEncounters;
  const nearNpcRef  = useRef<NpcDef | null>(null);
  const prevNearId  = useRef<string | null>(null);
  const rafRef      = useRef(0);

  // Joystick
  const joyRef      = useRef({ active: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0 });
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });

  const [nearNpc,         setNearNpc]         = useState<NpcDef | null>(null);
  const [dialog,          setDialog]          = useState<{ npc: NpcDef; locked: boolean; done: boolean; lockHint?: string } | null>(null);
  const [isTouchDevice,   setIsTouchDevice]   = useState(false);
  const [showCollection,  setShowCollection]  = useState(false);
  const [showNotes,       setShowNotes]       = useState(false);

  const [collectedItems, setCollectedItems] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LS_COLLECTED_ITEMS);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const collectedItemsRef = useRef(collectedItems);
  collectedItemsRef.current = collectedItems;

  const compendiumRef = useRef(compendium);
  compendiumRef.current = compendium;

  const nearItemRef      = useRef<ItemDef | null>(null);
  const prevNearItemId   = useRef<string | null>(null);
  const [nearItem,       setNearItem]        = useState<ItemDef | null>(null);
  const [pickupNotif,    setPickupNotif]     = useState<{ text: string; key: number } | null>(null);
  const [interactionPanel, setInteractionPanel] = useState<ItemDef | null>(null);
  const onCollectItemRef = useRef(onCollectItem);
  onCollectItemRef.current = onCollectItem;

  useEffect(() => {
    localStorage.setItem(LS_COLLECTED_ITEMS, JSON.stringify([...collectedItems]));
  }, [collectedItems]);

  useEffect(() => {
    if (!pickupNotif) return;
    const t = setTimeout(() => setPickupNotif(null), 2000);
    return () => clearTimeout(t);
  }, [pickupNotif]);

  /* ── Interact ─────────────────────────────────────────────── */
  const interact = useCallback(() => {
    const item = nearItemRef.current;
    if (item && !collectedItemsRef.current.has(item.id)) {
      if (item.panelText) {
        setInteractionPanel(item);
        return;
      }
      // Immediate pickup (no narrative panel)
      setCollectedItems(prev => new Set([...prev, item.id]));
      for (const cardId of item.cardRewards) {
        onCollectItemRef.current(cardId);
      }
      const cardName = item.cardRewards.map(id => CARDS[id]?.name ?? id).join(', ');
      setPickupNotif({ text: `+ ${cardName} added to compendium`, key: Date.now() });
      return;
    }
    const npc = nearNpcRef.current;
    if (!npc) return;
    const encounterLock  = !!npc.lockedUntil && !completedRef.current.has(npc.lockedUntil);
    const compendiumLock = !!npc.lockedUntilCompendium && !compendiumRef.current.includes(npc.lockedUntilCompendium);
    const locked  = encounterLock || compendiumLock;
    const lockHint = encounterLock
      ? 'Find Gutterfang first.'
      : compendiumLock
      ? "Visit Larkgrove Women's College first."
      : undefined;
    const done   = completedRef.current.has(npc.encounterId);
    setDialog({ npc, locked, done, lockHint });
  }, []);

  /* ── Render ───────────────────────────────────────────────── */
  const render = useCallback((ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    const { x: px, y: py } = playerRef.current;
    const camX = Math.max(0, Math.min(MAP_W - cw, px - cw / 2));
    const camY = Math.max(0, Math.min(MAP_H - ch, py - ch / 2));

    ctx.save();
    ctx.translate(-camX, -camY);

    // Ground
    ctx.fillStyle = '#090912';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Cobblestone variation
    ctx.fillStyle = '#10101f';
    for (const c of COBBLES) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    }

    // Alley strip (between pub and college)
    ctx.fillStyle = '#0c0c1a';
    ctx.fillRect(416, 200, 384, 520);

    // Buildings
    for (const b of BUILDINGS) {
      // Ambient glow spilling onto ground
      const g = ctx.createRadialGradient(
        b.x + b.w / 2, b.y + b.h, 0,
        b.x + b.w / 2, b.y + b.h, Math.max(b.w, b.h),
      );
      g.addColorStop(0, b.glow + '22'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - 80, b.y, b.w + 160, b.h + 120);

      // Wall
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Roof ridge
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, 20);

      // Windows
      const wW = 20, wH = 14, wPad = 32;
      const cols = Math.max(1, Math.floor((b.w - wPad * 2) / (wW + wPad)));
      ctx.fillStyle = b.glow + 'aa';
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillRect(
            b.x + wPad + col * (wW + wPad),
            b.y + 32 + row * (wH + 22),
            wW, wH,
          );
        }
      }

      // Door
      ctx.fillStyle = '#050510';
      ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h - 38, 24, 38);

      // Building label
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = b.glow;
      ctx.shadowColor = b.glow;
      ctx.shadowBlur = 12;
      ctx.fillText(b.label, b.x + b.w / 2, b.y - 10);
      ctx.shadowBlur = 0;
    }

    // NPCs
    const completed = completedRef.current;
    for (const npc of NPCS) {
      const encounterLock  = !!npc.lockedUntil && !completed.has(npc.lockedUntil);
      const compendiumLock = !!npc.lockedUntilCompendium && !compendiumRef.current.includes(npc.lockedUntilCompendium);
      const locked  = encounterLock || compendiumLock;
      const npcLockHint = encounterLock
        ? 'Find Gutterfang first'
        : compendiumLock
        ? 'Visit Larkgrove College first'
        : '';
      const done    = completed.has(npc.encounterId);
      const ddx     = px - npc.x, ddy = py - npc.y;
      const inRange = Math.sqrt(ddx * ddx + ddy * ddy) < I_R;

      // Dashed range ring when close
      if (inRange) {
        ctx.strokeStyle = locked ? '#44444488' : '#ffffff88';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(npc.x, npc.y, I_R, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }

      // Draw NPC
      const coat = locked ? '#2a2a2a' : npc.color;
      const skin = locked ? '#1e1e1e' : '#f5c5a0';
      const hat  = locked ? '#141414' : '#111111';
      drawPerson(ctx, npc.x, npc.y, coat, skin, hat);

      // Name label
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = done ? '#4ecca3' : locked ? '#444' : '#cccccc';
      ctx.fillText(locked ? '???' : npc.name, npc.x, npc.y - 33);

      if (done) {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#4ecca3';
        ctx.fillText('✓ Interrogated', npc.x, npc.y - 21);
      }

      // Interaction hint under NPC
      if (inRange && !locked) {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#ffffffcc';
        ctx.fillText(done ? '[E] Review' : '[E] Talk', npc.x, npc.y + 32);
      } else if (inRange && locked) {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(npcLockHint, npc.x, npc.y + 32);
      }
    }

    // Items
    const now = Date.now();
    for (const item of ITEMS) {
      if (collectedItemsRef.current.has(item.id)) continue;
      if (item.lockedUntilEncounter && !completedRef.current.has(item.lockedUntilEncounter)) continue;
      if (item.lockedUntilCompendium && !compendiumRef.current.includes(item.lockedUntilCompendium)) continue;
      const idx = px - item.x, idy = py - item.y;
      const inRange = Math.sqrt(idx * idx + idy * idy) < item.radius;
      const pulse = 0.5 + 0.5 * Math.sin(now / 500);

      // Ambient glow
      const ig = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, 26);
      ig.addColorStop(0, `rgba(200, 140, 50, ${0.45 + 0.3 * pulse})`);
      ig.addColorStop(1, 'transparent');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.arc(item.x, item.y, 26, 0, Math.PI * 2); ctx.fill();

      // Orb
      ctx.fillStyle = `rgba(255, 190, 80, ${0.75 + 0.25 * pulse})`;
      ctx.shadowColor = '#ffaa20';
      ctx.shadowBlur = 8 + 6 * pulse;
      ctx.beginPath(); ctx.arc(item.x, item.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c8a96e';
      ctx.shadowColor = '#c8a96e';
      ctx.shadowBlur = 6;
      ctx.fillText(item.label, item.x, item.y - 16);
      ctx.shadowBlur = 0;

      if (inRange) {
        ctx.strokeStyle = '#c8a96e88';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;

        ctx.font = '10px monospace';
        ctx.fillStyle = '#ffffffcc';
        ctx.textAlign = 'center';
        ctx.fillText('[E] Examine', item.x, item.y + 22);
      }
    }

    // Player (detective in dark coat)
    drawPerson(ctx, px, py, '#1e2030', '#f5c5a0', '#0a0a0a');
    // White shirt collar
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(px - 3, py - 2, 6, 5);

    ctx.restore();
  }, []);

  /* ── Game loop ────────────────────────────────────────────── */
  const tick = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Keep drawing buffer in sync with CSS layout size
    const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
    if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
      canvas.width = cw; canvas.height = ch;
    }

    // Input: keyboard + joystick
    const k = keysRef.current;
    const j = joyRef.current;
    let dx = 0, dy = 0;
    if (k.has('ArrowLeft')  || k.has('a') || k.has('A')) dx -= 1;
    if (k.has('ArrowRight') || k.has('d') || k.has('D')) dx += 1;
    if (k.has('ArrowUp')    || k.has('w') || k.has('W')) dy -= 1;
    if (k.has('ArrowDown')  || k.has('s') || k.has('S')) dy += 1;
    if (j.active) { dx += j.dx; dy += j.dy; }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dx /= len; dy /= len; }

    const p = playerRef.current;
    const nx = p.x + dx * SPEED;
    const ny = p.y + dy * SPEED;
    if (!isBlocked(nx, p.y)) p.x = nx;
    if (!isBlocked(p.x, ny)) p.y = ny;

    // Near-NPC check (only update state on change to avoid re-render storm)
    let near: NpcDef | null = null;
    for (const npc of NPCS) {
      const ddx = p.x - npc.x, ddy = p.y - npc.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < I_R) { near = npc; break; }
    }
    nearNpcRef.current = near;
    const nearId = near?.id ?? null;
    if (nearId !== prevNearId.current) {
      prevNearId.current = nearId;
      setNearNpc(near);
    }

    // Near-item check
    let nearFoundItem: ItemDef | null = null;
    for (const item of ITEMS) {
      if (collectedItemsRef.current.has(item.id)) continue;
      if (item.lockedUntilEncounter && !completedRef.current.has(item.lockedUntilEncounter)) continue;
      if (item.lockedUntilCompendium && !compendiumRef.current.includes(item.lockedUntilCompendium)) continue;
      const ddx = p.x - item.x, ddy = p.y - item.y;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < item.radius) { nearFoundItem = item; break; }
    }
    nearItemRef.current = nearFoundItem;
    const nearItemId = nearFoundItem?.id ?? null;
    if (nearItemId !== prevNearItemId.current) {
      prevNearItemId.current = nearItemId;
      setNearItem(nearFoundItem);
    }

    render(ctx, canvas.width, canvas.height);
    rafRef.current = requestAnimationFrame(tick);
  }, [render]);

  /* ── Setup / teardown ─────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function onKeyDown(e: KeyboardEvent) {
      keysRef.current.add(e.key);
      if (!e.repeat && (e.key === 'e' || e.key === 'E' || e.key === ' ')) {
        e.preventDefault();
        interact();
      }
      if (!e.repeat && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setShowCollection(prev => !prev);
      }
      if (!e.repeat && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setShowNotes(prev => !prev);
      }
    }
    function onKeyUp(e: KeyboardEvent) { keysRef.current.delete(e.key); }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tick, interact]);

  /* ── Joystick handlers ────────────────────────────────────── */
  function handleJoyStart(e: React.TouchEvent) {
    e.preventDefault();
    setIsTouchDevice(true);
    const t = e.changedTouches[0];
    joyRef.current = { active: true, id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 };
    setJoyKnob({ x: 0, y: 0 });
  }
  function handleJoyMove(e: React.TouchEvent) {
    e.preventDefault();
    const j = joyRef.current;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== j.id) continue;
      const rdx = t.clientX - j.sx, rdy = t.clientY - j.sy;
      const dist = Math.sqrt(rdx * rdx + rdy * rdy);
      const maxR = 28;
      const scale = dist > maxR ? maxR / dist : 1;
      const kx = (rdx * scale) / maxR;
      const ky = (rdy * scale) / maxR;
      joyRef.current = { ...j, dx: kx, dy: ky };
      setJoyKnob({ x: kx, y: ky });
    }
  }
  function handleJoyEnd(e: React.TouchEvent) {
    e.preventDefault();
    joyRef.current = { ...joyRef.current, active: false, dx: 0, dy: 0 };
    setJoyKnob({ x: 0, y: 0 });
  }

  /* ── Canvas tap-to-interact ───────────────────────────────── */
  function handleCanvasTap(e: React.TouchEvent) {
    setIsTouchDevice(true);
    if (e.changedTouches.length === 1) interact();
  }

  /* ── Objective text ───────────────────────────────────────── */
  const gDone = completedEncounters.has('gutterfang');
  const mDone = completedEncounters.has('maryann');
  const hasLoanLedger      = compendium.includes('loanLedger');
  const hasDistributionNet = compendium.includes('distributionNet');
  const hasLarkgroveLead   = compendium.includes('larkgroveLead');
  const hasCollegeVisit    = compendium.includes('bloodAnalysis');
  const objective = mDone
    ? 'Case closed.'
    : !gDone
    ? 'Find Gutterfang — The Alley.'
    : !hasLoanLedger
    ? 'Eavesdrop at The Rusty Tap.'
    : !hasDistributionNet
    ? "Search The Moneylender's Office."
    : !hasLarkgroveLead
    ? 'Investigate the Mariposa family.'
    : !hasCollegeVisit
    ? "Visit Larkgrove Women's College."
    : 'Confront Mary-Ann.';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#090912' }}>
      <style>{`
        @keyframes itemPickupFade {
          0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
          80%  { opacity: 0.9; transform: translateX(-50%) translateY(-12px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onTouchStart={handleCanvasTap}
      />

      {/* Objective tracker — top-right */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: '#000000bb', border: '1px solid #1e2a40',
        padding: '8px 14px', borderRadius: 6,
        fontFamily: 'monospace', fontSize: 12, color: '#ccc',
        lineHeight: 1.5,
      }}>
        <span style={{ color: '#e94560', fontWeight: 'bold', letterSpacing: 1 }}>OBJECTIVE</span>
        <br />{objective}
      </div>

      {/* Controls hint — top-left, fades after mount */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: '#000000bb', border: '1px solid #1e2a40',
        padding: '8px 14px', borderRadius: 6,
        fontFamily: 'monospace', fontSize: 11, color: '#666',
        lineHeight: 1.6,
      }}>
        {isTouchDevice ? 'Joystick · Tap to talk' : 'WASD / Arrows to move · E to talk'}
      </div>

      {/* Near-item hint (keyboard devices only, takes priority over NPC hint) */}
      {nearItem && !isTouchDevice && !dialog && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          background: '#000000cc', border: '1px solid #c8a96e',
          padding: '6px 16px', borderRadius: 20,
          fontFamily: 'monospace', fontSize: 13, color: '#c8a96e',
          pointerEvents: 'none',
        }}>
          Press E to examine {nearItem.label}
        </div>
      )}

      {/* Near-NPC hint (keyboard devices only) */}
      {!nearItem && nearNpc && !isTouchDevice && !dialog && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          background: '#000000cc', border: '1px solid #555',
          padding: '6px 16px', borderRadius: 20,
          fontFamily: 'monospace', fontSize: 13, color: '#fff',
          pointerEvents: 'none',
        }}>
          Press E to talk to {nearNpc.name}
        </div>
      )}

      {/* Item pickup notification */}
      {pickupNotif && (
        <div key={pickupNotif.key} style={{
          position: 'absolute', bottom: 96, left: '50%',
          background: '#000000cc', border: '1px solid #c8a96e55',
          padding: '6px 18px', borderRadius: 20,
          fontFamily: 'monospace', fontSize: 13, color: '#c8a96e',
          animation: 'itemPickupFade 2s ease-out forwards',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          {pickupNotif.text}
        </div>
      )}

      {/* Virtual joystick (touch devices) */}
      {isTouchDevice && (
        <div
          style={{
            position: 'absolute', bottom: 32, left: 32,
            width: 96, height: 96, borderRadius: '50%',
            border: '2px solid #ffffff33', background: '#00000066',
            touchAction: 'none', userSelect: 'none',
          }}
          onTouchStart={handleJoyStart}
          onTouchMove={handleJoyMove}
          onTouchEnd={handleJoyEnd}
        >
          <div style={{
            position: 'absolute',
            left:  48 + joyKnob.x * 28 - 16,
            top:   48 + joyKnob.y * 28 - 16,
            width: 32, height: 32, borderRadius: '50%',
            background: '#ffffff55', border: '1px solid #fff',
            pointerEvents: 'none',
          }} />
        </div>
      )}

      {/* Notes button — bottom-right, above Compendium */}
      <button
        onClick={() => setShowNotes(prev => !prev)}
        style={{
          position: 'absolute', bottom: 84, right: 12,
          background: '#000000bb', border: '1px solid #1e2a40',
          padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 11,
          color: '#c8a96e',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c8a96e'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e2a40'; }}
        title="Notes [N]"
      >
        Notes [N]
      </button>

      {/* Intel collection button — bottom-right, above New Game */}
      <button
        onClick={() => setShowCollection(prev => !prev)}
        style={{
          position: 'absolute', bottom: 48, right: 12,
          background: '#000000bb', border: '1px solid #1e2a40',
          padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 11,
          color: '#4ecca3',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ecca3'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e2a40'; }}
        title="Compendium [I]"
      >
        Compendium [{compendium.length}]
      </button>

      {/* Dev Tools link — bottom-right, dev builds only */}
      {import.meta.env.DEV && (
        <a
          href="./dev"
          style={{
            position: 'absolute', bottom: 120, right: 12,
            background: '#000000bb', border: '1px solid #1e2a40',
            padding: '6px 14px', borderRadius: 6,
            fontFamily: 'monospace', fontSize: 11, color: '#555',
            cursor: 'pointer', textDecoration: 'none', display: 'block',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#00d9ff'; (e.currentTarget as HTMLAnchorElement).style.color = '#00d9ff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#1e2a40'; (e.currentTarget as HTMLAnchorElement).style.color = '#555'; }}
        >
          Dev Tools
        </a>
      )}

      {/* New Game button — bottom-right corner */}
      <button
        onClick={onResetGame}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          background: '#000000bb', border: '1px solid #1e2a40',
          padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 11, color: '#666',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#e94560'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e94560'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#666'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e2a40'; }}
      >
        New Game
      </button>

      {/* Intel collection panel */}
      {showCollection && (
        <div style={{
          position: 'absolute', inset: 0, background: '#000000aa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
          onClick={() => setShowCollection(false)}
        >
          <div
            style={{
              background: '#16213e', border: '2px solid #0f3460',
              borderRadius: 12, padding: 28, maxWidth: 420, width: '100%',
              maxHeight: '80vh', overflow: 'auto',
              fontFamily: 'monospace', color: '#ddd',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ color: '#4ecca3', fontWeight: 'bold', fontSize: 16, margin: 0 }}>Compendium</p>
              <button
                onClick={() => setShowCollection(false)}
                style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {compendium.length === 0 ? (
              <p style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                No cards available.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, justifyItems: 'center' }}>
                {compendium.map((id) => {
                  const card = CARDS[id];
                  if (!card) return null;
                  const obtained = collectedCards.includes(id);
                  return (
                    <div key={id} style={{ opacity: obtained ? 1 : 0.4, position: 'relative' }}>
                      <CardComponent card={card} />
                      {obtained && (
                        <div style={{
                          position: 'absolute', bottom: 4, right: 4,
                          background: '#0a2a1e', border: '1px solid #4ecca3',
                          borderRadius: 3, padding: '1px 4px',
                          fontSize: 8, color: '#4ecca3', letterSpacing: 1,
                          pointerEvents: 'none',
                        }}>
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ color: '#333', fontSize: 10, textAlign: 'center', marginTop: 8 }}>
              Press I to close
            </p>
          </div>
        </div>
      )}

      {/* Notes panel */}
      {showNotes && (
        <div style={{
          position: 'absolute', inset: 0, background: '#000000aa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
          onClick={() => setShowNotes(false)}
        >
          <div
            style={{
              background: '#1a1408', border: '2px solid #4a3820',
              borderRadius: 4, padding: 32, maxWidth: 480, width: '100%',
              maxHeight: '82vh', overflow: 'auto',
              fontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
              color: '#e8dfc4',
              boxShadow: '0 0 40px #00000099, inset 0 0 60px #00000044',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ borderBottom: '1px solid #4a3820', marginBottom: 20, paddingBottom: 12 }}>
              <p style={{ color: '#c8a96e', fontWeight: 'bold', fontSize: 20, margin: '0 0 4px', letterSpacing: 2, textTransform: 'uppercase' }}>
                Case Notes
              </p>
              <p style={{ color: '#6a5840', fontSize: 11, margin: 0, fontFamily: 'monospace', letterSpacing: 1 }}>
                DETECTIVE'S FIELD JOURNAL — RESTRICTED
              </p>
            </div>

            {/* Section: The Case */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ color: '#c8a96e', fontSize: 13, fontWeight: 'bold', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid #2a2010', paddingBottom: 6 }}>
                The Case
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.8, margin: '0 0 8px', color: '#d4c8a8' }}>
                Three dockworkers turned up dry in a week — not a drop of blood left in them. The Harbour Authority
                is calling it a disease. Someone higher up knows better.
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: '#d4c8a8' }}>
                Every trail leads back to the same stretch of cobblestone between the Rusty Tap and the College.
                There's a blood trade running through this city — quiet, expensive, and protected. Finding out
                who's running it means getting to people who don't want to be found.
              </p>
            </div>

            {/* Section: Persons of Interest */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ color: '#c8a96e', fontSize: 13, fontWeight: 'bold', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid #2a2010', paddingBottom: 6 }}>
                Persons of Interest
              </p>

              {/* Gutterfang */}
              <div style={{ marginBottom: 16, paddingLeft: 12, borderLeft: '2px solid #3a2a10' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 'bold', margin: 0, color: '#e8dfc4' }}>Gutterfang</p>
                  {completedEncounters.has('gutterfang') ? (
                    <span style={{ fontSize: 10, color: '#4ecca3', fontFamily: 'monospace', background: '#0a2a1e', border: '1px solid #4ecca3', borderRadius: 3, padding: '1px 6px' }}>
                      ✓ Interviewed
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#6a5840', fontFamily: 'monospace' }}>Not yet interviewed</span>
                  )}
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.7, margin: 0, color: '#a89878' }}>
                  Operates out of the alley district. Known fence for stolen medical stock — surgical tools, stored
                  blood, unmarked vials. Blood-stained coat, nervous hands. Either he's guilty or he's seen
                  something that scared him badly.
                </p>
              </div>

              {/* Mary-Ann */}
              <div style={{ paddingLeft: 12, borderLeft: '2px solid #3a2a10' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 'bold', margin: 0, color: '#e8dfc4' }}>Mary-Ann Mariposa</p>
                  {completedEncounters.has('maryann') ? (
                    <span style={{ fontSize: 10, color: '#4ecca3', fontFamily: 'monospace', background: '#0a2a1e', border: '1px solid #4ecca3', borderRadius: 3, padding: '1px 6px' }}>
                      ✓ Interviewed
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#6a5840', fontFamily: 'monospace' }}>Not yet interviewed</span>
                  )}
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.7, margin: 0, color: '#a89878' }}>
                  Larkgrove Women's College — officially, a patroness of the sciences. Rumoured to have funded
                  three private research contracts in the last year, all classified. Charming. Dangerous. Does not
                  rattle easily.
                </p>
              </div>
            </div>

            {/* Section: Evidence */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#c8a96e', fontSize: 13, fontWeight: 'bold', margin: '0 0 10px', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid #2a2010', paddingBottom: 6 }}>
                Evidence
              </p>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, lineHeight: 1.9, color: '#a89878' }}>
                <li>Unsigned ledger page — lists "Type O, 12 units" delivered to a Seashaker Casino storage room.</li>
                <li>Matchbook from the Rusty Tap, found on the third victim. Back room meetings, most likely.</li>
                <li>Moneylender's Office records show a lump-sum payment to an unnamed "medical contractor" — same week as the first death.</li>
                <li>
                  <span style={{ color: '#c8a96e' }}>NOTE:</span> The Harbour Authority physician was pulled off the case on day two. Someone has reach.
                </li>
              </ul>
            </div>

            <p style={{ color: '#3a2a10', fontSize: 10, textAlign: 'center', marginTop: 8, fontFamily: 'monospace' }}>
              Press N to close
            </p>
          </div>
        </div>
      )}

      {/* Interaction panel overlay */}
      {interactionPanel && (
        <div style={{
          position: 'absolute', inset: 0, background: '#000000aa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: '#16213e', border: '2px solid #0f3460',
            borderRadius: 12, padding: 28, maxWidth: 440, width: '100%',
            fontFamily: 'monospace', color: '#ddd',
          }}>
            <p style={{ color: '#c8a96e', fontWeight: 'bold', fontSize: 15, margin: '0 0 14px', letterSpacing: 1 }}>
              {interactionPanel.panelTitle}
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.75, margin: '0 0 20px', color: '#aaa' }}>
              {interactionPanel.panelText}
            </p>
            <div style={{ borderTop: '1px solid #1e3060', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#4ecca3' }}>
                + {interactionPanel.cardRewards.map(id => CARDS[id]?.name ?? id).join(', ')} added to compendium
              </span>
              <button
                onClick={() => {
                  const item = interactionPanel;
                  setCollectedItems(prev => new Set([...prev, item.id]));
                  for (const cardId of item.cardRewards) {
                    onCollectItemRef.current(cardId);
                  }
                  const cardName = item.cardRewards.map(id => CARDS[id]?.name ?? id).join(', ');
                  setPickupNotif({ text: `+ ${cardName} added to compendium`, key: Date.now() });
                  setInteractionPanel(null);
                }}
                style={btnStyle('#0f3460')}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog overlay */}
      {dialog && (
        <div style={{
          position: 'absolute', inset: 0, background: '#000000aa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: '#16213e', border: '2px solid #0f3460',
            borderRadius: 12, padding: 28, maxWidth: 360, width: '100%',
            fontFamily: 'monospace', color: '#ddd', textAlign: 'center',
          }}>
            <p style={{ color: '#e94560', fontWeight: 'bold', fontSize: 18, margin: '0 0 12px' }}>
              {dialog.npc.name}
            </p>

            {dialog.locked ? (
              <>
                <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                  "You're not ready yet."
                  <br />
                  <span style={{ color: '#555' }}>{dialog.lockHint ?? 'Come back later.'}</span>
                </p>
                <button onClick={() => setDialog(null)} style={btnStyle('#0f3460')}>Dismiss</button>
              </>
            ) : dialog.done ? (
              <>
                <p style={{ color: '#4ecca3', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                  Already interrogated.
                  <br />
                  <span style={{ color: '#888' }}>The evidence is on file.</span>
                </p>
                <button onClick={() => setDialog(null)} style={btnStyle('#0f3460')}>Dismiss</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                  {DIALOG_TEXT[dialog.npc.encounterId] ?? ''}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button onClick={() => setDialog(null)} style={btnStyle('#0f3460')}>Not now</button>
                  <button
                    onClick={() => { setDialog(null); onStartCombat(dialog.npc.encounterId); }}
                    style={btnStyle('#e94560')}
                  >
                    Begin Interrogation
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
