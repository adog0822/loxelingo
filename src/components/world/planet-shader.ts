/**
 * The world body, ray-traced in one fragment shader.
 * docs/design/discovery-planet-render.md §3, §8
 *
 * Adapted from the discovery prototype at /private/tmp/loxe-planet/index.html.
 * Everything the prototype solved is kept: analytic sphere intersection (no
 * mesh, no geometry, no camera object), sin-free hashes, quintic value noise,
 * domain-warped maria, ridged highlands, Voronoi-cell craters with a real
 * radial profile, craters suppressed inside the maria, a hard terminator torn
 * by relief bias and one tap of terrain shadow, Lommel-Seeliger backscatter,
 * and an atmospheric shell that dies before the terminator does.
 *
 * Four deliberate departures from the prototype, each with a reason:
 *
 * 1. NO SKY. The prototype drew its own canvas colour, star field and haze
 *    because it was a full-screen page. Here the sky is SkyLayer's job and it
 *    is already correct, so this shader writes premultiplied alpha and
 *    composites over it. That is also what lets one canvas hold several
 *    bodies with nothing between them.
 *
 * 2. NO --altitude. The world-select screen has no rating and therefore no
 *    altitude, so there is no scalar to read and no temptation to read one
 *    per frame out of getComputedStyle.
 *
 * 3. SCREEN-SPACE OCTAVE FADE. The prototype flagged its own highest risk:
 *    `fbm(p * 34.0)` is well above pixel Nyquist at thumbnail size and would
 *    crawl as the body rotates. Rotation was never observed there, so the
 *    problem was never seen. Bodies here are 88-176 CSS px, which is exactly
 *    the size that crawls, so the regolith and mottling octaves fade out as a
 *    function of world-units-per-pixel. Cheaper than fwidth and it works
 *    inside perturbNormal, where derivatives of an offset sample are wrong.
 *
 * 4. WARPED HIGHLANDS. The prototype's honest critique names faint
 *    rectilinear structure at the maria boundary: the value-noise lattice
 *    surviving the ridged field's abs(). The warp vector computed for the
 *    maria is reused to warp the ridged field's domain, which breaks the
 *    lattice for zero extra noise evaluations.
 *
 * Colour discipline is unchanged and is enforced by construction: the only
 * vec3 colour constants are the neutral sun tint and the small warm
 * terminator bias. Every hue arrives as a uniform from the world tokens.
 *
 * COST. Measured with the same esbuild setup the render discovery used:
 * 7.23 KB gzip for this file, of which 3.20 KB is the GLSL and 3.92 KB is the
 * comments inside it. Comments in a template literal are shipped — esbuild
 * strips TypeScript comments under --minify but cannot touch string contents.
 * That is a real cost and it is kept deliberately: this shader encodes two
 * anti-patterns that were committed and fixed once already, and a build step
 * that strips them is available the day the budget needs it.
 */

/** Fullscreen triangle from gl_VertexID. No attributes, no buffers. */
export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2  iResolution;   // the body's own viewport, in device pixels
/**
 * The viewport's origin in the canvas, in device pixels. gl_FragCoord is in
 * WINDOW coordinates, not viewport coordinates: it does not restart at zero
 * for each gl.viewport. Every body except the one at the canvas origin would
 * otherwise sample far outside its own sphere and render nothing at all.
 */
uniform vec2  iOrigin;
uniform float iTime;         // seconds, already offset by the body's phase

uniform vec3  uAtmos;        // --world-<id>-atmos, linear
uniform vec3  uMark;         // --world-<id>-mark,  linear
uniform vec3  uDeep;         // --world-<id>-deep,  linear

uniform vec3  uSun;          // light direction, normalised
uniform vec3  uAxis;         // rotation axis, normalised
uniform vec4  uTerrain;      // seed, mariaLo, mariaHi, craterAmp
uniform vec4  uSurface;      // ridgeAmp, mareTint, desat, limb

#define PI 3.14159265359
#define R_BODY  1.0
#define R_ATMOS 1.032

// The sphere is framed to this fraction of the viewport's short axis. The
// remainder is headroom for the atmospheric limb.
#define FILL 0.86

// ---------------------------------------------------------------------------
// Hashing. Sin-free (Dave Hoskins). sin() precision varies across mobile GPU
// vendors and the sin-based hash bands visibly on Adreno/Mali.
// ---------------------------------------------------------------------------
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

