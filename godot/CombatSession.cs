// The UI/engine seam itself — pure C#, no Godot API, so the whole interaction
// loop is drivable (and verified) without a Godot runtime. CombatBridge wraps
// this in a Node and adds scene-tree concerns (signal, NPC pacing timer).
//
// Contract:
//  - One typed method per player intent; each maps to exactly one reducer
//    action. Methods return true if the action was applied legally.
//  - Illegal actions leave state unchanged (reducer guarantee), set LastError
//    from the reducer's log message, and still emit a view (so a UI can toast
//    the error off the same subscription it renders from).
//  - ViewChanged fires after EVERY dispatch with a fresh CombatView carrying
//    the log delta since the previous emission.

using System;
using System.Collections.Generic;
using System.Linq;
using Breakthrough.Engine;

namespace Breakthrough.GodotHost;

public sealed class CombatSession
{
    private readonly ContentBundle _content;
    private CombatState? _state;
    private int _lastEmittedSeq = -1;

    private string _encounterId = "";
    private string _deckName = "";
    private int _seed;

    public event Action<CombatView>? ViewChanged;

    public CombatView? View { get; private set; }

    /// <summary>Reducer message for the most recent illegal action, else null.</summary>
    public string? LastError { get; private set; }

    public string EncounterId => _encounterId;
    public string DeckName => _deckName;
    public int Seed => _seed;

    public CombatSession(ContentBundle content) => _content = content;

    public IReadOnlyList<string> EncounterIds =>
        _content.Encounters.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();

    public IReadOnlyList<string> DeckNames =>
        _content.StarterDeckLists.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();

    public void Start(string encounterId, string deckName, int seed)
    {
        if (!_content.Encounters.TryGetValue(encounterId, out var config))
            throw new ArgumentException($"unknown encounter '{encounterId}'");
        if (string.IsNullOrEmpty(deckName)) deckName = DeckNames[0];
        if (!_content.StarterDeckLists.TryGetValue(deckName, out var deck))
            throw new ArgumentException($"unknown starter deck '{deckName}'");

        _encounterId = encounterId;
        _deckName = deckName;
        _seed = seed;
        _lastEmittedSeq = -1;
        LastError = null;
        _state = Setup.BuildInitialState(new SetupInput
        {
            Config = config,
            Cards = _content.Cards,
            Tokens = _content.Tokens,
            Nuggets = _content.Nuggets,
            Recipes = _content.Recipes,
            PlayerDeckCardIds = deck,
            CollectionCardIds = _content.DevCollectionIds,
            Seed = seed,
        });
        Emit();
    }

    /// <summary>Same encounter/deck; pass a different seed for a fresh shuffle.</summary>
    public void Restart(int? seed = null) => Start(_encounterId, _deckName, seed ?? _seed);

    // ── Player intents (one reducer action each) ────────────────────────────

    public bool PlayCardAt(int handIndex, bool heavyHand = false) =>
        Dispatch(new PlayCard(handIndex, heavyHand));

    public bool PlaceShieldAt(int handIndex) => Dispatch(new PlaceShield(handIndex));

    public bool ActivateAbilityOn(string permanentId, string abilityId, IReadOnlyList<int>? discardIndices = null) =>
        Dispatch(new ActivateAbility(permanentId, abilityId, discardIndices));

    public bool CombineCards(int handIndexA, int handIndexB) =>
        Dispatch(new Combine(handIndexA, handIndexB));

    public bool ResequenceShieldOrder(IReadOnlyList<int> order) =>
        Dispatch(new ResequenceShields(order));

    public bool EndPlayerTurn() => Dispatch(new EndTurn());

    public bool ConfirmBotm(IReadOnlyList<int> keepHandIndices) =>
        Dispatch(new BotmSelect(keepHandIndices));

    public bool AcknowledgePrompt() => Dispatch(new Acknowledge());

    public bool ChooseNumberValue(int value) => Dispatch(new ChooseNumber(value));

    /// <summary>One step of the automatic NPC policy (leftmost play, §10).</summary>
    public bool AdvanceNpc() => Dispatch(new Advance());

    /// <summary>True while the NPC turn should keep being advanced (no block, no result).</summary>
    public bool NpcAdvancePending =>
        _state is { } s && s.Phase == Phases.EnemyPending && s.PendingBlock == null && s.Result == null;

    // ── Content lookup (read-only; presentation may show any card's face) ───

    public sealed record CardInfo(string Name, int Cost, string EffectText);

    /// <summary>Card face data by definition id (cards, then tokens); null if unknown.</summary>
    public CardInfo? GetCardInfo(string definitionId)
    {
        var def = _content.Cards.TryGetValue(definitionId, out var c) ? c
            : _content.Tokens.TryGetValue(definitionId, out var t) ? t : null;
        return def == null ? null : new CardInfo(def.Name, def.Cost, def.EffectText);
    }

    // ── Debug escape hatch (dev tooling only — scenes use View) ─────────────

    public string DebugStateJson() =>
        _state == null ? "" : Breakthrough.Engine.Json.EngineJson.Serialize(_state);

    // ── internals ───────────────────────────────────────────────────────────

    private bool Dispatch(CombatAction action)
    {
        if (_state == null) throw new InvalidOperationException("no combat started — call Start first");
        int prevSeq = _state.Log.Count > 0 ? _state.Log[^1].Seq : -1;
        _state = Reducer.Reduce(_state, action);
        var last = _state.Log.Count > 0 ? _state.Log[^1] : null;
        bool illegal = last is { Type: "illegal-action" } && last.Seq > prevSeq;
        LastError = illegal ? last!.Message : null;
        Emit();
        return !illegal;
    }

    private void Emit()
    {
        View = CombatViewBuilder.Build(_state!, _lastEmittedSeq);
        if (View.NewLog.Count > 0) _lastEmittedSeq = View.NewLog[^1].Seq;
        ViewChanged?.Invoke(View);
    }
}
