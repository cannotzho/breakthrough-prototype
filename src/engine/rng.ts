/**
 * Deterministic PRNG (mulberry32). The RNG state lives inside CombatState so
 * identical (seed, action-sequence) pairs produce byte-identical states —
 * the foundation of dual-playtest sync (Rebuild_Brief §4).
 */

export function nextRandom(state: number): { value: number; state: number } {
  let a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

/** Fisher–Yates shuffle driven by the engine RNG. Returns new array + new rng state. */
export function shuffleWithRng<T>(items: readonly T[], rngState: number): { items: T[]; rngState: number } {
  const arr = items.slice();
  let s = rngState;
  for (let i = arr.length - 1; i > 0; i--) {
    const r = nextRandom(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { items: arr, rngState: s };
}