// 3D value noise, quintic (C2). 3D rather than 2D through spherical UVs, so
// there is no pole pinch and no date-line seam. Quintic rather than Hermite,
// because Hermite's derivative creases read as a lat/long lattice on a sphere.
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), u.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y), u.z);
}

// Inter-octave rotation (iq's m3): prevents axis-aligned patterns, which are
// most visible in ridged noise.
const mat3 M3 = mat3( 0.00, 0.80, 0.60,
                     -0.80, 0.36,-0.48,
                     -0.60,-0.48, 0.64);

float fbm(vec3 p, const int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * noise3(p);
    p = M3 * p * 2.02;
    a *= 0.5;
  }
  return s;
}

/**
 * FBM and ridged FBM ("sum a*abs(noise)" squared, for sharp crests), with
 * screen-space level of detail.
 *
 * f0 is the first octave's frequency in cycles per world unit and upp is world
 * units per pixel, so f * upp is cycles per pixel. An octave past about half a
 * cycle per pixel cannot be resolved: it does not add detail, it adds noise
 * that changes chaotically as the body turns. Each octave is faded out as it
 * approaches that limit and the loop stops once it is gone, so the LOD removes
 * the crawl AND the fragment cost at the same time. Bodies here are 88-176 CSS
 * px, which is exactly where a full-screen tuning aliases.
 */
float lodWeight(float f, float upp) {
  return 1.0 - smoothstep(0.20, 0.46, f * upp);
}

float fbmL(vec3 p, const int oct, float f0, float upp) {
  float a = 0.5, s = 0.0, f = f0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float k = lodWeight(f, upp);
    if (k <= 0.002) break;
    s += a * noise3(p) * k;
    p = M3 * p * 2.02;
    a *= 0.5;
    f *= 2.02;
  }
  return s;
}

float ridgedL(vec3 p, const int oct, float f0, float upp) {
  float a = 0.5, s = 0.0, f = f0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float k = lodWeight(f, upp);
    if (k <= 0.002) break;
    float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
    s += a * n * n * k;
    p = M3 * p * 2.03;
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

// 3D Voronoi F1 + cell id (3x3x3 = 27 lookups). A cell centre is a crater
// centre and F1 is exactly the radial distance a crater profile needs.
vec2 voronoi3(vec3 x) {
  vec3 n = floor(x), f = x - n;
  float md = 8.0, mid = 0.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(n + g);
    vec3 r = g - f + o;
    float d = dot(r, r);
    if (d < md) { md = d; mid = o.x; }
  }
  return vec2(sqrt(md), mid);
}

// One octave of crater field. Real radial section: depressed floor, raised
// rim, ejecta blanket outside. A bare smoothstep(F1) gives pits, which read as
// damage rather than as geology. Most cells stay empty, so craters are not a
// lattice, and the whole profile stays inside t=1.45 so the ejecta never
// clips against the 3x3x3 search boundary and draws polygon edges.
float craters(vec3 p, float scale, float cover, out float rimMask) {
  vec2 v = voronoi3(p * scale);
  float d = v.x;
  float present = step(cover, fract(v.y * 37.13));
  float rad = 0.16 + 0.19 * fract(v.y * 91.7);
  float t = clamp(d / rad, 0.0, 1.6);

  float floorC = -smoothstep(1.0, 0.55, t);
  float rim    =  smoothstep(1.22, 0.96, t) * smoothstep(0.74, 0.99, t) * 2.2;
  float ejecta =  smoothstep(1.45, 1.05, t) * 0.14;

  rimMask = present * rim;
  return present * (floorC * 0.62 + rim * 0.5 + ejecta);
}

// World units per pixel at the body's surface, from the fixed framing. Used to
// switch off octaves that are finer than the pixel grid before they crawl.
float unitsPerPixel() {
  return 2.0 / (FILL * min(iResolution.x, iResolution.y));
}

/**
 * p arrives pre-scaled by SURFACE_SCALE, so a frequency of 1 in p is
 * SURFACE_SCALE cycles per world unit. Every f0 below is written that way, in
 * cycles per world unit, which is the space upp is measured in.
 */
#define SURFACE_SCALE 1.9

