// THE AUDIO SEAM. Same contract as ArtLibrary: every sound is requested by a
// named slot, an artist-provided file wins if present, and otherwise a
// procedural placeholder tone is synthesised so the game is never silent.
//
//   res://art/audio/<slot>.wav   (also .ogg / .mp3)
//
// Slots: card_play, card_shield, bell, shield_break, core_break, draw,
//        goodwill, patience_loss, trap, prompt
//
// Artists just drop correctly-named files in; nothing here needs editing.
// Placeholders are short synthesised blips — deliberately plain, so it is
// obvious which sounds are still unfilled.

using System.Collections.Generic;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public static class AudioLibrary
{
    private static readonly string[] Extensions = ["wav", "ogg", "mp3"];
    private static readonly Dictionary<string, AudioStream?> Cache = new();

    /// <summary>Placeholder voicing per slot: (frequency Hz, seconds, wobble).</summary>
    private static (float Hz, float Sec, float Bend) Voice(string slot) => slot switch
    {
        "card_play" => (420f, 0.09f, -0.35f),
        "card_shield" => (300f, 0.12f, 0.15f),
        "bell" => (880f, 0.55f, -0.04f),
        "shield_break" => (190f, 0.18f, -0.6f),
        "core_break" => (140f, 0.5f, -0.5f),
        "draw" => (620f, 0.06f, 0.4f),
        "goodwill" => (720f, 0.22f, 0.5f),
        "patience_loss" => (240f, 0.16f, -0.5f),
        "trap" => (160f, 0.25f, 0.9f),
        "prompt" => (540f, 0.07f, 0f),
        _ => (440f, 0.1f, 0f),
    };

    public static AudioStream? Get(string slot)
    {
        if (Cache.TryGetValue(slot, out var cached)) return cached;
        AudioStream? stream = null;
        foreach (var ext in Extensions)
        {
            string path = $"res://art/audio/{slot}.{ext}";
            if (ResourceLoader.Exists(path)) { stream = ResourceLoader.Load<AudioStream>(path); break; }
        }
        stream ??= Synth(slot);
        Cache[slot] = stream;
        return stream;
    }

    /// <summary>Drop cached streams (after an artist adds files at runtime).</summary>
    public static void Reload() => Cache.Clear();

    /// <summary>A short decaying sine blip, rendered to a 22 kHz 16-bit stream.</summary>
    private static AudioStream Synth(string slot)
    {
        var (hz, sec, bend) = Voice(slot);
        const int rate = 22050;
        int frames = Mathf.Max(1, (int)(rate * sec));
        var pcm = new byte[frames * 2];
        for (int i = 0; i < frames; i++)
        {
            float t = i / (float)frames;                 // 0..1 through the sound
            float freq = hz * (1f + bend * t);           // slide up or down
            float env = Mathf.Pow(1f - t, 2.2f);         // quick decay
            float sample = Mathf.Sin(Mathf.Tau * freq * (i / (float)rate)) * env * 0.35f;
            short s16 = (short)(Mathf.Clamp(sample, -1f, 1f) * short.MaxValue);
            pcm[i * 2] = (byte)(s16 & 0xFF);
            pcm[i * 2 + 1] = (byte)((s16 >> 8) & 0xFF);
        }
        return new AudioStreamWav
        {
            Format = AudioStreamWav.FormatEnum.Format16Bits,
            MixRate = rate,
            Stereo = false,
            Data = pcm,
        };
    }
}

/// <summary>
/// Small polyphonic player: keeps a pool of AudioStreamPlayers so overlapping
/// cues (a break during a play) don't cut each other off.
/// </summary>
public partial class ArenaAudio : Node
{
    private readonly List<AudioStreamPlayer> _pool = [];
    private const int Voices = 8;

    [Export] public float VolumeDb { get; set; } = -6f;

    public override void _Ready()
    {
        for (int i = 0; i < Voices; i++)
        {
            var p = new AudioStreamPlayer { VolumeDb = VolumeDb };
            AddChild(p);
            _pool.Add(p);
        }
    }

    public void Play(string slot, float pitch = 1f)
    {
        var stream = AudioLibrary.Get(slot);
        if (stream == null) return;
        var free = _pool.Find(p => !p.Playing) ?? _pool[0];
        free.Stream = stream;
        free.PitchScale = Mathf.Clamp(pitch, 0.5f, 2f);
        free.VolumeDb = VolumeDb;
        free.Play();
    }
}
