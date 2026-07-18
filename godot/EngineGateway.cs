// GDScript-facing bridge to the pure C# engine.
//
// Interop reality (found in step 1 of the integration roadmap): the engine's
// CombatState / CombatAction records are plain .NET types, NOT Variant-
// compatible, so GDScript cannot read them directly. State crosses the
// boundary in one of two shapes:
//   - GetStateJson()  → the canonical EngineJson string (cheap to produce,
//     parse on demand);
//   - GetState()      → that JSON parsed into a Godot Dictionary (fully
//     readable/inspectable from GDScript, costs a parse per call);
//   - GetSummary()    → a small hand-picked Dictionary for per-frame UI reads.
// Actions cross as typed methods (PlayCardAt, DoEndTurn, …) that construct
// the sealed action records on the C# side — no action JSON needed.
//
// All Do*/PlayCardAt methods return true if the action was applied legally;
// an illegal action leaves engine state unchanged (the reducer guarantees
// this) and returns false.

using System.Linq;
using Godot;
using Breakthrough.Engine;
using Breakthrough.Engine.Json;
using GdArray = Godot.Collections.Array;
using GdDict = Godot.Collections.Dictionary;

namespace Breakthrough.GodotHost;

public partial class EngineGateway : Node
{
    private ContentBundle? _content;
    private CombatState? _state;

    private ContentBundle Content =>
        _content ??= EngineHarness.LoadContent(ProjectSettings.GlobalizePath("res://"));

    // ── discovery ───────────────────────────────────────────────────────────

    public GdArray ListEncounters()
    {
        var a = new GdArray();
        foreach (var id in Content.Encounters.Keys.OrderBy(k => k, System.StringComparer.Ordinal)) a.Add(id);
        return a;
    }

    public GdArray ListDecks()
    {
        var a = new GdArray();
        foreach (var id in Content.StarterDeckLists.Keys.OrderBy(k => k, System.StringComparer.Ordinal)) a.Add(id);
        return a;
    }

    // ── lifecycle ───────────────────────────────────────────────────────────

    /// <summary>Boot an encounter. Empty deckName picks the first starter deck.</summary>
    public bool StartEncounter(string encounterId, string deckName, int seed)
    {
        if (!Content.Encounters.TryGetValue(encounterId, out var config))
        {
            GD.PushError($"EngineGateway: unknown encounter '{encounterId}'");
            return false;
        }
        if (string.IsNullOrEmpty(deckName))
            deckName = Content.StarterDeckLists.Keys.OrderBy(k => k, System.StringComparer.Ordinal).First();
        if (!Content.StarterDeckLists.TryGetValue(deckName, out var deck))
        {
            GD.PushError($"EngineGateway: unknown starter deck '{deckName}'");
            return false;
        }
        _state = Setup.BuildInitialState(new SetupInput
        {
            Config = config,
            Cards = Content.Cards,
            Tokens = Content.Tokens,
            Nuggets = Content.Nuggets,
            Recipes = Content.Recipes,
            PlayerDeckCardIds = deck,
            CollectionCardIds = Content.DevCollectionIds,
            Seed = seed,
        });
        return true;
    }

    // ── actions (one method per CombatAction record the driver needs) ───────

    public bool PlayCardAt(int handIndex) => Apply(new PlayCard(handIndex));
    public bool DoEndTurn() => Apply(new EndTurn());
    public bool DoAdvance() => Apply(new Advance());
    public bool DoAcknowledge() => Apply(new Acknowledge());
    public bool DoChooseNumber(int n) => Apply(new ChooseNumber(n));

    public bool DoBotmSelect(GdArray keepHandIndices) =>
        Apply(new BotmSelect(keepHandIndices.Select(v => v.AsInt32()).ToList()));

    private bool Apply(CombatAction action)
    {
        if (_state == null)
        {
            GD.PushError("EngineGateway: no combat started — call StartEncounter first");
            return false;
        }
        _state = Reducer.Reduce(_state, action);
        return _state.Log.Count == 0 || _state.Log[^1].Type != "illegal-action";
    }

    // ── state readers ───────────────────────────────────────────────────────

    public string GetPhase() => _state?.Phase ?? "";

    public bool HasPendingBlock() => _state?.PendingBlock != null;

    /// <summary>Shape of the current pending block, or empty dict if none.</summary>
    public GdDict PendingBlockInfo()
    {
        var d = new GdDict();
        switch (_state?.PendingBlock)
        {
            case ChooseNumberBlock b:
                d["type"] = "chooseNumber"; d["min"] = b.Min; d["max"] = b.Max;
                break;
            case RevealBlock r:
                d["type"] = "reveal"; d["isHint"] = r.IsHint;
                break;
            case DeckRevealBlock:
                d["type"] = "deckReveal";
                break;
        }
        return d;
    }

    /// <summary>Small, cheap summary for per-frame UI reads.</summary>
    public GdDict GetSummary()
    {
        var d = new GdDict();
        if (_state == null) return d;
        d["phase"] = _state.Phase;
        d["round"] = _state.Round;
        d["patience"] = _state.Patience;
        d["playerPriority"] = _state.Player.Priority;
        d["npcPriority"] = _state.Npc.Priority;
        d["npcGuardsStanding"] = _state.NpcGuardsStanding;
        d["handSize"] = _state.Player.Hand.Count;
        var hand = new GdArray();
        foreach (var c in _state.Player.Hand) hand.Add(c.DefinitionId);
        d["hand"] = hand;
        d["result"] = _state.Result ?? "";
        d["lastLog"] = _state.Log.Count > 0 ? _state.Log[^1].Type : "";
        return d;
    }

    /// <summary>Canonical full-state JSON (the engine's own serialization).</summary>
    public string GetStateJson() => _state == null ? "" : EngineJson.Serialize(_state);

    /// <summary>Full state as a Godot Dictionary — everything GDScript-readable.</summary>
    public GdDict GetState() =>
        _state == null ? new GdDict() : Json.ParseString(GetStateJson()).AsGodotDictionary();
}