float mariaField(vec3 p, float upp, out vec3 warp) {
  warp = vec3(fbm(p + vec3(1.7, 9.2, 4.3), 3),
              fbm(p + vec3(8.3, 2.8, 6.1), 3),
              fbm(p + vec3(3.1, 5.7, 1.9), 3));
  // fbm(p + k*fbm(p)) is what turns blobs into lobed, re-entrant coastlines.
  return fbmL(p * 1.15 + 2.1 * warp, 4, 1.15 * SURFACE_SCALE, upp);
}

float elevation(vec3 p, float upp, out float maria, out float rimLight) {
  vec3 warp;
  float m = mariaField(p, upp, warp);
  maria = smoothstep(uTerrain.y, uTerrain.z, m);   // 1 = plain, 0 = highland

  // Reusing the maria warp breaks the value-noise lattice that survived the
  // ridged field's abs() in the prototype. Free: warp is already computed.
  float high = ridgedL(p * 2.6 + 1.4 * warp + 17.0, 5, 2.6 * SURFACE_SCALE, upp);

  // Crater octaves are kept while their CELL is still several pixels across
  // and dropped once it is not. The rim inside a cell is finer than the cell,
  // hence the 1.35 margin — but only a small one, because dropping an octave
  // that IS resolvable is what turns a cratered body into a waxy ball. At a
  // 168 px body this keeps the first two scales and removes the third, which
  // is the one whose cells were about two pixels wide.
  float f1 = 3.1 * SURFACE_SCALE, f2 = 7.4 * SURFACE_SCALE, f3 = 17.0 * SURFACE_SCALE;
  float k1 = lodWeight(f1 * 1.35, upp);
  float k2 = lodWeight(f2 * 1.35, upp);
  float k3 = lodWeight(f3 * 1.35, upp);

  float r1 = 0.0, r2 = 0.0, r3 = 0.0;
  float c = 0.0;
  if (k1 > 0.002) c += craters(p, 3.1, 0.62, r1) * k1;
  if (k2 > 0.002) c += craters(p, 7.4, 0.55, r2) * 0.46 * k2;
  if (k3 > 0.002) c += craters(p, 17.0, 0.48, r3) * 0.20 * k3;
  rimLight = (r1 * k1 + r2 * 0.5 * k2 + r3 * 0.25 * k3) * uTerrain.w;

  // Craters are largely erased inside the plains: they resurfaced later. This
  // one line is most of why the surface reads as a history rather than as two
  // noise fields added together.
  float craterMask = mix(1.0, 0.22, maria);

  float h = mix(high * uSurface.x, 0.06, maria) + c * craterMask * 0.13 * uTerrain.w;

  // Regolith, whose only job is to keep the terminator from being clean. It is
  // sub-pixel at thumbnail size, so it fades out rather than crawling.
  float regolith = lodWeight(34.0 * SURFACE_SCALE, upp);
  if (regolith > 0.002) h += (fbm(p * 34.0, 3) - 0.5) * 0.016 * regolith;
  return h;
}

float elevationOnly(vec3 p, float upp) {
  float a, b;
  return elevation(p, upp, a, b);
}

// Tetrahedron technique: 4 samples, accuracy between forward and central
// difference. The gradient is projected back onto the tangent plane so relief
// perturbs the normal without detaching it from the sphere.
vec3 perturbNormal(vec3 p, vec3 n, float amp, float upp) {
  // The offset must not be finer than a pixel. The prototype's fixed 0.0055
  // was a third of a pixel at these sizes, so the normal was a sub-pixel probe
  // of the height field rather than its pixel-scale slope: it produced a
  // different random normal per pixel and reshuffled it on every frame of the
  // rotation. This is the single largest source of shimmer at thumbnail size.
  float e = max(0.0055, upp * SURFACE_SCALE * 0.85);
  const vec2 k = vec2(1.0, -1.0);
  vec3 g = k.xyy * elevationOnly(p + k.xyy * e, upp) +
           k.yyx * elevationOnly(p + k.yyx * e, upp) +
           k.yxy * elevationOnly(p + k.yxy * e, upp) +
           k.xxx * elevationOnly(p + k.xxx * e, upp);
  g /= (4.0 * e);
  g -= n * dot(n, g);
  return normalize(n - g * amp);
}

// Analytic, not ray-marched: one quadratic per pixel, exact silhouette and
// exact normals. On a miss this returns (1e9, -1e9), so hit.x > 0.0 is TRUE
// for every background pixel; the x<y test is what actually means "hit".
vec2 iSphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float phaseRayleigh(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }

