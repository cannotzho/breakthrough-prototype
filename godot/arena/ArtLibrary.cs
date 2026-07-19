// THE ART SEAM for the MindspaceArena (post-port step 3).
//
// Every visual the arena uses is requested from here by a named slot. For
// each slot the library first looks for an artist-provided resource at a
// conventional path; only if none exists does it build the procedural
// placeholder. An artist therefore replaces visuals by DROPPING FILES IN,
// never by editing arena code:
//
//   materials:  res://art/materials/<slot>.tres      (any Material)
//   meshes:     res://art/models/<slot>.res|.tres    (any Mesh resource)
//   scenes:     res://art/models/<slot>.tscn         (PackedScene, replaces
//                                                     a whole procedural prop)
//
// Material slots: card_front, card_back, shield_slab, shield_core,
//                 guard_back, core_shield, core_shield_broken, table,
//                 avatar_body, void_dome, bell, candle_wax, candle_flame,
//                 priority_token
// Mesh slots:     card  (a unit card in the XY plane, ~0.7 × 1.0, facing +Z)
// Scene slots:    avatar, table_prop, bell_prop, patience_prop, priority_prop
//
// Placeholder materials are ShaderMaterials over art/shaders/*.gdshader with
// per-slot uniform tints; artists may also just edit those shaders/uniforms.

using System.Collections.Generic;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public static class ArtLibrary
{
    private static readonly Dictionary<string, Material> MatCache = new();

    public static Material Mat(string slot)
    {
        if (MatCache.TryGetValue(slot, out var cached)) return cached;
        var mat = LoadOverride<Material>($"res://art/materials/{slot}.tres") ?? BuildPlaceholderMat(slot);
        MatCache[slot] = mat;
        return mat;
    }

    public static Mesh CardMesh() =>
        LoadOverride<Mesh>("res://art/models/card.res")
        ?? LoadOverride<Mesh>("res://art/models/card.tres")
        ?? new QuadMesh { Size = new Vector2(0.7f, 1.0f) };

    /// <summary>Instantiate an artist scene for a prop slot, or null → procedural fallback.</summary>
    public static Node3D? SceneOverride(string slot)
    {
        var packed = LoadOverride<PackedScene>($"res://art/models/{slot}.tscn");
        return packed?.Instantiate<Node3D>();
    }

    private static T? LoadOverride<T>(string path) where T : class =>
        ResourceLoader.Exists(path) ? ResourceLoader.Load(path) as T : null;

    // ── procedural placeholders ─────────────────────────────────────────────

    private static Material BuildPlaceholderMat(string slot)
    {
        switch (slot)
        {
            case "avatar_body":
                return ShaderMat("avatar_mood");
            case "void_dome":
                return ShaderMat("mindspace_void");
        }

        var m = ShaderMat("painterly_surface");
        (Color baseTint, Color shadeTint) = slot switch
        {
            "card_front" => (new Color("cfc4a5"), new Color("6b5c47")),
            "card_back" => (new Color("4a3f5c"), new Color("221c2e")),
            "shield_slab" => (new Color("7a92a8"), new Color("3a4a58")),
            "shield_core" => (new Color("c8a24a"), new Color("6e5424")),
            "guard_back" => (new Color("8a4a3a"), new Color("42201a")),
            "core_shield" => (new Color("7a4a92"), new Color("38204a")),
            "core_shield_broken" => (new Color("3a4a3a"), new Color("1a241a")),
            "table" => (new Color("54402e"), new Color("2a1e14")),
            "bell" => (new Color("b89a4a"), new Color("5e4a1e")),
            "candle_wax" => (new Color("e0d4b8"), new Color("8a7a5e")),
            "candle_flame" => (new Color("ffcf8a"), new Color("b8702a")),
            "priority_token" => (new Color("d4b44a"), new Color("6e5a1e")),
            _ => (new Color("999999"), new Color("444444")),
        };
        m.SetShaderParameter("base_tint", baseTint);
        m.SetShaderParameter("shade_tint", shadeTint);
        if (slot == "table")
        {
            m.SetShaderParameter("brush_scale", 3.0f);
            m.SetShaderParameter("brush_stretch", 5.0f);
            m.SetShaderParameter("edge_width", 0.02f);
        }
        return m;
    }

    private static ShaderMaterial ShaderMat(string shaderName) => new()
    {
        Shader = GD.Load<Shader>($"res://art/shaders/{shaderName}.gdshader"),
    };
}
