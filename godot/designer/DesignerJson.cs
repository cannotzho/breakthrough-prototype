// Shared JSON formatting for the designer (Godot-free). Matches the write
// options the designer uses for the canonical file, so raw-row text the user
// sees is formatted the same way it will be saved.

using System.Text.Encodings.Web;
using System.Text.Json;

namespace Breakthrough.GodotHost.Designer;

public static class DesignerJson
{
    public static readonly JsonSerializerOptions Pretty = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