// Analytic shell rather than a Rayleigh/Mie integral: chord through an
// exponential shell, 6 taps, weighted by the real Rayleigh phase function.
// Wavelength dependence is carried by the world's own atmos hue, not by
// 1/lambda^4, because the palette is fixed and must not drift toward sky-blue.
vec3 atmosphere(vec3 ro, vec3 rd, float tBody, bool hitBody) {
  vec2 sh = iSphere(ro, rd, R_ATMOS);
  if (sh.x > sh.y) return vec3(0.0);

  float t0 = max(sh.x, 0.0);
  float t1 = hitBody ? min(sh.y, tBody) : sh.y;
  if (t1 <= t0) return vec3(0.0);

  float od = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = mix(t0, t1, (float(i) + 0.5) / 6.0);
    vec3 sp = ro + rd * t;
    float hgt = (length(sp) - R_BODY) / (R_ATMOS - R_BODY);
    float dens = exp(-max(hgt, 0.0) * 4.2);
    // The band must die BEFORE the terminator does. A glow that survives past
    // it is an outer-glow filter, and a ring around the whole disc is the
    // single loudest tell of a fake body.
    float lit = smoothstep(0.02, 0.42, dot(normalize(sp), uSun));
    od += dens * lit;
  }
  od *= (t1 - t0) / 6.0;

  float mu = dot(rd, uSun);
  // Kept well under 1.0 pre-tonemap so the band stays CHROMATIC. Pushed
  // brighter it clips to white and becomes the halo it is trying not to be.
  vec3 scat = uAtmos * od * phaseRayleigh(mu) * uSurface.w;
  // Forward-scattering lift only in the crescent just past the sunward limb,
  // so the glow has a position and a direction. Never a ring.
  scat += uAtmos * od * pow(max(mu, 0.0), 8.0) * uSurface.w * 0.27;
  return scat;
}

// Ordered dither. An 8-bit framebuffer over a large dark gradient bands
// visibly; a Bayer offset of 1/255 costs nothing and removes it.
float bayer(vec2 c) {
  return fract(dot(floor(c), vec2(0.5, 0.25)) + 0.375);
}

