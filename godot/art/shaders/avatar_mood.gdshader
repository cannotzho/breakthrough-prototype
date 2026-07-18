// Opponent avatar placeholder — dark silhouette with a mood-driven rim glow.
// ARTIST SLOT: the real avatar model replaces the procedural capsule figure
// (see ArtLibrary "avatar" scene slot); this shader can be kept for the rim
// treatment or dropped. `mood` is driven every frame by the arena:
// 0 = calm (full patience) → 1 = patience exhausted.
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

uniform float mood : hint_range(0.0, 1.0) = 0.0;
uniform vec4 calm_glow : source_color = vec4(0.35, 0.55, 0.85, 1.0);
uniform vec4 vexed_glow : source_color = vec4(0.95, 0.30, 0.18, 1.0);
uniform vec4 body_tint : source_color = vec4(0.07, 0.06, 0.09, 1.0);
uniform float rim_power = 2.4;
uniform float pulse_speed = 1.6;   // breathing; quickens with mood

void fragment() {
    float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), rim_power);
    float pulse = 0.75 + 0.25 * sin(TIME * pulse_speed * (1.0 + mood * 1.5));
    vec3 glow = mix(calm_glow.rgb, vexed_glow.rgb, mood);
    ALBEDO = body_tint.rgb;
    EMISSION = glow * rim * pulse * (0.6 + 0.8 * mood);
    ROUGHNESS = 0.7;
}
