import { useRef, useEffect, useState, useCallback } from 'react';

/* ── Props ──────────────────────────────────────────────────── */
interface Props {
  completedEncounters: Set<string>;
  onStartCombat: (encounterId: string) => void;
  onResetGame: () => void;
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
  encounterId: string; lockedUntil?: string;
}
const NPCS: NpcDef[] = [
  { id: 'gutterfang', x: 500, y: 430, color: '#8B4513', name: 'Gutterfang',       encounterId: 'gutterfang' },
  { id: 'maryann',   x: 800, y: 500, color: '#9b30d0', name: 'Mary-Ann Mariposa', encounterId: 'maryann',   lockedUntil: 'gutterfang' },
];

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
export default function Overworld({ completedEncounters, onStartCombat, onResetGame }: Props) {
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

  const [nearNpc,       setNearNpc]       = useState<NpcDef | null>(null);
  const [dialog,        setDialog]        = useState<{ npc: NpcDef; locked: boolean; done: boolean } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  /* ── Interact ─────────────────────────────────────────────── */
  const interact = useCallback(() => {
    const npc = nearNpcRef.current;
    if (!npc) return;
    const locked = !!npc.lockedUntil && !completedRef.current.has(npc.lockedUntil);
    const done   = completedRef.current.has(npc.encounterId);
    setDialog({ npc, locked, done });
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
      const locked  = !!npc.lockedUntil && !completed.has(npc.lockedUntil);
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
        ctx.fillText('Find Gutterfang first', npc.x, npc.y + 32);
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
  const objective = gDone && mDone
    ? 'Case closed.'
    : !gDone
    ? 'Find Gutterfang — The Alley.'
    : 'Find Mary-Ann — Larkgrove College.';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#090912' }}>
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

      {/* Near-NPC hint (keyboard devices only) */}
      {nearNpc && !isTouchDevice && !dialog && (
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
                  <span style={{ color: '#555' }}>Find Gutterfang first.</span>
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
