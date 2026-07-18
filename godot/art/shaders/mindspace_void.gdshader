// The mindspace beyond the table — slow-drifting ink clouds on black.
// ARTIST SLOT: applied to a large inverted sphere around the arena
// (ArtLibrary "void_dome"). Replace with a painted skybox / real environment;
// the arena only expects *something* enclosing the scene.
shader_type spatial;
render_mode unshaded, cull_front;

uniform vec4 deep_tint : source_color = vec4(0.02, 0.02, 0.05, 1.0);
uniform vec4 cloud_tint : source_color = vec4(0.10, 0.08, 0.18, 1.0);
uniform float drift_speed = 0.02;
uniform float cloud_scale = 3.0;

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
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p = p * 2.07 + 31.0;
        a *= 0.5;
    }
    return v;
}

void fragment() {
    vec2 p = UV * cloud_scale + vec2(TIME * drift_speed, TIME * drift_speed * 0.4);
    float clouds = fbm(p + fbm(p * 1.7));
    ALBEDO = mix(deep_tint.rgb, cloud_tint.rgb, smoothstep(0.35, 0.9, clouds));
}
