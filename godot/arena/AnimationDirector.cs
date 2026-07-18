// Event-driven presentation: maps CombatView.NewLog deltas (type + structured
// data, the seam's animation contract) to arena cues — avatar flinches,
// floating numbers, camera shakes, NPC play flybys. Positional card movement
// is NOT done here; MindspaceArena's reconciliation glides cards to their
// slots. This layer adds the one-shot flourishes a snapshot diff can't infer.
//
// Placeholder policy: cues fire immediately and may overlap; the engine's
// NPC pacing (one Advance per 1.1 s) already spaces the dense sequences.
// A step-4 polish pass can serialize cues into a timeline if needed.

using System.Collections.Generic;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class AnimationDirector : Node3D
{
    private OpponentAvatar _avatar = null!;
    private CameraRig _rig = null!;
    private Vector3 _avatarAnchor, _playerShieldAnchor, _guardAnchor, _tableCenter, _npcDiscardExit;

    public void Init(OpponentAvatar avatar, CameraRig rig,
        Vector3 avatarAnchor, Vector3 playerShieldAnchor, Vector3 guardAnchor,
        Vector3 tableCenter, Vector3 npcDiscardExit)
    {
        _avatar = avatar;
        _rig = rig;
        _avatarAnchor = avatarAnchor;
        _playerShieldAnchor = playerShieldAnchor;
        _guardAnchor = guardAnchor;
        _tableCenter = tableCenter;
        _npcDiscardExit = npcDiscardExit;
    }

    public void Play(IReadOnlyList<LogView> entries)
    {
        foreach (var e in entries) PlayOne(e);
    }

    private void PlayOne(LogView e)
    {
        switch (e.Type)
        {
            case "patience":
            {
                int delta = IntOf(e, "delta");
                if (delta < 0)
                {
                    _avatar.Flinch(Mathf.Clamp(-delta * 0.4f, 0.4f, 1.6f));
                    FloatText($"{delta} Patience", _avatarAnchor, new Color("ff9a5a"));
                }
                else if (delta > 0)
                {
                    FloatText($"+{delta} Patience", _avatarAnchor, new Color("8ae08a"));
                }
                break;
            }
            case "shield-broken":
            {
                string shieldType = StrOf(e, "shieldType");
                if (shieldType == "guard")
                {
                    FloatText("Guard broken", _guardAnchor, new Color("ffcf8a"));
                    _rig.Shake(0.5f);
                }
                else if (shieldType == "npcCore")
                {
                    FloatText("CORE SHIELD BROKEN", _guardAnchor + new Vector3(0, 0.6f, 0), new Color("d8a8ff"), big: true);
                    _rig.Shake(1.6f);
                }
                else // a player shield
                {
                    FloatText("Shield broken!", _playerShieldAnchor, new Color("ff7a6a"));
                    _rig.Shake(1.0f);
                }
                break;
            }
            case "lie":
                FloatText("Lie ↑", _avatarAnchor + new Vector3(0.6f, 0.2f, 0), new Color("c88aff"));
                break;
            case "play" when StrOf(e, "controller") == "npc":
                NpcPlayFlyby(e.Message);
                break;
            case "trap-fired":
                FloatText("TRAP!", _tableCenter, new Color("ff5a4a"), big: true);
                _rig.Shake(0.8f);
                break;
            case "break-prevented":
                FloatText("Prevented", _guardAnchor, new Color("8ab4ff"));
                break;
            case "discovery":
                FloatText("Info nugget discovered", _tableCenter + new Vector3(0, 0.5f, 0), new Color("ffe08a"));
                break;
            case "debt-transfer":
                FloatText("Priority debt transfers", _tableCenter, new Color("aaaaaa"));
                break;
        }
    }

    /// <summary>A card back sweeps from the avatar to table center, then exits.</summary>
    private void NpcPlayFlyby(string message)
    {
        var card = new Card3D { Zone = "fx" };
        AddChild(card);
        card.Position = _avatarAnchor + new Vector3(0, -0.3f, 0.3f);
        card.RotationDegrees = new Vector3(-70, 0, 0);
        card.Scale = Vector3.One * 0.75f;
        card.SetFaceDown(true);
        card.GlideTo(_tableCenter + new Vector3(0, 0.25f, 0), new Vector3(-90, 0, 0), 0.45f);
        FloatText(message, _tableCenter + new Vector3(0, 0.8f, 0), new Color("e8c8a8"));

        var exitTween = CreateTween();
        exitTween.TweenInterval(0.8);
        exitTween.TweenCallback(Callable.From(() =>
        {
            if (IsInstanceValid(card)) card.DepartAndFree(_npcDiscardExit);
        }));
    }

    public void FloatText(string text, Vector3 at, Color color, bool big = false)
    {
        var label = new Label3D
        {
            Text = text,
            Position = at,
            FontSize = big ? 220 : 130,
            PixelSize = 0.003f,
            Modulate = color,
            OutlineSize = big ? 24 : 12,
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            NoDepthTest = true,
        };
        AddChild(label);
        var tween = CreateTween().SetParallel();
        tween.TweenProperty(label, "position", at + new Vector3(0, 0.9f, 0), 1.2)
            .SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(label, "modulate:a", 0.0f, 1.2).SetDelay(0.4);
        tween.Chain().TweenCallback(Callable.From(label.QueueFree));
    }

    private static int IntOf(LogView e, string key) =>
        e.Data != null && e.Data.TryGetValue(key, out var v) && v is int i ? i : 0;

    private static string StrOf(LogView e, string key) =>
        e.Data != null && e.Data.TryGetValue(key, out var v) && v is string s ? s : "";
}
