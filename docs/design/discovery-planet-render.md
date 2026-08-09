# Discovery: rendering a world as a procedural shader sphere

Status: **discovery only.** No production code was written. Nothing under `src/` was
modified. The prototype referenced throughout lives at `/private/tmp/loxe-planet/` and is
throwaway.

Scope: the celestial body on the home screen (design-system §6.1 "The Orrery"), rendered
procedurally from each world's three hue tokens, cooperating with the existing altitude
system rather than replacing it.

Everything below marked **[measured]** was run on this machine today. Everything marked
**[cited]** comes from a primary source with a URL. Everything marked **[inferred]** is
reasoning I could not verify directly and you should treat as a hypothesis.

---

## 0. What already exists, and the constraint it creates

Read before changing anything:

- `src/lib/design/altitude.ts` — the scalar, the seven bands, `derivedAltitude()`.
- `src/components/ui/altitude-provider.tsx` — writes `--altitude` and `--band-index`
  onto the world root. Nothing else.
- `src/components/ui/sky-layer.tsx` — five CSS layers. Layer 3 is the celestial body,
  currently a `radial-gradient` circle scaled by `--body-scale` and translated by
  `--body-y`.
- `src/styles/tokens.css` L165-196 — `@property --altitude` and the `calc()` chain.

The important architectural fact: **layer 3 of `SkyLayer` is the thing being replaced.**
It is a `<div>` whose `transform` and size are already driven by CSS. The correct move is
to keep that div as the positioning envelope and put a `<canvas>` inside it, so
`--body-scale` / `--body-y` continue to place the body and the shader is only responsible
for what the body *looks like*. That preserves the property the current design earns:
position and size are composited transforms that cost nothing.

`altitude.ts` already anticipates this. `derivedAltitude()` exists specifically "for canvas
and WebGL surfaces (star field, orrery, share render) which cannot read a custom property"
(L220-225). That comment is the seed of the answer to §2.

---

## 1. Three.js vs raw WebGL2 vs OGL

### Measured bundle cost **[measured]**

I did not estimate these. I installed each library, wrote a minimal entry that creates one
sphere with a custom `ShaderMaterial`/`Program` plus a renderer and camera, and bundled it
with esbuild (`--bundle --minify --format=esm --target=es2022`), which tree-shakes ESM.

| Package | Version | Minified | gzip | brotli |
|---|---|---|---|---|
| `three` | **0.185.1** | 520,318 B (508 KB) | **130,662 B (127.6 KB)** | 108,389 B (105.8 KB) |
| `ogl` | **1.0.11** | 48,717 B (47.6 KB) | **14,185 B (13.9 KB)** | 12,107 B (11.8 KB) |
| raw WebGL2 | — | 1,540 B (1.5 KB) | **829 B** | 719 B |

The raw-WebGL2 row is not a strawman. It is a complete harness: context creation, shader
compile with error reporting, program link, fullscreen-triangle VAO, uniform location
caching, DPR-aware resize, rAF loop, `webglcontextlost` handling, and a `dispose()` that
deletes the VAO and program and calls `WEBGL_lose_context`. Source:
`/private/tmp/loxe-planet/bundle-test/src/raw-entry.js`.

The GLSL itself is the same cost in all three cases: **8,489 B raw / 2,975 B gzip** for the
prototype's fragment shader with comments stripped.

### Why three.js is 127 KB for one sphere

`WebGLRenderer` is the tree-shaking wall. It statically references the full material
system, the shader chunk library (`ShaderLib`/`ShaderChunk`), the animation system's
`PropertyBinding`, `WebGLPrograms`, the uniforms library, and every buffer-attribute type.
Importing `WebGLRenderer` at all pulls in essentially the whole `three.core.js` graph.
Tree-shaking removes almost nothing, which is exactly what the 508 KB / 47.6 KB gap
between three and OGL for an identical scene demonstrates.

### Recommendation: **raw WebGL2**

Justified against the alternatives rather than by preference:

- **Against three.js.** 127.6 KB gzip is roughly the size of React plus React-DOM. This is
  the home screen, and design-system §8.3 already flags "Do not let the orrery block LCP."
  Paying 127 KB for a scene graph, a material system, and a camera abstraction — when the
  scene is *one fullscreen triangle and zero cameras* — is not a trade, it is a mistake.
  The prototype does not use a sphere mesh at all: it ray-traces an analytic sphere in the
  fragment shader (§3), so three.js's entire reason for existing (managing geometry and
  materials) is unused.
- **Against OGL.** 13.9 KB gzip is genuinely modest and OGL is a good library. But it buys
  a `Renderer`/`Camera`/`Transform`/`Mesh` graph that this effect does not have. There is
  no camera — the ray direction is computed in the shader. There is no transform hierarchy
  — there is one quad. The 13 KB delta over raw is paying for abstractions that would sit
  unused, and it adds a dependency that must be version-managed for a file that will not
  change once it works.
- **For raw WebGL2.** The whole surface area needed is: `getContext`, `createShader`,
  `shaderSource`, `compileShader`, `createProgram`, `linkProgram`, `getUniformLocation`,
  `uniform*`, `drawArrays`. That is nine calls. The 1.5 KB harness above is the entire
  implementation and it is auditable in one screen.

**When this recommendation flips:** if the orrery later needs real 3D — actual depth-sorted
spheres on an orbital arc with per-object depth-of-field blur, rather than a 2D arrangement
of independently-rendered discs — reach for OGL, not three.js. Do not adopt three.js for
this product without a second, unrelated 3D requirement to amortise it.

WebGL2 (`#version 300 es`) rather than WebGL1 is safe: WebGL2 is Baseline (Safari shipped
it in 15.0, iOS 15). The `webgl-pitfalls` adaptations in the shader-dev skill apply and are
followed in the prototype: `gl_FragCoord.xy` rather than ShaderToy's `fragCoord`, an
explicit `out vec4 fragColor`, `precision highp float;`, and `#version` as the literal
first character of the source (hence `.trim()`).

---

## 2. Reading `--altitude` into a shader uniform — the crux

### The premise in the brief is half right, and the wrong half matters

I tested this directly in Chrome 148 rather than reasoning about it.

**Finding A — `getComputedStyle` does return the interpolated value. [measured]**
Scrubbing a paused WAAPI animation on the registered property and reading each step:

