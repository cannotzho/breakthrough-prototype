// Cross-scene launch parameters (Main launcher → CombatScreen). A static
// holder is the simplest placeholder-grade mechanism; a real game shell can
// replace it with an autoload without touching the bridge.

namespace Breakthrough.GodotHost;

public static class LaunchConfig
{
    public static string EncounterId { get; set; } = "fan_club_president";
    public static string DeckName { get; set; } = "";   // empty = first starter deck
    public static int Seed { get; set; } = 2026;
}