void main() {
  float minDim = min(iResolution.x, iResolution.y);
  vec2 frag = gl_FragCoord.xy - iOrigin;
  vec2 uv = (2.0 * frag - iResolution.xy) / minDim;

  // Fixed framing: a unit sphere at distance D subtends FILL of the short
  // axis, because tan(asin(R/D)) = 1/sqrt(D*D-1). No camera object, no
  // matrices, no projection: the focal length is one scalar.
  const float D = 3.2;
  float focal = FILL * sqrt(D * D - 1.0);
  vec3 ro = vec3(0.0, 0.0, D);
  vec3 rd = normalize(vec3(uv, -focal));

  float upp = unitsPerPixel();

  vec2 hit = iSphere(ro, rd, R_BODY);
  bool hitBody = (hit.x < hit.y) && (hit.y > 0.0);
  float tBody = hitBody ? max(hit.x, 0.0) : 1e9;

  // Analytic silhouette coverage, computed for every pixel rather than only
  // inside the hit, so the limb antialiases outward too. No MSAA, no
  // supersampling: the coverage is the signed distance to the silhouette,
  // measured in pixels.
  float b = dot(ro, rd);
  float dPerp = sqrt(max(0.0, dot(ro, ro) - b * b));
  float pxWorld = max(-b, 1e-3) * (2.0 / minDim) / focal;
  float cov = clamp(0.5 - (dPerp - R_BODY) / max(pxWorld, 1e-5), 0.0, 1.0);

  vec3 col = vec3(0.0);

  if (hitBody) {
    vec3 pos = ro + rd * tBody;
    vec3 nrm = normalize(pos);

    // The body turns; the light does not. 90 s per revolution. Rodrigues
    // rotation of the sample point about a tilted axis, so the poles are never
    // on the frame axes.
    float ang = iTime * (2.0 * PI / 90.0);
    float ca = cos(ang), sa = sin(ang);
    vec3 sp = nrm * ca + cross(uAxis, nrm) * sa + uAxis * dot(uAxis, nrm) * (1.0 - ca);
    sp = sp * 1.9 + uTerrain.x;

    float maria, rimHi;
    float h = elevation(sp, upp, maria, rimHi);
    // 0.55 read as self-shadowing and punched black holes in the plains. The
    // height field should shade the surface, not perforate it.
    vec3 n = perturbNormal(sp, nrm, 0.34, upp);

    // Albedo from the three world tokens and nothing else.
    vec3 alb = mix(uAtmos, uMark, smoothstep(0.18, 0.66, 1.0 - h * 1.7));
    // The plains are a mid slate, NOT --world-*-deep straight. deep is a tint
    // bed token; used as an albedo it crushes to black under any real falloff.
    alb = mix(alb, mix(uDeep, uMark, uSurface.y) * 1.18, maria * 0.72);
    // Fresh rims and ejecta are brighter than their surroundings.
    alb = mix(alb, uAtmos * 1.10, clamp(rimHi * 0.55, 0.0, 0.7));
    // Mottling, faded once it is finer than the pixel grid.
    // Albedo mottling survives smaller than height detail does: it is not
    // amplified by the lighting, so it adds texture without the shimmer that
    // a sub-pixel NORMAL produces. Hence the more permissive margin.
    float mottle = lodWeight(26.0 * SURFACE_SCALE * 0.45, upp);
    if (mottle > 0.002) alb *= 1.0 + (fbm(sp * 26.0, 3) - 0.44) * 0.24 * mottle;
    // Rock is not a saturated gemstone. Dropping purity is the difference
    // between a body in a violet world and a grape. The hue stays the world's.
    float lum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
    alb = mix(vec3(lum), alb, uSurface.z);

    float ndl = dot(n, uSun);
    float ndv = max(dot(n, -rd), 0.0);

    // Ragged terminator. A smooth arc is the second loudest tell after a
    // uniform halo. (a) relief bias: high ground crosses into light early.
    float ndlR = ndl + (h - 0.22) * 0.62;
    // (b) one-tap terrain shadow, at grazing incidence only: step along the
    // surface toward the sun, and if the ground there is higher we are in its
    // shadow. One extra elevation() on top of the 1 + 4 already spent.
    vec3 toSun = normalize(uSun - nrm * dot(nrm, uSun));
    float hAhead = elevationOnly(sp + toSun * 0.055, upp);
    float occl = clamp((hAhead - h) * 7.0, 0.0, 1.0);
    float sha = 1.0 - occl * 0.85 * smoothstep(0.62, 0.02, ndl);

    // An airless body has a hard terminator. The softness here is sub-pixel
    // roughness, not an atmosphere the concept does not have.
    float lam = max(ndlR, 0.0);
    float shade = smoothstep(-0.05, 0.06, ndlR) * sha;

    // Lommel-Seeliger. Regolith backscatters, which is why a full moon
    // photographs as a flat disc rather than a shaded ball. Blended with
    // Lambert it keeps form without the CG billiard-ball gradient.
    float ls = lam / max(lam + ndv, 1e-3);
    float diff = mix(lam, ls * 1.55, 0.42) * shade;

    // Exposure. The prototype's own critique: the lit hemisphere sat around
    // 55-65% luminance where a pale body wants 70-80%. Raised here rather than
    // in the albedo, so the plains keep their separation from the highlands.
    vec3 sunCol = vec3(1.42, 1.37, 1.31) * 1.32;
    vec3 surf = alb * sunCol * diff;
    // Fill on the lit hemisphere, tinted by the body's own scattered light.
    surf += alb * uAtmos * 0.16 * shade;
    // The night side is never black. You never return to total darkness.
    surf += alb * uDeep * 0.55 * (1.0 - shade);
    // Grazing light reddens through more regolith. Tiny.
    surf += alb * vec3(0.16, 0.075, 0.055) * pow(1.0 - abs(ndlR), 14.0) * shade;

    col = surf * cov;
  }

  col += atmosphere(ro, rd, tBody, hitBody);

  col = col / (1.0 + col);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (bayer(gl_FragCoord.xy) - 0.5) / 255.0;
  col = max(col, 0.0);

  // Premultiplied output. Alpha is the silhouette coverage, lifted by the limb
  // so the glow composites over the sky instead of being clipped away, and
  // never below any channel, which is the premultiplied validity condition.
  float a = max(cov, max(col.r, max(col.g, col.b)));
  fragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;