| animation currentTime | `getComputedStyle().getPropertyValue('--altitude')` | `computedStyleMap().get('--altitude')` |
|---|---|---|
| 0 ms | `"0"` | `CSSUnitValue { value: 0 }` |
| 500 ms | `"0.125"` | `CSSUnitValue { value: 0.125 }` |
| 2000 ms | `"0.5"` | `CSSUnitValue { value: 0.5 }` |
| 3500 ms | `"0.875"` | `CSSUnitValue { value: 0.875 }` |
| 4000 ms | `"1"` | `CSSUnitValue { value: 1 }` |

This is spec-guaranteed, not a Chrome quirk: a running transition "adds a style called the
current value to the CSS cascade"
([CSS Transitions L1](https://drafts.csswg.org/css-transitions/#application)), and
registered custom properties "interpolate by computed value, in accordance with the type
that they parsed as"
([CSS Properties and Values API L1](https://drafts.css-houdini.org/css-properties-values-api-1/)). **[cited]**

**Finding B — a derived unregistered property does NOT resolve. [measured]**
This is the trap. `--haze` is `calc(0.94 - (var(--altitude) * 0.92))` and is *not*
registered. Reading it returns the substituted-but-unevaluated string:

```
getPropertyValue('--haze')  →  "calc(0.94 - (0.125 * 0.92))"
```

So you can read `--altitude`, but you cannot read any of the six derived quantities in
`tokens.css` L189-195 as numbers. Recompute them in the shader from the scalar (which is
what `derivedAltitude()` in `altitude.ts` already does for JS consumers).

**Finding C — the cost is entirely about *when* you read, not *whether*. [measured]**
Per-call cost, 5000 iterations, one element:

| Operation | µs/call |
|---|---|
| `getComputedStyle` read, no pending invalidation | **0.22** |
| `computedStyleMap().get()`, no pending invalidation | **0.16** |
| `getComputedStyle` read immediately after a style write | **8.32** |
| `computedStyleMap()` read immediately after a style write | 7.80 |
| `offsetWidth` (forced layout), for scale | 8.60 |

A clean read is ~0.2 µs — 0.001% of a 16.7 ms frame. The 38× penalty is *layout thrashing*,
not the read.

**Finding D — the real cost scales with the inheriting subtree. [measured]**
This is the number that actually matters, and it is bad news for the existing architecture
rather than for the planet. Reading `--altitude` while a transition runs, varying the
number of descendants under `[data-world]`:

| Descendants | Descendants consume the derived vars? | µs per read |
|---|---|---|
| 0 | — | **4.5** |
| 50 | yes | 32 |
| 200 | yes | 114 |
| 800 | yes | 462 |
| 1500 | yes | **872** |
| 3000 | yes | 1716 |
| 1500 | **no** | **688** |
| 3000 | **no** | 1401 |

Two things fall out:

1. Cost is linear in descendant count, ~0.5 µs/node.
2. **It is nearly as expensive when the descendants do not consume the property at all**
   (688 vs 872 µs at 1500 nodes). Because `--altitude` is `inherits: true`, animating it
   invalidates the computed style of every node in the subtree regardless of use.

**Finding E — the interpolation is NOT composited. [cited]**
Blink's `CompositorAnimations::CheckCanStartEffectOnCompositor`, `case
CSSPropertyID::kVariable`, bails to `DefaultToUnsupportedProperty` unless the property
feeds a registered CSS Paint worklet: *"Custom properties are supported only for certain
property types, and only when a paint worklet is registered for that property."*
([compositor_animations.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/animation/compositor_animations.cc))
`CSS.paintWorklet` is Chromium-only, so that escape hatch is not cross-browser.

This corrects the doc comment in `altitude-provider.tsx` L64-68, which says the browser
"interpolates it on the compositor. There is no interpolation loop and no re-render per
frame." The second sentence is true — React does not re-render. The first is not: the
`--altitude` transition runs a **main-thread style recalc of the entire world subtree on
every frame** of the 1200 ms `--dur-cinema` transition, today, with no planet involved.

### The mechanism I recommend

**Drive the scalar from JS as the single source of truth, and mirror it into CSS.**

Rationale, given Finding E: CSS interpolation of `--altitude` is main-thread work of
exactly the same kind JS would do. It is not buying off-main-thread interpolation, because
there is none. So the only thing the CSS-owns-the-value design buys is *not writing an
interpolation loop* — and it charges a whole-subtree style recalc per frame for it.

```ts
// src/lib/design/altitude-tween.ts  (SKETCH — not written to src/)
// One rAF loop per world root, alive only while a change is in flight.

const EASE_ATMOS = cubicBezier(0.65, 0, 0.35, 1); // matches --ease-atmos
const DUR = 1200;                                  // matches --dur-cinema

export function createAltitudeTween(root: HTMLElement, initial: number) {
  let current = initial, from = initial, to = initial, startedAt = 0, raf = 0;
  const subs = new Set<(a: number) => void>();

  // Written once per frame, on ONE element. Descendants still recalc, but there
  // is no CSS transition, so we control exactly when that happens.
  const commit = (a: number) => {
    current = a;
    root.style.setProperty('--altitude', a.toFixed(4));
    for (const fn of subs) fn(a);
  };

  const tick = (now: number) => {
    const t = Math.min(1, (now - startedAt) / DUR);
    commit(from + (to - from) * EASE_ATMOS(t));
    if (t < 1) raf = requestAnimationFrame(tick);
    else raf = 0;
  };

  return {
    /** Descent is applied silently (design-system §5.3). */
    set(next: number, animate = next > current) {
      if (!animate) { cancelAnimationFrame(raf); raf = 0; from = to = next; commit(next); return; }
      from = current; to = next; startedAt = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    },
    get: () => current,
    subscribe(fn: (a: number) => void) { subs.add(fn); fn(current); return () => subs.delete(fn); },
    dispose() { cancelAnimationFrame(raf); subs.clear(); },
  };
}
```

The planet then does `gl.uniform1f(uAltitude, tween.get())` in its own rAF callback. Zero
style reads, zero parsing, and the shader and the CSS are reading the same number by
construction.

**Cost of the change:** `tokens.css` keeps the `@property` registration and the entire
`calc()` chain unchanged — those still work, they are just fed by a JS write instead of a
CSS transition. Remove `transition: --altitude ...` from `[data-world]` (L203). The
`[data-descending]` suppression rule (L208-210) is replaced by the `animate` argument.

### If you want to keep CSS as the owner

Two options, in order of preference. Neither is as good, but both are workable.

1. **Cache the `Animation` object; poll timing, not style.** `getAnimations()` itself
   flushes style (`Element::GetAnimationsInternal` calls
   `UpdateStyleAndLayoutTreeForElement(..., kWebAnimation)`
   [element.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/dom/element.cc)) **[cited]**, so call it *once*
   on `transitionrun` and keep the reference. Thereafter
   `anim.effect.getComputedTiming().progress` reads timeline state, not computed style, and
   forces nothing. You interpolate `from + (to - from) * progress` yourself. Verified that
   a custom-property transition does surface as a real `CSSTransition` with
   `transitionProperty === '--altitude'` **[measured]**. The cost is that you must
   replicate `--ease-atmos` in JS anyway — at which point you have most of the tween above
   and none of its clarity.

2. **`computedStyleMap().get('--altitude').value` once per frame, at the very top of the
   rAF callback, before any style writes.** Honest assessment: this is fine on desktop
   (Finding C: 0.16 µs clean) and fine on a small subtree. It becomes a real problem in
   exactly the situation the orrery creates — a large world subtree with a transition
   running (Finding D: 872 µs at 1500 nodes, which on a mid-range Android is 3.5-9 ms,
   i.e. 20-50% of the frame). Note that `computedStyleMap` is **not** meaningfully cheaper
   than `getComputedStyle`: Blink's `ComputedStylePropertyMap::UpdateStyle` calls the
   identical `UpdateStyleAndLayoutTreeForElement`, and the source even carries the comment
   *"This code is copied from CSSComputedStyleDeclaration::GetPropertyCSSValue"*
   ([computed_style_property_map.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/css/cssom/computed_style_property_map.cc)) **[cited]**.
   Its only advantage is returning a `CSSUnitValue` so you skip `parseFloat`.

   Custom properties are not layout-dependent, so the flush is style-only — no forced
   layout ([css_computed_style_declaration.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/css/css_computed_style_declaration.cc)) **[cited]**.

---

## 3. The shader

Full source: `/private/tmp/loxe-planet/index.html`. Techniques are cited to the shader-dev
skill rather than invented. Design decision first, because it drives everything else:

**The Japanese world is a moon, not an Earth.** design-system §2.5 defines it as "The Cloud
Sea. A vast pale moon low over a sea of cloud." So the surface is maria and cratered
highlands, not continents and oceans. This is also the anti-slop choice: a blue-marble
continents-and-clouds planet is the single most generated image in existence.

### Geometry: analytic, not ray-marched

`shader-dev/analytic-ray-tracing` Step 2. One quadratic per pixel gives an exact silhouette
and exact normals, with no iteration:

```glsl
vec2 iSphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
```

> **The miss sentinel bit me and will bit you.** On a miss this returns `(1e9, -1e9)`, so
> `hit.x > 0.0` is **true for every background pixel**. My first render drew the surface
> across the entire sky. The correct test is `hit.x < hit.y && hit.y > 0.0`. This is the
> same class of error as the "distance bound not updated" pitfall the technique file warns
> about.

### Noise: 3D, quintic, sin-free

`shader-dev/procedural-noise`, "Hash Functions" and "Quintic Noise with Analytical
Derivatives".

- **3D, not 2D on a UV sphere.** A 2D noise sampled through spherical UVs pinches at the
  poles and seams at the date line. Sampling 3D noise at the surface point has neither.
- **Sin-free hash** (Dave Hoskins form), because `sin()` precision varies across mobile GPU
  vendors and the sin-based hash bands visibly on Adreno/Mali.
- **Quintic interpolation** `6t⁵−15t⁴+10t³` rather than Hermite `3t²−2t³`. The technique
  file's reason is exactly the symptom here: C2 continuity "eliminates visible grid
  artifacts in derivatives", and on a sphere those artifacts read as an unmistakable
  lattice.
- **Inter-octave rotation** with iq's `M3` matrix, "prevents axis-aligned patterns
  especially visible in ridged noise".

### Surface: three layers

1. **Maria** — domain-warped low-frequency FBM, softly thresholded. `shader-dev/domain-warping`
   plus procedural-noise "Domain Warping": `fbm(p + 2.1*fbm(p))` is what turns blobs into
   coastlines. Plain thresholded FBM gives amoeba shapes; the warp gives lobed, re-entrant
   basins.
2. **Highlands** — ridged FBM, the `sum a*abs(noise)` variant from the FBM quick-reference
   table ("sharp ridges"), squared to sharpen the crests.
3. **Craters** — 3D Voronoi F1, from `shader-dev/voronoi-cellular-noise` Step 2 lifted to
   3D (3×3×3 = 27 lookups). This is the load-bearing idea: **a Voronoi cell centre is a
   crater centre, and F1 is exactly the radial distance a crater profile needs.**

```glsl
float craters(vec3 p, float scale, float cover, out float rimMask) {
  vec2 v = voronoi3(p * scale);
  float d = v.x;
  float present = step(cover, fract(v.y * 37.13));   // most cells stay empty
  float rad = 0.16 + 0.19 * fract(v.y * 91.7);       // per-crater radius
  float t = clamp(d / rad, 0.0, 1.6);
  float floorC = -smoothstep(1.0, 0.55, t);                              // bowl
  float rim    =  smoothstep(1.22, 0.96, t) * smoothstep(0.74, 0.99, t) * 2.2;
  float ejecta =  smoothstep(1.45, 1.05, t) * 0.14;
  rimMask = present * rim;
  return present * (floorC * 0.62 + rim * 0.5 + ejecta);
}
```

Three details that separate "craters" from "dents":

- The **radial profile is real** — depressed floor, raised rim, ejecta blanket outside. A
  bare `smoothstep(F1)` gives pits, which read as damage rather than geology.
- **Most cells are empty** (`present`), so craters are not a lattice. Three size octaves at
  scales 3.1 / 7.4 / 17.0 with different coverage.
- **Craters are suppressed inside the maria** (`craterMask = mix(1.0, 0.22, maria)`),
  because maria resurfaced later. This one line is most of why it reads as a history rather
  than as two noise fields added together.

> **The profile must stay inside the cell.** My first version used `rad` up to 0.64 and
> ejecta out to `t=2.0`, which exceeds the radius a 3×3×3 F1 search is correct for. The
> ejecta clipped against the search boundary and drew straight polygonal edges across the
> surface. Keeping `rad ≤ 0.35` and the profile inside `t ≤ 1.45` fixes it.

### Normals: tetrahedron technique

`shader-dev/normal-estimation` — 4 samples, "accuracy between forward and central
difference", the file's preferred method. The gradient is projected back onto the tangent
plane so relief perturbs the normal without detaching it from the sphere:

```glsl
vec3 perturbNormal(vec3 p, vec3 n, float amp) {
  const float e = 0.0055;
  const vec2 k = vec2(1.0, -1.0);
  vec3 g = k.xyy * elevationOnly(p + k.xyy * e) +
           k.yyx * elevationOnly(p + k.yyx * e) +
           k.yxy * elevationOnly(p + k.yxy * e) +
           k.xxx * elevationOnly(p + k.xxx * e);
  g /= (4.0 * e);
  g -= n * dot(n, g);                      // keep it tangent to the sphere
  return normalize(n - g * amp);
}
```

Amplitude matters more than it looks. At 0.55 the relief read as self-shadowing and punched
black holes in the maria; 0.34 shades the surface without perforating it.

### Terminator: hard, and ragged

Two independent points, both anti-slop.

**Hard.** An airless body has a knife-edge terminator. Softening it fakes an atmosphere the
concept does not have, and a wide soft terminator is a reliable tell of a procedural planet.
`smoothstep(-0.05, 0.06, ndl)` is sub-pixel roughness, not a gradient.

**Ragged.** A perfectly smooth terminator arc is the second-biggest tell after a uniform
halo. On a real cratered body the line is torn: high rims stay lit past it, crater floors go
dark before it. Two cheap terms buy that:

```glsl
//  (a) relief bias — high ground crosses into the light early.
float ndlR = ndl + (h - 0.22) * 0.62;

//  (b) one-tap terrain shadow — step along the surface toward the sun; if the
//      ground there is higher, we are in its shadow. Grazing incidence only.
vec3 toSun = normalize(sunDir - nrm * dot(nrm, sunDir));
float hAhead = elevationOnly(sp * 1.9 + toSun * 0.055);
float occl = clamp((hAhead - h) * 7.0, 0.0, 1.0);
float sha = 1.0 - occl * 0.85 * smoothstep(0.62, 0.02, ndl);

float shade = smoothstep(-0.05, 0.06, ndlR) * sha;
```

(b) costs one extra `elevation()` evaluation — a 6th on top of the 1 + 4 already spent, so
about +20%. It is the highest-value 20% in the shader.

**Lommel-Seeliger.** Regolith backscatters strongly, which is why a full moon photographs as
a flat disc rather than a shaded ball. Blending it with Lambert keeps form without the CG
billiard-ball gradient:

```glsl
float ls = lam / max(lam + ndv, 1e-3);
float diff = mix(lam, ls * 1.55, 0.42) * shade;
```

### Atmosphere: analytic shell, deliberately narrow

A full Rayleigh/Mie integral (`shader-dev/atmospheric-scattering` Steps 5-6) is 32×8 nested
samples per pixel and unaffordable here. The prototype uses "Variant 1: Non-Physical
Analytic Approximation" — chord through an exponential shell, 6 taps, weighted by the real
Rayleigh phase function `P(θ) = 3/(16π)(1+cos²θ)` from Step 3. Wavelength dependence is
carried by the world's own `atmos` hue rather than by 1/λ⁴, because the palette is fixed by
§2.5 and must not drift toward physical sky-blue.

The two lines that keep it from being an outer-glow filter:

```glsl
// The band must DIE before the terminator does.
float lit = smoothstep(0.02, 0.42, dot(normalize(sp), sunDir));
// Kept well under 1.0 pre-tonemap so the band stays CHROMATIC. Pushed brighter it
// clips to white and becomes the halo it is trying not to be.
vec3 scat = uAtmos * od * phaseRayleigh(mu) * 11.0;
```

My iteration 2 got both wrong (`smoothstep(-0.35, 0.22, ...)` and a `26.0` multiplier) and
produced a perfectly even white ring around the whole disc — textbook §8.1 "uniform bloom".
Shell thickness also matters: 1.055 R read as a soft Photoshop glow, 1.032 R reads as a limb.

### Rotation

Rodrigues rotation of the *sample point* about a tilted axis, 90 s per revolution to match
design-system §6.1 "Globes rotate at 90s". The body turns; the light does not. The axis is
tilted `(0.16, 1.0, 0.09)` so the poles are not on the frame axes.

### Colour discipline

Only `--world-{id}-atmos`, `-mark`, `-deep` and `--ink-100` enter the shader, converted
sRGB→linear (`pow(c, 2.2)`) on upload. Lighting in gamma space is the fastest way to make a
procedural sphere look like plastic.

One correction was necessary: **`deep` cannot be used directly as an albedo.** It is a tint-bed
token (`#321e5c`); under any realistic falloff the maria crushed to black and the "vast pale
moon" became a bruise. `mix(uDeep, uMark, 0.52) * 1.45` gives a mid slate. And rock is not a
gemstone — pulling 40% of the chroma out is the difference between a moon and a grape:

```glsl
float lum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
alb = mix(vec3(lum), alb, 0.60);   // hue is still entirely --world-ja-*; purity drops
```

---

## 4. Performance and battery

### Measured GPU cost **[measured]**

`EXT_disjoint_timer_query_webgl2`, batches of 24-60 draws, Apple M4 via ANGLE/Metal.
These are GPU times for the *full-screen* shader; the real component renders into a much
smaller box.

| Target | Pixels | GPU ms/frame |
|---|---|---|
| Desktop 1440×900 | 1.30 M | 1.18 |
| Desktop 2560×1440 | 3.69 M | 5.69 |
| Mobile 390×760 @dpr1 | 0.30 M | 0.71 |
| Mobile 390×760 @dpr2 | 1.19 M | 1.36 |
| Mobile 390×760 @dpr3 | 2.67 M | 4.51 |
| Half-res 195×380 | 0.07 M | 0.38 |
| Orrery thumbnail 260×260 | 0.07 M | 0.29 |

Roughly **0.9-1.7 ns/pixel** on an M4, superlinear at high resolution.

### Mid-range Android **[inferred — this is extrapolation, not measurement]**

I have no Android device here. A mid-range 2024-2026 part (Adreno 6xx-7xx lower tier, Mali-G57/G68)
has fragment throughput roughly **8-20× below an M4**. Applying that to the dpr2 row:

- Full-viewport at dpr2: 1.36 ms × 8-20 = **11-27 ms/frame.** Misses 60 fps outright,
  marginal even for 30 fps. Not shippable.
- Half-resolution: 0.38 ms × 8-20 = **3-8 ms/frame.** Comfortable at 30 fps, viable at 60.
- Orrery thumbnail: 0.29 ms × 8-20 = **2.3-6 ms.** Fine.

**Treat these as a hypothesis to be replaced by a real measurement on a real device before
shipping.** The right instrument is the same `EXT_disjoint_timer_query_webgl2` probe, run
on a physical mid-tier Android over remote debugging.

### The controls, with the actual APIs

**Render at reduced resolution and upscale.** The single biggest lever, and free, because
the subject is a soft-edged sphere with no text. Set the backing store below CSS size and
let the compositor scale:

```js
const dpr = Math.min(window.devicePixelRatio || 1, qualityTier.dprCap); // e.g. 1.0 or 0.75
canvas.width  = Math.round(canvas.clientWidth  * dpr);
canvas.height = Math.round(canvas.clientHeight * dpr);
gl.viewport(0, 0, canvas.width, canvas.height);
// CSS keeps the element at its layout size; the browser upscales bilinearly.
```

Note `image-rendering: auto` (the default) is what you want here — `pixelated` would be wrong.

**Pause when off-screen — `IntersectionObserver`.**

```js
const io = new IntersectionObserver(
  ([entry]) => (entry.isIntersecting ? planet.start() : planet.stop()),
  { threshold: 0.01 },
);
io.observe(canvas);
// teardown: io.disconnect();
```

**Pause when the document is hidden — `visibilitychange`.**

```js
const onVis = () => (document.hidden ? planet.stop() : planet.start());
document.addEventListener('visibilitychange', onVis);
// teardown: document.removeEventListener('visibilitychange', onVis);
```

This one is belt-and-braces rather than strictly necessary, and I confirmed why
**[measured]**: with the probe page in a hidden tab, `document.visibilityState === "hidden"`,
`requestAnimationFrame` never fired at all, and a running CSS transition did not advance.
That is spec-mandated, not an optimisation — HTML's "update the rendering" *filters
non-renderable documents*, removing any Document whose "visibility state is 'hidden'"
before running animation frame callbacks
([HTML spec](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)) **[cited]**.
The same filtered list feeds IntersectionObserver delivery, so **IO cannot detect the
hidden→visible transition** — you need `visibilitychange` for that. Explicitly stopping is
still worth doing so you do not resume mid-tween with a stale clock.

**rAF pacing.** Do not target 60 fps. A body rotating once per 90 s does not need it:

```js
const MIN_FRAME_MS = 1000 / 30;              // 30 fps is imperceptible here
let lastDraw = 0;
function loop(now) {
  if (!running) return;
  if (now - lastDraw >= MIN_FRAME_MS) { lastDraw = now; draw(); }
  raf = requestAnimationFrame(loop);         // still rAF-driven, just not every tick
}
```

**Do not throttle during an altitude change.** The 1200 ms `--dur-cinema` transition is the
one moment the body must be smooth. Run at full rate while `tween` is in flight, drop to
30 fps (or lower) at rest.

**Reduced motion is also a battery lever** — see §5.

---

## 5. Fallbacks

### Detection

```ts
// SKETCH — not written to src/
export type PlanetTier = 'full' | 'reduced' | 'still' | 'css';

export function detectTier(): PlanetTier {
  if (typeof window === 'undefined') return 'css';                       // SSR, see §7

  // 1. Reduced motion is a user instruction, not a capability. It wins outright.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'still';

  // 2. No WebGL2 context at all.
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  if (!gl) return 'css';
  gl.getExtension('WEBGL_lose_context')?.loseContext();                  // free it immediately

  // 3. Low-end heuristics. Never user-agent sniffing.
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory as number | undefined;     // Chromium only
  if (cores <= 4) return 'reduced';
  if (mem !== undefined && mem <= 4) return 'reduced';

  return 'full';
}
```

`failIfMajorPerformanceCaveat: true` is the important flag — it makes `getContext` return
`null` on software rasterisers (SwiftShader/llvmpipe) rather than handing you a context that
renders at 2 fps.

**Honest limits of the heuristics [cited]:**

- `navigator.deviceMemory` is **Chromium-only**. MDN BCD records `firefox: false`,
  `safari: false`; MDN labels it "Limited availability… not Baseline"
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)). It is
  also secure-context-only and rounded to a power of two
  ([W3C Device Memory](https://www.w3.org/TR/device-memory/)). Chrome 147 changed the
  buckets to `2,4,8,16,32` desktop / `1,2,4,8` Android
  ([Chrome release notes](https://developer.chrome.com/release-notes/147)), so any
  threshold written against the old `0.25…8` scale is now wrong. Treat it as a bonus
  signal, never a requirement.
- `navigator.hardwareConcurrency` is universal but **clamped for anti-fingerprinting**.
  WebKit clamps to 2 on iOS and 8 elsewhere ([caniuse](https://caniuse.com/hardwareconcurrency),
  [webkit.org/b/233381](https://webkit.org/b/233381)). Firefox under
  `privacy.resistFingerprinting` returns 8 on macOS, 4 elsewhere
  ([RuntimeService.cpp](https://github.com/mozilla-firefox/firefox/blob/main/dom/workers/RuntimeService.cpp)).
  So `cores <= 4` will misclassify a fingerprint-resistant Firefox desktop as low-end. That
  is an acceptable failure direction: it degrades gracefully to a still frame.

**The heuristic worth adding: a first-frame timing probe.** More honest than either static
signal, because it measures the actual device:

```ts
// After the first real frame, using the GPU timer if available and wall-clock if not.
function probeAndDemote(planet, onDemote) {
  const samples: number[] = [];
  let n = 0;
  const measure = (ms: number) => {
    if (n++ < 3) return;                    // discard shader-compile and first-paint frames
    samples.push(ms);
    if (samples.length < 20) return;
    const median = samples.sort((a, b) => a - b)[10];
    if (median > 8) onDemote('reduced');    // >8ms of a 16.7ms budget on the planet alone
    if (median > 20) onDemote('still');
  };
  planet.onFrameCost = measure;
}
```

### The three fallbacks

| Trigger | Falls back to | Why |
|---|---|---|
| **No WebGL2 context** (`getContext` null, or software caveat) | `'css'` — the existing `SkyLayer` layer-3 `radial-gradient` div, unchanged | It already exists, already responds to `--body-scale`/`--body-y`, and already looks intentional. This is the strongest argument for keeping the canvas *inside* the current div rather than replacing it. |
| **`prefers-reduced-motion: reduce`** | `'still'` — one shader frame, rendered once, then the rAF loop is never started | design-system §4.5: "Haze drift, star parallax, globe rotation → Static. The sky is a still gradient." The body should still be the real body, just not turning. |
| **Low-end device** | `'reduced'` — half-resolution, 24 fps, `OCTAVES` reduced via a `#define` injected at compile time, crater octaves 3→2 | Preserves the composition; spends less per pixel. |

### Is a still frame from the same shader achievable? Yes, and it is the right answer.

This is the best part of the design. The still fallback is not a separate asset — it is
`draw()` called exactly once:

```js
const planet = createPlanet(canvas, VS, FS, { dpr: 1 });
planet.draw(altitude);        // one frame, at t = 0
// never call planet.start()
```

Two refinements make it production-grade:

1. **Pick a good `iTime`.** `t = 0` puts the body at rotation zero, which may put the most
   interesting terrain on the far side. Choose a per-world constant that frames good
   geography, exactly as you would choose a poster frame.
2. **Free the context immediately.** A still frame does not need a live context, and
   contexts are the scarce resource (§6). Render once, copy to a bitmap, drop the context:

```js
// Render once, transfer to a plain 2D canvas or an ImageBitmap, then release.
planet.draw(altitude);
const bitmap = await createImageBitmap(canvas);
planet.dispose();                                 // deletes program+VAO, loseContext()
targetCtx2d.drawImage(bitmap, 0, 0);
bitmap.close();
```

This directly resolves the tension with design-system §8.3, "Do not let the orrery block
LCP. Poster image first, WebGL hydrated after." The requirement forbids image *assets* —
but a poster **rendered by the same shader at runtime** is not an asset. It is not stock, it
cannot read as AI-generated, it ships zero bytes of image, and it is pixel-identical to the
animated version's first frame. Render the poster on first paint at low resolution, then
promote to the animated context if the device earns it.

---

## 6. Multiple planets at once

### The limits are real and lower than you think **[measured + cited]**

I created 24 additional WebGL2 contexts on a page that already had one, in Chrome 148:

```
created:        24   (getContext returned null ZERO times)
webglcontextlost events: 8
survivors:      16
main page canvas context lost: TRUE   ← it existed BEFORE all 24 probes
```

Exactly 16 survive. The **oldest are silently force-lost**, and the first casualty was the
page's own hero canvas.

Documented limits **[cited]**:

| Engine | Main thread | Worker | Source |
|---|---|---|---|
| Chrome/Blink | **16 desktop, 8 Android** | 4 | `max_active_webgl_contexts = 8u` on Android, `16u` otherwise — [webgraphicscontext3d_provider_impl.cc](https://github.com/chromium/chromium/blob/main/content/renderer/webgraphicscontext3d_provider_impl.cc) |
| Safari/WebKit | **16** | 4 | `static constexpr size_t maxActiveContexts = 16;` — [WebGLRenderingContextBase.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/WebGLRenderingContextBase.cpp) |
| Firefox/Gecko | 1000 (300/principal) | — | `webgl.max-contexts` — [StaticPrefList.yaml](https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml) |

**What happens on overflow** — and this is the dangerous part: `getContext` does **not**
return null. Blink loops `while (ActiveContexts().size() >= max_gl_contexts)` calling
`ForciblyLoseOldestContext`, printing:

> `WARNING: Too many active WebGL contexts. Oldest context will be lost.`

WebKit's equivalent, logged at **error** level:

> `There are too many active WebGL contexts on this page, the oldest context will be lost.`

"Oldest" in Blink is *least-recently-flushed*, not creation order. The victim gets a real
`webglcontextlost` event, but because the recovery method is `kWhenAvailable` rather than
`kAuto`, the restore timer is not auto-started — the context is parked on an evicted list.

### Recommendation: **one context, one canvas, all planets**

The orrery shows one centred world and up to six receding on an arc. Seven contexts on
Android (limit **8**) leaves exactly one spare for anything else on the page — a chart, a
share-card renderer, a dev tool. That is not a margin, that is a fault waiting for a feature.

Use a single full-bleed canvas behind the orrery and draw every body in one pass:

- **Preferred: one fragment shader, N analytic spheres.** The geometry is already analytic
  (§3) — extending `iSphere` to a small loop over N centres/radii is the standard
  `worldHit` pattern from `shader-dev/analytic-ray-tracing` Step 7, with the world's three
  hues indexed per body. Distant peers are cheap: drop their octave count and skip craters
  entirely, which is also exactly what design-system §6.1 asks for ("Peers 3+ steps away are
  silhouettes"). Mind the technique file's loudest warning: update `d.y` after every closer
  hit, or the whole scene goes black.
- **Alternative: one context, N viewports.** `gl.viewport()` + `gl.scissor()` per body,
  drawing the same program repeatedly into different rectangles of one canvas. Simpler to
  reason about, keeps each planet's uniforms independent, still one context. Costs N draw
  calls instead of one, which is irrelevant at N=7.

Either way, **never** one `<canvas>` per world tile.

If per-tile canvases become unavoidable for layout reasons, the escape hatch is
`OffscreenCanvas` + `transferToImageBitmap()`: render all bodies in one offscreen context
and blit each result into a cheap 2D canvas per tile. 2D contexts are not subject to the
WebGL limit.

---

## 7. SSR

### The boundary

`src/app/w/[world]/page.tsx` and the orrery are Server Components. The planet needs
`window`, `document`, `canvas.getContext`, `requestAnimationFrame`, and
`matchMedia` — none of which exist on the server.

**Recommendation: a client component with a mount guard, rendered as a child of the server
component. Not `next/dynamic` with `ssr: false` at the page level.**

```tsx
// src/components/ui/planet-canvas.tsx   (SKETCH)
"use client";

import { useEffect, useRef, useState } from "react";

export function PlanetCanvas({ world }: { world: WorldId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Never true on the server, and never true on the hydration render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !ref.current) return;
    const tier = detectTier();
    if (tier === "css") return;                       // leave the gradient div showing
    const planet = createPlanet(ref.current, VS, FS, { dpr: dprFor(tier) });
    if (!planet) return;
    planet.draw(tween.get());                          // poster frame, synchronously
    if (tier !== "still") planet.start();
    return () => planet.dispose();                     // §8: this is not optional
  }, [mounted, world]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
```

**What the server renders:** the `<canvas>` element itself, empty, with its layout box.
Plus — critically — the existing `radial-gradient` body div behind it from `SkyLayer`, which
is pure CSS and renders identically on server and client.

**Does this cause a hydration mismatch? No, and the reason matters.** The server and the
first client render produce *byte-identical* markup, because `mounted` is `false` in both.
All capability detection and all canvas work happens in `useEffect`, which runs only after
hydration has committed. This is the same discipline `sky-layer.tsx` already applies to the
star field — it seeds the LCG at module scope precisely "so server and client render the
same sky and there is no hydration mismatch" (L6-9).

**Why not `next/dynamic({ ssr: false })`:** it would work, but it is the wrong tool here.
`ssr: false` means the server emits *nothing* for that subtree, so there is no server-rendered
box — you get a layout shift when the component arrives, and you lose the CSS gradient
fallback that should be visible the entire time. The mount-guard version server-renders the
full composition (gradient body, correct size, correct position from `--body-scale`) and the
canvas simply paints over it when ready. That is strictly better for LCP and CLS, which
§8.3 explicitly cares about.

Do use `next/dynamic` for the *shader source string* if it grows — `await import('./planet.glsl')`
keeps ~3 KB gzip out of the initial chunk. That is a code-splitting decision, not an SSR one.

**One SSR trap specific to this design:** do not read `--altitude` from the DOM during the
first client render to seed the uniform. The rating is already known on the server; pass it
as a prop and derive the scalar with `altitudeFromRating()` from `altitude.ts`. Reading
computed style during hydration is both a forced recalc at the worst possible moment and a
source of first-frame flicker.

---

## 8. Anti-patterns

### The AI-slop tells, specific to a procedural planet

Ranked by how reliably each one gives the game away. The first two I *committed* in this
prototype and had to fix, which is the best evidence they are the defaults you fall into.

1. **A uniform halo around the whole disc.** The single loudest tell. Real scattering has a
   position: it is brightest on the sunward limb and it *dies before the terminator*. My
   iteration 2 lit the shell with `smoothstep(-0.35, 0.22, ...)` and a 26× multiplier and
   produced an even white ring. Two fixes: gate the shell strictly to the lit side
   (`smoothstep(0.02, 0.42, ...)`), and keep the pre-tonemap magnitude under 1.0 so the band
   stays chromatic instead of clipping to white. A glow that clips to white **is** a bloom
   filter, whatever generated it. Also forbidden by design-system §8.1: "glow is
   *atmospheric and has a position*."
2. **A perfectly smooth terminator arc.** Second loudest. Fixed with relief bias + a one-tap
   terrain shadow (§3).
3. **A perfectly smooth sphere.** Any body with no surface variation at pixel scale reads as
   a gradient ball. Three noise scales minimum: continental, feature, and a very
   high-frequency regolith layer (`fbm(p * 34.0, 3) * 0.016`) whose only job is to keep the
   terminator from being clean.
4. **Purple-cyan gradients / rainbow sweeps.** Structurally impossible here if the shader
   only ever receives three tokens plus the canvas. Enforce it: no literal colour constants
   in the fragment shader except the neutral sun tint and the tiny warm terminator bias.
   Grep for `vec3(0.` in any colour position during review.
5. **Lens flares, starbursts, anamorphic streaks.** There is no lens in this world. None.
6. **Over-saturated albedo.** Rock is not a gemstone. The desaturation step (§3) is
   load-bearing, and using `deep` directly as an albedo produced a bruise.
7. **A blue-marble Earth.** Continents + white swirling clouds + specular ocean is the most
   generated image in existence. Each world's §2.5 concept already prescribes something
   else; follow it.
8. **Symmetric composition.** Body dead-centre is a stock render. §6.1 asks for asymmetric.
9. **Perfect circular craters on a regular lattice.** Voronoi with every cell filled gives a
   golf ball. Leave most cells empty and vary radius per cell.
10. **A visible lat/long lattice.** Caused by 2D noise on spherical UVs, or by Hermite
    instead of quintic interpolation. §3 covers both.

### WebGL mistakes

**Leaking contexts on unmount.** The §6 measurement makes this concrete: contexts are a
budget of 16 (8 on Android), and exceeding it silently kills your *oldest* canvas — which
in a SPA is whatever the user has been looking at longest. Every mount must have a matching
teardown:

```js
const dispose = () => {
  stop();                                          // cancelAnimationFrame FIRST
  io.disconnect();
  document.removeEventListener('visibilitychange', onVis);
  canvas.removeEventListener('webglcontextlost', onLost);
  gl.bindVertexArray(null);
  gl.deleteVertexArray(vao);
  gl.deleteProgram(prog);                          // shaders already deleted post-link
  gl.getExtension('WEBGL_lose_context')?.loseContext();   // the only way to free it NOW
};
```

`WEBGL_lose_context.loseContext()` is the important line. Dropping the JS reference does
*not* promptly free the context — it waits for GC, and in a route-heavy SPA you will exceed
16 long before GC runs.

Other mistakes, in rough order of likelihood:

- **Not cancelling rAF before teardown.** A pending callback fires against a deleted
  program. Cancel first, then delete.
- **Not handling `webglcontextlost`.** It *will* fire — on tab backgrounding, GPU driver
  reset, and (per §6) when some other part of the app opens too many contexts. Without
  `e.preventDefault()` in the handler the context can never be restored. Handle both events:
  ```js
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', () => { rebuildProgram(); start(); });
  ```
- **Deleting shaders before link, or never.** `gl.deleteShader()` after a successful
  `linkProgram` is correct and is a real leak if omitted.
- **Recreating the context on every prop change.** Put `world` in the effect deps and swap
  *uniforms*, not the context.
- **Calling `getUniformLocation` in the render loop.** It is a string lookup. Cache once.
- **An unused uniform.** The compiler strips it, `getUniformLocation` returns `null`, and
  the subsequent `uniform1f` throws `INVALID_OPERATION`. The `webgl-pitfalls` technique file
  flags this explicitly and it bites during development when you comment out one line of
  shader.
- **Resizing by setting `canvas.width` every frame.** Reallocates the backing store. Guard
  with an equality check (the prototype's `resize()` does).
- **`preserveDrawingBuffer: true`.** Forces a copy every frame. Only needed for
  `toDataURL`, which the poster path should do once, not continuously.
- **Missing dithering.** An 8-bit framebuffer over a large dark gradient bands visibly. A
  Bayer offset of `1/255` costs nothing and removes it.

---

## 9. The prototype

**Location:** `/private/tmp/loxe-planet/index.html` (single self-contained file, 22.6 KB).
**Screenshot:** `/private/tmp/loxe-planet/planet.png`
Also `/private/tmp/loxe-planet/planet-alt018.png` and `planet-alt050.png` at altitude 0.18
and 0.50.

Japanese world tokens exactly as specified — `atmos #d3c7ff`, `mark #866ec8`, `deep #321e5c`
— on the Night canvas `#0d1226`. No image assets, no textures, no external dependencies.
Serve it over HTTP (`node server.mjs` in that directory) rather than `file://`.

### Iteration log

Four rendered iterations, each screenshotted and read back:

1. **Broken.** The `iSphere` miss-sentinel bug drew the surface across the whole sky.
   Voronoi ejecta clipped against the search boundary and drew polygonal edges. Grossly
   over-saturated.
2. **Recognisably a moon.** Bug fixed, craters legible, maria present. But: a uniform white
   halo ringing the entire disc, and an almost invisible terminator because the sun was
   front-lit (`sunDir.z = +0.36`).
3. **Halo fixed, terminator present, badly underexposed.** Maria crushed to black — using
   `--world-ja-deep` directly as an albedo.
4. **Current.** Exposure and albedo range corrected, relief amplitude reduced from 0.55 to
   0.34, ragged terminator via relief bias + one-tap terrain shadow.

### Honest critique of the current image

**What works.** It reads as a body with a history rather than a textured ball. The crater
population is convincing at three scales, and the profile — dark floor, bright rim, faint
ejecta — is doing most of that work. The maria have irregular, lobed coastlines that could
not come from thresholded FBM alone, and suppressing craters inside them makes the two
terrains feel like different ages of the same surface. The terminator is genuinely torn:
rims stay lit past the line and floors go dark before it. The night side retains legible
relief rather than going black, which satisfies §5.3. The limb glow is directional and
chromatic. The altitude response is real — at 0.18 the stars are gone, the haze veils the
disc and the rim is muted, so the body is **lit by the rating rather than merely placed
near it**, which was the actual requirement.

**What still falls short.**

- **The maria/highland boundary shows faint rectilinear structure** in the mid-left of the
  lit hemisphere. That is the value-noise cubic lattice surviving the ridged FBM's `abs()`,
  amplified by the normal perturbation. Quintic interpolation reduced it but did not
  eliminate it. Real fix: gradient (Perlin/simplex) noise instead of value noise for the
  ridged layer, or a second domain-warp pass on the highland field. I did not do it because
  it costs another FBM evaluation and I wanted the honest performance numbers first.
- **The overall value range is still a little compressed and cool.** The lit hemisphere sits
  around 55-65% luminance where a "vast pale moon" probably wants 70-80% with more
  separation between highland and mare. This is a grading pass, not a structural problem.
- **The atmospheric limb is arguably too subtle now.** I over-corrected from the halo. It
  reads correctly at full size but nearly disappears at orrery-thumbnail scale, where the
  body is 260px. It likely needs to scale with apparent size.
- **Rotation is untested visually.** All screenshots are single frames at `iTime = 18`. I
  could not run an animated loop because the automation tab reports
  `visibilityState: "hidden"`, which suspends rAF entirely (§4). Temporal artifacts —
  crater shimmer as the surface rotates through the noise field, aliasing on the
  high-frequency regolith layer — are **unverified and are the most likely remaining
  problem.** The regolith term at `fbm(p * 34.0)` is well above pixel Nyquist at thumbnail
  size and will almost certainly crawl. Mitigation is in the skill
  (`procedural-noise` "Preventing Aliasing": LOD-based octave count from `fwidth`), and it
  should be the first thing added.
- **Only one world tested.** The palette logic (especially the desaturation constant and the
  `mix(uDeep, uMark, 0.52)` mare colour) is tuned to Japanese periwinkle. Spanish
  (`#FFBB5F`, and §2.5 rule 4 requires its disc be rendered white-hot) and German (a dark
  world with a bright edge-on ring) will need per-world parameters, not just per-world hues.
- **No cloud sea.** The Japanese concept is "a vast pale moon low over a **sea of cloud**."
  The prototype renders only the moon. The cloud deck is `SkyLayer` layer 4's job and the
  two have not been composited together.

---

## 10. Confidence and gaps

### High confidence — measured on this machine today

- Bundle sizes for three 0.185.1 / ogl 1.0.11 / raw WebGL2 (§1).
- `getComputedStyle` and `computedStyleMap` return interpolated values of a registered
  `@property`; derived unregistered `calc()` properties do not resolve (§2).
- Read costs: 0.16-0.22 µs clean, ~8 µs after a style write, and linear scaling with
  inheriting subtree size up to 1.7 ms at 3000 nodes (§2).
- Chrome force-loses the oldest contexts at 16, `getContext` never returns null, and the
  page's own hero context is a valid casualty (§6).
- GPU frame cost on Apple M4 across seven resolutions (§4).
- rAF and CSS transitions are fully suspended in a hidden document (§4).

### High confidence — cited to primary sources

- Per-engine context limits and the exact overflow warning strings (§6).
- Custom-property animations are not composited in Blink without a paint worklet (§2).
- `computedStyleMap` is not cheaper than `getComputedStyle` in Blink (§2).
- `deviceMemory` is Chromium-only; `hardwareConcurrency` is clamped in WebKit and in
  fingerprint-resistant Firefox (§5).
- rAF suspension while hidden is spec-mandated via "filter non-renderable documents" (§4).

### Medium confidence — my judgment, flagged

- The 8-20× mid-range-Android scaling factor in §4. **This is the weakest number in the
  document.** Every mobile conclusion depends on it and none of it is measured.
- The recommendation to move the tween into JS. It is well-supported by the composited-animation
  finding, but it changes an existing, working, deliberately-designed system, and the team
  that wrote `altitude-provider.tsx` may have constraints I cannot see.
- The moon-rather-than-planet reading of the Japanese world. It follows §2.5's text closely,
  but it is an interpretation.
- The specific shader constants (desaturation 0.60, relief 0.34, scattering 11.0). Tuned by
  eye across four iterations on one display, not validated against the design system's
  contrast requirements.

### Unverified — do not treat as fact

- **Android's 8-context limit was not measured**, only cited from Chromium source. I tested
  on desktop.
- **Temporal behaviour of the shader.** No animated frame was ever observed (§9). Rotation
  shimmer and high-frequency aliasing are likely and unmeasured.
- **Real-device performance.** No physical mobile device was used at any point.
- Whether `getComputedStyle` returns the compositor's live value in the paint-worklet
  composited case. No authoritative source found; irrelevant unless you adopt paint worklets.
- Firefox's behaviour on LRU context eviction with `preventDefault()`.
- Whether the analytic single-pass multi-sphere approach (§6) holds its frame budget at
  N=7 with depth-of-field. Untested; the prototype renders one body.

### Recommended next steps, in order

1. Measure the shader on a real mid-tier Android with `EXT_disjoint_timer_query_webgl2`.
   This gates every performance decision in §4.
2. Run the prototype animated and look for crawl on the regolith layer; add `fwidth`-based
   octave LOD if it crawls.
3. Prototype the second world (Spanish — hardest, per §2.5 rule 4) to find which constants
   must become per-world parameters.
4. Decide the tween ownership question (§2) before writing any production component, because
   it determines the component's entire interface.
