// Painterly placeholder surface — procedural brushstroke/parchment look.
// ARTIST SLOT: replace or extend freely; every knob is a named uniform so
// materials built on this shader (see art/materials/ and ArtLibrary.cs) can
// be retinted without touching code. Used for card faces/backs, the table,
// shield slabs and guard backs, each via its own ShaderMaterial instance.
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

uniform vec4 base_tint : source_color = vec4(0.82, 0.76, 0.64, 1.0);
uniform vec4 shade_tint : source_color = vec4(0.35, 0.28, 0.22, 1.0);
uniform vec4 edge_tint : source_color = vec4(0.16, 0.12, 0.10, 1.0);
uniform float brush_scale = 9.0;          // stroke density
uniform float brush_stretch = 3.0;        // >1 = horizontal strokes
uniform float edge_width : hint_range(0.0, 0.25) = 0.055;
uniform float grain : hint_range(0.0, 1.0) = 0.55;
uniform float roughness_value : hint_range(0.0, 1.0) = 0.9;

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
        mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.13 + 17.0;
        a *= 0.5;
    }
    return v;
}

void fragment() {
    vec2 uv = UV;
    // brushstrokes: anisotropic fbm
    float strokes = fbm(vec2(uv.x * brush_scale * brush_stretch, uv.y * brush_scale / brush_stretch));
    float blotch = fbm(uv * brush_scale * 0.5);
    float tone = mix(blotch, strokes, 0.65);

    // darkened painterly border
    float b = smoothstep(0.0, edge_width, uv.x)
            * smoothstep(0.0, edge_width, 1.0 - uv.x)
            * smoothstep(0.0, edge_width, uv.y)
            * smoothstep(0.0, edge_width, 1.0 - uv.y);

    vec3 col = mix(shade_tint.rgb, base_tint.rgb, 0.55 + 0.45 * tone);
    col = mix(edge_tint.rgb, col, b);
    col *= 1.0 - grain * 0.25 * hash21(uv * 512.0); // canvas grain

    ALBEDO = col;
    ROUGHNESS = roughness_value;
}
