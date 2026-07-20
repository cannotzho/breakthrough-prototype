// Per-card art & compositing — THE ARTIST CONTRACT for card faces.
//
// Storage convention (Ken round 7 / Card Designer):
//   godot/art/cards/<definitionId>.<png|jpg|jpeg|webp>   the artwork itself
//   godot/art/cards/manifest.json                        compositing metadata
//
// manifest.json maps definitionId → entry:
//   {
//     "fcp_blind_loyalty": {
//       "texture": "res://art/cards/fcp_blind_loyalty.png",
//       "overlay": "glow" | "tint" | "none",
//       "overlayColor": "#aa66ff",
//       "artScale": 1.0,        // multiplies the art quad size
//       "artOffsetY": 0.0       // shifts the art up/down on the face
//     }
//   }
//
// Both files are checked in. Artists can bypass the designer entirely by
// dropping a correctly-named image and (optionally) a manifest entry —
// missing manifest entries fall back to a plain centered image; missing
// images fall back to the text-only face. Textures load via
// Image.LoadFromFile, so freshly imported files work immediately without a
// Godot editor reimport pass.

using System.Collections.Generic;
using System.Text.Json.Nodes;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public sealed record CardArtEntry(
    string TexturePath,
    string Overlay,       // "none" | "glow" | "tint"
    Color OverlayColor,
    float ArtScale,
    float ArtOffsetY);

public static class CardArtLibrary
{
    private static Dictionary<string, CardArtEntry>? _manifest;
    private static readonly Dictionary<string, Texture2D?> TextureCache = new();

    private static readonly string[] Extensions = ["png", "jpg", "jpeg", "webp"];

    public static string CardsDir => ProjectSettings.GlobalizePath("res://art/cards");
    public static string ManifestPath => ProjectSettings.GlobalizePath("res://art/cards/manifest.json");

    /// <summary>Drop caches (the Card Designer calls this after saving).</summary>
    public static void Reload()
    {
        _manifest = null;
        TextureCache.Clear();
    }

    public static CardArtEntry? Entry(string definitionId)
    {
        _manifest ??= LoadManifest();
        if (_manifest.TryGetValue(definitionId, out var entry)) return entry;
        // Convention fallback: a correctly-named image with no manifest entry.
        foreach (var ext in Extensions)
        {
            string path = $"res://art/cards/{definitionId}.{ext}";
            if (System.IO.File.Exists(ProjectSettings.GlobalizePath(path)))
                return new CardArtEntry(path, "none", Colors.White, 1f, 0f);
        }
        return null;
    }

    public static Texture2D? Texture(string definitionId)
    {
        if (TextureCache.TryGetValue(definitionId, out var cached)) return cached;
        Texture2D? tex = null;
        if (Entry(definitionId) is { } entry)
        {
            string global = ProjectSettings.GlobalizePath(entry.TexturePath);
            if (System.IO.File.Exists(global))
            {
                var image = Image.LoadFromFile(global);
                if (image != null) tex = ImageTexture.CreateFromImage(image);
            }
        }
        TextureCache[definitionId] = tex;
        return tex;
    }

    private static Dictionary<string, CardArtEntry> LoadManifest()
    {
        var result = new Dictionary<string, CardArtEntry>();
        string path = ManifestPath;
        if (!System.IO.File.Exists(path)) return result;
        if (JsonNode.Parse(System.IO.File.ReadAllText(path)) is not JsonObject root) return result;
        foreach (var (defId, node) in root)
        {
            if (node is not JsonObject o) continue;
            result[defId] = new CardArtEntry(
                o["texture"]?.GetValue<string>() ?? $"res://art/cards/{defId}.png",
                o["overlay"]?.GetValue<string>() ?? "none",
                Color.FromString(o["overlayColor"]?.GetValue<string>() ?? "#ffffff", Colors.White),
                (float)(o["artScale"]?.GetValue<double>() ?? 1.0),
                (float)(o["artOffsetY"]?.GetValue<double>() ?? 0.0));
        }
        return result;
    }
}
