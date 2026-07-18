// Scene-tree adapter over CombatSession — the single node the scene layer
// talks to. Adds exactly two Godot concerns on top of the pure session:
//
//  1. A parameterless StateChanged signal (GDScript listeners re-pull via
//     GetSummaryJson / the C# View property); C# scenes subscribe to the
//     typed ViewChanged event instead.
//  2. NPC turn pacing: while the engine is in EnemyPending with no pending
//     block, _Process auto-dispatches Advance every NpcStepDelaySeconds
//     (mirrors the React UI's 1100 ms sequential driver). Toggleable for a
//     manual "step" button.
//
// Everything else forwards 1:1 to the session. Step-3 presentation should
// need nothing beyond this node's surface.

using System.Collections.Generic;
using Godot;

namespace Breakthrough.GodotHost;

public partial class CombatBridge : Node
{
    [Signal]
    public delegate void StateChangedEventHandler();

    public CombatSession? Session { get; private set; }

    public CombatView? View => Session?.View;
    public string? LastError => Session?.LastError;

    /// <summary>Drive NPC turns automatically (default) or via ManualNpcStep().</summary>
    [Export] public bool AutoAdvanceNpc { get; set; } = true;

    /// <summary>Delay between automatic NPC steps (React UI uses 1.1 s).</summary>
    [Export] public double NpcStepDelaySeconds { get; set; } = 1.1;

    private double _npcTimer;

    public void StartEncounter(string encounterId, string deckName, int seed)
    {
        if (Session == null)
        {
            Session = new CombatSession(EngineHarness.LoadContent(ProjectSettings.GlobalizePath("res://")));
            Session.ViewChanged += _ => EmitSignal(SignalName.StateChanged);
        }
        Session.Start(encounterId, deckName, seed);
    }

    public void Restart(int? seed = null) => Session?.Restart(seed);

    // ── forwarded intents ───────────────────────────────────────────────────

    public bool PlayCardAt(int handIndex, bool heavyHand = false) => Session?.PlayCardAt(handIndex, heavyHand) ?? false;
    public bool PlaceShieldAt(int handIndex) => Session?.PlaceShieldAt(handIndex) ?? false;
    public bool ActivateAbilityOn(string permanentId, string abilityId, IReadOnlyList<int>? discardIndices = null) =>
        Session?.ActivateAbilityOn(permanentId, abilityId, discardIndices) ?? false;
    public bool CombineCards(int a, int b) => Session?.CombineCards(a, b) ?? false;
    public bool ResequenceShieldOrder(IReadOnlyList<int> order) => Session?.ResequenceShieldOrder(order) ?? false;
    public bool EndPlayerTurn() => Session?.EndPlayerTurn() ?? false;
    public bool ConfirmBotm(IReadOnlyList<int> keepHandIndices) => Session?.ConfirmBotm(keepHandIndices) ?? false;
    public bool AcknowledgePrompt() => Session?.AcknowledgePrompt() ?? false;
    public bool ChooseNumberValue(int value) => Session?.ChooseNumberValue(value) ?? false;

    /// <summary>Manual NPC step (used when AutoAdvanceNpc is off).</summary>
    public bool ManualNpcStep() => Session?.AdvanceNpc() ?? false;

    // ── NPC pacing ──────────────────────────────────────────────────────────

    public override void _Process(double delta)
    {
        if (Session is not { NpcAdvancePending: true } || !AutoAdvanceNpc)
        {
            _npcTimer = 0;
            return;
        }
        _npcTimer += delta;
        if (_npcTimer >= NpcStepDelaySeconds)
        {
            _npcTimer = 0;
            Session.AdvanceNpc();
        }
    }

    // ── GDScript escape hatch (C# scenes use View/ViewChanged) ──────────────

    public string GetStateJson() => Session?.DebugStateJson() ?? "";
}
