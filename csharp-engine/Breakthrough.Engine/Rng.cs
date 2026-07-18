// Deterministic PRNG (mulberry32). The RNG state lives inside CombatState so
// identical (seed, action-sequence) pairs produce byte-identical states —
// the foundation of dual-playtest sync (Rebuild_Brief §4).
//
// 1:1 C# port of src/engine/rng.ts. All JS int32 semantics (| 0, Math.imul,
// >>> shifts, double addition folded back through ToInt32) are reproduced
// exactly so a given seed yields the same sequence as the TS engine.

namespace Breakthrough.Engine;

public static class Rng
{
    public readonly record struct RandomResult(double Value, int State);

    public static RandomResult NextRandom(int state)
    {
        unchecked
        {
            int a = state + 0x6d2b79f5; // (state + 0x6d2b79f5) | 0
            int t = a;
            // t = Math.imul(t ^ (t >>> 15), t | 1)
            t = t ^ (int)((uint)t >> 15);
            t = t * (a | 1); // Math.imul — int32 wraparound multiply
            // t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            int inner = (t ^ (int)((uint)t >> 7)) * (t | 61);
            t ^= t + inner; // JS double add of two int32s folded via ToInt32 == wrapped int add
            // ((t ^ (t >>> 14)) >>> 0) / 4294967296
            uint u = (uint)(t ^ (int)((uint)t >> 14));
            double value = u / 4294967296.0;
            return new RandomResult(value, a);
        }
    }

    public readonly record struct ShuffleResult<T>(List<T> Items, int RngState);

    /// <summary>Fisher–Yates shuffle driven by the engine RNG. Returns new list + new rng state.</summary>
    public static ShuffleResult<T> ShuffleWithRng<T>(IReadOnlyList<T> items, int rngState)
    {
        var arr = new List<T>(items);
        int s = rngState;
        for (int i = arr.Count - 1; i > 0; i--)
        {
            var r = NextRandom(s);
            s = r.State;
            int j = (int)Math.Floor(r.Value * (i + 1));
            (arr[i], arr[j]) = (arr[j], arr[i]);
        }
        return new ShuffleResult<T>(arr, s);
    }
}
