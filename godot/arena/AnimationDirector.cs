// Event-driven presentation: maps CombatView.NewLog deltas (type + structured
// data, the seam's animation contract) to arena cues. Positional card
// movement is NOT done here (MindspaceArena's reconciliation glides cards);
// this layer adds the beats a snapshot diff can't infer.
//
// Round-2 design (Ken playtest): cues run through a SERIAL queue, and the
// significant state changes get an Inscryption-style focus-then-resolve
// beat — the camera dollies to the affected object (patience candle,
// priority stack, shield rows), the prop pulses, a callout floats, then the
// camera returns. NPC pacing (2.4 s per step, set by MindspaceArena) leaves
// room for one full beat per engine action.

using System.Collections.Generic;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class AnimationDirector : Node3D
{
    public sealed class ArenaRefs
    {
        public required OpponentAvatar Avatar;
        public required CameraRig Rig;
        public required PatienceCandle Candle;
        public required PriorityStack PlayerStack;
        public required PriorityStack NpcStack;
        public required Vector3 AvatarAnchor;
        public required Vector3 PlayerShieldAnchor;
        public required Vector3 GuardAnchor;
        public required Vector3 CoreAnchor;
        public required Vector3 TableCenter;
        public required Vector3 NpcDiscardExit;
        public required Vector3 PlayerDeckAnchor;
        public required Vector3 NpcDeckAnchor;
        /// <summary>permanentId → current world position (null once it left the field).</summary>
        public required System.Func<string, Vector3?> ResolvePermanentPos;
        /// <summary>definitionId → card face data (for the NPC play flyby).</summary>
        public required System.Func<string, CombatSession.CardInfo?> ResolveCard;
    }

    private ArenaRefs _r = null!;
    private readonly Queue<(System.Action Start, float Duration)> _cues = new();
    private double _timer;

    // TODO(fast-forward, Ken 2026-07-19): future feature — a hold-to-skip that
    // compresses the cue queue (scale durations here + CombatBridge
    // NpcStepDelaySeconds). Hook point: divide `cue.Duration` and tween times
    // by a speed factor before starting each cue. Deliberately not built yet.

    public void Init(ArenaRefs refs) => _r = refs;

    public override void _Process(double delta)
    {
        _timer -= delta;
        if (_timer <= 0 && _cues.TryDequeue(out var cue))
        {
            cue.Start();
            _timer = cue.Duration;
        }
    }

    /// <summary>
    /// permanentId → (ownerKey, name), remembered across every view so a trap
    /// that fires AFTER leaving the field can still be attributed. A trap that
    /// never appeared in any view at all was necessarily played and consumed
    /// inside one NPC dispatch chain — player plays are single dispatches, so
    /// a player trap always crosses at least one view — hence: theirs.
    /// </summary>
    private readonly Dictionary<string, (string Owner, string Name)> _permanentHistory = new();

    public void Play(CombatView v)
    {
        foreach (var p in v.Field) _permanentHistory[p.PermanentId] = (p.OwnerKey, p.Name);
        foreach (var e in v.NewLog) MapCue(e, v.NpcTurnInProgress);
    }

    private void Enqueue(System.Action start, float duration) => _cues.Enqueue((start, duration));

    private void MapCue(LogView e, bool npcActing)
    {
        switch (e.Type)
        {
            case "patience":
            {
                int delta = IntOf(e, "delta");
                if (delta == 0) break;
                bool bigBeat = npcActing || Mathf.Abs(delta) >= 2;
                Enqueue(() =>
                {
                    _r.Candle.Pulse();
                    if (delta < 0) _r.Avatar.Flinch(Mathf.Clamp(-delta * 0.4f, 0.4f, 1.6f));
                    var color = delta < 0 ? new Color("ff9a5a") : new Color("8ae08a");
                    string text = $"{(delta > 0 ? "+" : "")}{delta} Patience";
                    var at = _r.Candle.GlobalPosition + new Vector3(0, 1.9f, 0);
                    if (bigBeat)
                    {
                        _r.Rig.FocusOn(_r.Candle.GlobalPosition + new Vector3(0, 0.9f, 0));
                        DelayedFloat(0.45f, text, at, color); // spawn once zoomed so it sizes to the close camera
                    }
                    else
                    {
                        FloatText(text, at, color);
                    }
                }, bigBeat ? 1.8f : 0.6f);
                break;
            }
            case "priority":
            {
                int delta = IntOf(e, "delta");
                string side = StrOf(e, "side");
                if (delta == 0) break;
                var stack = side == "npc" ? _r.NpcStack : _r.PlayerStack;
                // Spends during your own combos shouldn't drag the camera around;
                // focus only on the opponent's meter moving, or big swings.
                bool bigBeat = (npcActing && side == "npc") || Mathf.Abs(delta) >= 3;
                Enqueue(() =>
                {
                    stack.Pulse();
                    string text = $"{(delta > 0 ? "+" : "")}{delta} Priority";
                    var at = stack.FocusPoint + new Vector3(0, 0.7f, 0);
                    var color = delta < 0 ? new Color("d0d0d0") : new Color("ffe08a");
                    if (bigBeat)
                    {
                        _r.Rig.FocusOn(stack.FocusPoint);
                        DelayedFloat(0.45f, text, at, color);
                    }
                    else
                    {
                        FloatText(text, at, color);
                    }
                }, bigBeat ? 1.8f : 0.45f);
                break;
            }
            case "turn-start-priority":
            {
                string side = StrOf(e, "side");
                var stack = side == "npc" ? _r.NpcStack : _r.PlayerStack;
                Enqueue(stack.Pulse, 0.4f);
                break;
            }
            case "shield-broken":
            {
                string shieldType = StrOf(e, "shieldType");
                if (shieldType == "guard")
                {
                    Enqueue(() =>
                    {
                        FloatText("Guard broken", _r.GuardAnchor, new Color("ffcf8a"));
                        _r.Rig.Shake(0.5f);
                        _r.Rig.FocusOn(_r.GuardAnchor, 0.55f);
                    }, 1.6f);
                }
                else if (shieldType == "npcCore")
                {
                    Enqueue(() =>
                    {
                        FloatText("CORE SHIELD BROKEN", _r.CoreAnchor + new Vector3(0, 0.5f, 0), new Color("d8a8ff"), big: true);
                        _r.Rig.Shake(1.6f);
                        _r.Rig.FocusOn(_r.CoreAnchor, 1.0f);
                    }, 2.2f);
                }
                else // a player shield
                {
                    Enqueue(() =>
                    {
                        FloatText("Shield broken!", _r.PlayerShieldAnchor, new Color("ff7a6a"));
                        _r.Rig.Shake(1.0f);
                        _r.Rig.FocusOn(_r.PlayerShieldAnchor, 0.7f);
                    }, 1.8f);
                }
                break;
            }
            case "lie":
                Enqueue(() => FloatText("Lie ↑", _r.AvatarAnchor + new Vector3(0.6f, 0.2f, 0), new Color("c88aff")), 0.6f);
                break;
            case "play" when StrOf(e, "controller") == "npc":
            {
                string defId = StrOf(e, "definitionId");
                Enqueue(() => NpcPlayFlyby(defId, e.Message), 3.0f);
                break;
            }
            case "draw":
            {
                // Card draws get a focus beat (Ken round 6) — brief, since
                // draws happen every turn start.
                int count = IntOf(e, "count");
                bool player = StrOf(e, "side") == "player";
                var anchor = player ? _r.PlayerDeckAnchor : _r.NpcDeckAnchor;
                Enqueue(() =>
                {
                    _r.Rig.FocusOn(anchor, 0.45f);
                    DelayedFloat(0.4f, $"draws {count} card{(count == 1 ? "" : "s")}", anchor + new Vector3(0, 0.6f, 0),
                        player ? new Color("aecbff") : new Color("e8c8a8"));
                }, 1.5f);
                break;
            }
            case "counters":
            {
                // Counter changes get a focus beat on the permanent (Ken round 6).
                string permId = StrOf(e, "permanentId");
                string counterName = StrOf(e, "counterName");
                int total = IntOf(e, "total");
                Enqueue(() =>
                {
                    var pos = _r.ResolvePermanentPos(permId) ?? _r.TableCenter;
                    _r.Rig.FocusOn(pos, 0.6f);
                    DelayedFloat(0.4f, $"{counterName} → {total}", pos + new Vector3(0, 0.6f, 0), new Color("ffe08a"));
                }, 1.7f);
                break;
            }
            case "trap-fired":
            {
                // Attribute the trap (Ken round 4 — a bare "TRAP!" reads as
                // spurious when an unseen NPC trap fires at your turn start).
                string permId = StrOf(e, "permanentId");
                bool known = _permanentHistory.TryGetValue(permId, out var info);
                bool ours = known && info.Owner == "player";
                // "Trap <Name> fires" → <Name>
                string name = known ? info.Name
                    : e.Message.StartsWith("Trap ") && e.Message.EndsWith(" fires")
                        ? e.Message[5..^6]
                        : e.Message;
                Enqueue(() =>
                {
                    FloatText(ours ? $"Your trap — {name}!" : $"Their trap — {name}!",
                        _r.TableCenter, ours ? new Color("8ab4ff") : new Color("ff5a4a"), big: true);
                    if (!ours) _r.Rig.Shake(0.8f);
                    _r.Rig.FocusOn(_r.TableCenter, 0.6f);
                }, 1.7f);
                break;
            }
            case "break-prevented":
                Enqueue(() => FloatText("Prevented", _r.GuardAnchor, new Color("8ab4ff")), 0.6f);
                break;
            case "discovery":
                Enqueue(() => FloatText("Info nugget discovered", _r.TableCenter + new Vector3(0, 0.5f, 0), new Color("ffe08a")), 0.8f);
                break;
            case "debt-transfer":
                Enqueue(() => FloatText("Priority debt transfers", _r.TableCenter, new Color("aaaaaa")), 0.6f);
                break;
        }
    }

    /// <summary>
    /// The opponent's play sweeps from the avatar to table center FACE-UP with
    /// its name, cost and effect text, and lingers so the player can read it
    /// (Ken round 6 — and where the card art will live once it exists).
    /// </summary>
    private void NpcPlayFlyby(string definitionId, string message)
    {
        var card = new Card3D { Zone = "fx" };
        AddChild(card);
        card.Position = _r.AvatarAnchor + new Vector3(0, -0.3f, 0.3f);
        card.RotationDegrees = new Vector3(-70, 0, 0);
        card.Scale = Vector3.One * 0.8f;

        var info = definitionId.Length > 0 ? _r.ResolveCard(definitionId) : null;
        if (info != null)
        {
            card.SetFace(info.Name, info.Cost.ToString(), info.EffectText, definitionId);
            // Present upright toward the camera, slightly raised and enlarged.
            card.GlideTo(_r.TableCenter + new Vector3(0, 1.05f, 0.4f), new Vector3(-28, 0, 0), 0.7f);
            var grow = card.CreateTween();
            grow.TweenProperty(card, "scale", Vector3.One * 1.15f, 0.7);
        }
        else
        {
            card.SetFaceDown(true);
            card.GlideTo(_r.TableCenter + new Vector3(0, 0.25f, 0), new Vector3(-90, 0, 0), 0.7f);
            FloatText(Truncate(message, 34), _r.TableCenter + new Vector3(0, 0.9f, 0), new Color("e8c8a8"));
        }

        var exitTween = CreateTween();
        exitTween.TweenInterval(info != null ? 2.6 : 1.5);
        exitTween.TweenCallback(Callable.From(() =>
        {
            if (IsInstanceValid(card)) card.DepartAndFree(_r.NpcDiscardExit);
        }));
    }

    private void DelayedFloat(float delay, string text, Vector3 at, Color color, bool big = false)
    {
        var t = CreateTween();
        t.TweenInterval(delay);
        t.TweenCallback(Callable.From(() => FloatText(text, at, color, big)));
    }

    public void FloatText(string text, Vector3 at, Color color, bool big = false)
    {
        // Size against the CURRENT camera distance so callouts stay reasonable
        // when a focus beat or the NpcTurn framing has the camera zoomed in
        // (Ken round 3). 6.5 ≈ the default player-turn distance to the table.
        float dist = _r.Rig.Camera.GlobalPosition.DistanceTo(at);
        float sizeScale = Mathf.Clamp(dist / 6.5f, 0.35f, 1.15f);

        var label = new Label3D
        {
            Text = Truncate(text, big ? 24 : 34),
            Position = at,
            FontSize = big ? 180 : 120,
            PixelSize = 0.003f * sizeScale,
            Modulate = color,
            OutlineSize = big ? 26 : 14,
            OutlineModulate = new Color("0a0810"),
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            NoDepthTest = true,
        };
        AddChild(label);
        var tween = CreateTween().SetParallel();
        tween.TweenProperty(label, "position", at + new Vector3(0, 0.9f, 0), 1.4)
            .SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(label, "modulate:a", 0.0f, 1.4).SetDelay(0.5);
        tween.Chain().TweenCallback(Callable.From(label.QueueFree));
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";

    private static int IntOf(LogView e, string key) =>
        e.Data != null && e.Data.TryGetValue(key, out var v) && v is int i ? i : 0;

    private static string StrOf(LogView e, string key) =>
        e.Data != null && e.Data.TryGetValue(key, out var v) && v is string s ? s : "";
}
