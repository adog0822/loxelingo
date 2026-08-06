# LoxeLingo Design System

**Date:** 2026-08-05
**Status:** Design discovery output. Buildable spec, not implementation.
**Inputs:** `docs/superpowers/specs/2026-08-05-competitive-language-platform-design.md`, `docs/superpowers/specs/2026-08-05-learning-engine-and-social-design.md`, `docs/research/02-ml-and-naming.md`
**ICP:** US Gen Z. **Register:** rank as dignity. **Anti-reference:** Duolingo.

---

## 0. Design read

> Reading this as: a competitive ladder product for identity-motivated US Gen Z, with an atmospheric-scale language that treats rating as physical altitude and mastery as a night sky, leaning toward a dark-first custom token system on Tailwind v4 + Radix primitives, with heavy custom work on three signature surfaces (orrery, sky, constellation) and disciplined restraint everywhere else.

Dials: `DESIGN_VARIANCE 7` · `MOTION_INTENSITY 5` (world surfaces) / `1` (match surfaces) · `VISUAL_DENSITY 3` (world, verdict, constellation) / `6` (ladder, profile tables).

The split dial is deliberate and is the single most important structural decision in this system. **The app has two zones.** The *world* is vast, quiet, slow, and atmospheric. The *instrument* (match, ladder, verdict tables) is precise, dense, fast, and completely still. A product that is atmospheric everywhere is a screensaver. A product that is instrument everywhere is a quiz app. The tension between the two is the brand.

---

## 1. Design principles

### 1.1 The number is a place you stand, not a badge you wear
Every rating is rendered simultaneously as a numeral and as an altitude. The sky behind the UI is a continuous function of the user's rating. You do not read your standing, you are standing in it. Consequence: no progress bars, no XP, no level-up popovers. The environment is the progress indicator. *(Derived from: impeccable's "one sentence of physical scene before choosing a theme"; frontend-design's "hero is a thesis".)*

### 1.2 Cold is the unknown, warm is what you earned
One accent, locked across the entire product: rose-gold. It appears only on things the user has earned, owns, or is about to act on. Everything not-yet-earned is cold indigo. This is the whole color strategy and it is enforceable mechanically: if a rose-gold pixel is not attached to something earned or actionable, it is a bug. *(Derived from: taste-design's Color Consistency Lock; impeccable's "committed" color strategy.)*

### 1.3 A world is a place, an accent is a state, and they never trade jobs
Each of the six languages owns a hue. That hue paints atmosphere: sky, horizon light, globe rim, the world's own typography chip. It **never** encodes correct/incorrect, win/loss, or data. Korean's world hue is a jade green; that green must never appear on a verdict. This rule is what makes six coexisting hues survivable in one product. *(Derived from: dataviz's "color follows the entity, never its rank"; ui-ux-pro-max `color-semantic`.)*

### 1.4 Loss is weather, not damage
The most emotionally load-bearing screen in the app is the one where you lost. It must read as *shown*, not *scolded*. Losing thickens the haze; it never breaks, cracks, drains, or flashes red. Peak altitude leaves a permanent horizon line. Win and loss share one layout, one type scale, one motion sequence. A loss screen that is structurally different from a win screen is a punishment screen. *(Derived from: frontend-design's "treat failure and emptiness as moments for direction, not mood"; spec §4 "pull, not push".)*

### 1.5 Under time pressure, nothing moves except the clock
The FORGE and RECALL ladders exist because automaticity requires speed pressure. Any ambient motion during a timed prompt is a tax on the pedagogy. The world visibly freezes when a match starts and exhales when the verdict lands. Designed stillness is what makes the verdict's motion land. *(Derived from: ui-ux-pro-max `excessive-motion` and `no-blocking-animation`; impeccable's "motion should be intentional".)*

### 1.6 The lesson gets the largest type on the page
On the verdict screen the biggest element is not the rating delta and not the winner's name. It is the one sentence explaining why the better answer is better. The rating moves last, small, bottom-right. This is the product thesis expressed as a type scale. *(Derived from: frontend-design's "words are design material"; spec §1 "the opponent is the lesson".)*

### 1.7 Nothing on screen is a decoration pretending to be information
No eyebrows above every section. No `01 / 02 / 03` scaffolding. No fake precision. Every number rendered is a real quantity from the system: a rating, a rank, a count of stars, a timer, a head-to-head record, a date. Structural devices earn their place by carrying a rule the user must obey. The entire product ships **two** eyebrow-shaped elements: the match constraint line, and the band label under a rating. *(Derived from: impeccable's eyebrow and numbered-marker bans; design-taste-frontend §9.F.)*

---

## 2. Color system

### 2.1 Strategy
**Committed, dark-first, two themes that are both in-world.** The user's two reference images become the two themes:

- **Night** (default, dark): deep indigo, a giant planet on the horizon, a glowing river in a dark valley.
- **Dusk** (alternate, light): warm rose-gold dusk over a vertical megacity.

Dusk is a whole-app user preference, never a per-section flip (Page Theme Lock). The altitude metaphor survives both: in Night, haze is blue mist and thinning reveals stars; in Dusk, haze is warm dust and thinning reveals a clear rose sky and the sun's disc.

**Note on Dusk:** its canvas is `#F3D9C9`, a *saturated* warm dusk at OKLCH L 0.902 / C 0.036 / H 53.7. This is deliberately not a near-white cream. It is derived from the brand's own rose-gold hue, not from default-warmth, and no token in this system is named `--paper`, `--cream`, `--sand`, or `--bone`.

### 2.2 Contrast method
Every ratio below was computed (WCAG 2.x relative luminance) against the theme canvas, not estimated. Categorical palettes were validated with the `dataviz` skill's `validate_palette.js` under `--pairs all` (lightness band, chroma floor, CVD separation, normal-vision floor, surface contrast).

### 2.3 Night: indigo base ramp

| Token | Hex | Contrast on `#0D1226` | Role |
|---|---|---|---|
| `--ink-000` | `#05060F` | — | Void. Sky at Meridian band. Focus-ring offset. |
| `--ink-050` | `#090C1B` | — | Sky top gradient stop. |
| `--ink-100` | `#0D1226` | (canvas) | **App canvas.** Sky bottom stop at low altitude. |
| `--ink-200` | `#141A33` | 1.08 | Surface 1. Input beds, list beds. |
| `--ink-300` | `#1C2442` | 1.22 | Surface 2. Panels, sheets, the verdict answer cards. |
| `--ink-400` | `#283154` | 1.46 | **Decorative hairline only.** Fails 3:1; never a functional boundary. |
| `--ink-500` | `#3A4570` | 2.00 | Disabled fill, inactive track. |
| `--ink-600` | `#5A6796` | 3.37 | **Functional border** (input outline, selected edge). Large text ≥18px. Disabled label. |
| `--ink-650` | `#6F7CA8` | 4.53 | **Text tertiary.** Passes AA body. Match constraint line, metadata. |
| `--ink-700` | `#8792BC` | 6.07 | **Text secondary.** |
| `--ink-800` | `#B9C1DC` | 10.36 | Text on dim surfaces, icon default. |
| `--ink-900` | `#E8EBF7` | 15.60 | **Text primary.** The verdict sentence. |

**Rule:** `--ink-400` and `--ink-600` are not interchangeable. A hairline that separates rows is decorative (`400`). A border that tells you where an input begins is functional (`600`, 3:1 minimum per WCAG 1.4.11).

### 2.4 The earned-light ramp (rose-gold)

| Token | Hex | Contrast on `#0D1226` | Role |
|---|---|---|---|
| `--gold-100` | `#FFF1E8` | 16.79 | Star core. Highest-emphasis earned numeral. |
| `--gold-200` | `#FBD9C4` | 13.98 | Star field default. Rim light. |
| `--gold-300` | `#F5BCA0` | 11.12 | Hover on gold text. |
| `--gold-400` | `#EC9E7E` | 8.62 | **Accent text, icons, focus ring, rating delta up.** |
| `--gold-500` | `#DD7F62` | 6.44 | **Primary fill** (CTA). Label on it: `--ink-100`, 6.44:1. |
| `--gold-600` | `#BE5F4C` | 4.36 | Pressed fill. Large text only on Night. |
| `--gold-700` | `#8E4239` | 2.64 (5.21 on Dusk) | **Dusk accent text/fill.** |
| `--gold-800` | `#5C2A28` | — | Gold border at low emphasis. |
| `--gold-900` | `#2E1A1E` | — | Tint bed under earned rows (e.g. your own ladder row). Dusk primary ink (12.15:1). |

### 2.5 Six world identities

Each world owns a hue, an atmosphere, a celestial body, and a terrain. Steps: `atmos` (large glow, display type on Night), `mark` (chip, rim, 2px stroke), `deep` (tint bed, horizon), `dusk` (ink on the Dusk canvas).

| World | Concept | Hue | `atmos` | on Night | `mark` | on Night | `deep` | `dusk` | on Dusk |
|---|---|---|---|---|---|---|---|---|---|
| **Japanese** | The Cloud Sea. A vast pale moon low over a sea of cloud, cedar ridges below. | 294 | `#D3C7FF` | 11.83 | `#866EC8` | 4.49 | `#321E5C` | `#5D4796` | 5.55 |
| **Korean** | The Celadon Coast. Jade sea-light, black basalt, an aurora ribbon. | 166 | `#62D7AB` | 10.45 | `#00A36F` | 5.72 | `#003B23` | `#007044` | 4.58 |
| **Mandarin** | The Ink Valley. A ringed pale giant over karst spires and a glowing river. | 196 | `#56DBDC` | 11.10 | `#009CA0` | 5.53 | `#003E43` | `#006F74` | 4.42 |
| **Spanish** | The Long Sun. An enormous low sun, dry gold air, terraced plain. | 72 | `#FFBB5F` | 11.07 | `#C16600` | 4.57 | `#531A00` | `#8F3F00` | 5.41 |
| **French** | The Salt Flats. A small brilliant sun with a halo over still water. | 322 | `#E7A5F1` | 9.76 | `#AF56BD` | 4.32 | `#4A0953` | `#802E8D` | 5.78 |
| **German** | The Standing Stones. A dark world with a bright edge-on ring, granite and snow. | 244 | `#67B2EE` | 8.11 | `#0087DA` | 4.84 | `#002E69` | `#005CA7` | 5.04 |

**Rules that make six hues survivable:**
1. World hue never encodes data, state, correctness, or rank. It encodes place.
2. World identity is always carried by **native script + Latin name + globe art + hue**, never hue alone. Two worlds are never adjacent in a way that requires color-only discrimination.
3. `mark` steps sit between 4.3 and 5.7 on Night. Use `atmos` for anything that is text below 18px.
4. Spanish's `atmos` (`#FFBB5F`) is the closest world hue to rose-gold. In the Spanish world, the earned accent shifts one step lighter to `--gold-300` to keep separation, and the Spanish sun's disc is rendered white-hot rather than gold.
5. Korean's hue is a jade green. Green never appears on any feedback, verdict, or state surface, in any world. This is enforced by having no green in the semantic set at all.

### 2.6 Semantic colors

| Token | Night | Contrast | Dusk | Meaning |
|---|---|---|---|---|
| `--verdict-win` | `#EC9E7E` (gold-400) | 8.62 | `#8E4239` | You won. **Not green.** Winning gives you light. |
| `--verdict-loss` | `#6E86B8` | 5.09 | `#485B7D` (5.08) | You lost. A cool slate: distance and atmosphere, not damage. **Not red.** |
| `--verdict-draw` | `#8792BC` (ink-700) | 6.07 | `#3A4570` (6.88) | Drawn or unresolved. |
| `--signal-error` | `#E8757A` | 6.41 | `#A32F35` | **System failure only.** Network, upload, auth. Never a wrong answer. |
| `--signal-warn` | `#E5B769` | 9.99 | `#7A5200` | Integrity notice, timer under 20%, unsaved draft. |
| `--signal-info` | `#8792BC` | 6.07 | `#3A4570` | Neutral system message. |

**The critical separation:** a wrong answer is not an error. A lost match is not an error. Red is reserved for the system being broken, and appears perhaps four times in the product. This single decision does most of the work of not feeling punishing.

**Loss depiction ladder** (in order of preference, use the earliest that fits):
1. The better answer, shown side by side. No color needed.
2. A 2px bottom rule under the differing span (gold under theirs, `--verdict-loss` under yours).
3. The delta numeral in `--verdict-loss`.
4. Haze thickening, on next world entry.
Never: strikethrough, red squiggle, shake, X icon, sad face, sound.

### 2.7 Chart series (validated)

World hues do not carry data. Charts use a dedicated 3-series palette, validated all-pairs.

| Slot | Night | Dusk | Use |
|---|---|---|---|
| `--series-1` | `#DD6D45` | `#CC572A` | You. |
| `--series-2` | `#005FC6` | `#0058C4` | Opponent / field median. |
| `--series-3` | `#00A0A3` | `#00899D` | Reference line (peak, band floor). |

```
Night  #dd6d45,#005fc6,#00a0a3  --mode dark  --surface #0D1226  --pairs all  → ALL CHECKS PASS
Dusk   #cc572a,#0058c4,#00899d  --mode light --surface #F3D9C9  --pairs all  → ALL CHECKS PASS
```

Four or more series is not permitted. Cross-world comparison uses **small multiples**: one sparkline per world, each direct-labeled with the world name and a solid `mark` chip. This is the composite-encoding path from the dataviz skill and it removes the need for a CVD-safe six-hue palette (which does not exist at these lightnesses; verified).

### 2.8 Utility

| Token | Value | Note |
|---|---|---|
| `--focus` | `#EC9E7E` | 2px ring + 2px `--ink-000` offset ring, so it reads on both dark surfaces and the bright celestial body. |
| `--scrim` | `rgb(5 6 15 / .72)` | Modal/sheet backdrop. 72% is required for legibility over a bright sky. |
| `--selection` | `rgb(221 127 98 / .28)` | |
| `--grain` | SVG `feTurbulence`, opacity `.035` | Fixed, `pointer-events: none`, `z-index: var(--z-grain)`. Never on a scrolling container. |
| `--hairline` | `rgb(255 255 255 / .06)` | Inset top highlight on raised surfaces. Replaces drop shadows on dark. |

**No drop shadows on Night.** Depth comes from (a) surface lightness steps, (b) hairlines at varying opacity, (c) depth-of-field blur on the sky behind, (d) the inset top highlight. One shadow token exists for the Dusk theme only: `0 24px 48px -20px rgb(46 26 30 / .28)`.

---

## 3. Typography

### 3.1 Stack

CJK is mandatory and non-negotiable: Japanese, Korean, and Mandarin render at up to 176px in FORGE. Latin display faces cannot do this, so per-script display faces are part of the system, and that is a feature. Each world's script is set in a face native to that script, which reinforces "you have entered a place."

| Role | Licensed (recommended) | Free path | Fallback |
|---|---|---|---|
| Display (Latin) | **Söhne Breit** (Klim) | **Clash Display** (Fontshare) | `ui-sans-serif, system-ui` |
| Text / UI (Latin) | **Söhne** (Klim) | **Satoshi** (Fontshare) | `ui-sans-serif, system-ui` |
| Data / mono | **Söhne Mono** (Klim) | **Geist Mono** (Vercel) | `ui-monospace, SFMono-Regular` |
| Japanese display | **Zen Kaku Gothic New** 500/700 (OFL) | same | `Hiragino Kaku Gothic ProN, Yu Gothic` |
| Japanese body | **Noto Sans JP** variable (OFL) | same | `Hiragino Sans` |
| Japanese immersion | **Shippori Mincho** (OFL) | same | `Yu Mincho, serif` |
| Korean display + body | **Pretendard** variable (OFL) | same | `Apple SD Gothic Neo, Malgun Gothic` |
| Korean immersion | **Gowun Batang** (OFL) | same | `Apple SD Gothic Neo, serif` |
| Mandarin (SC) display | **Alibaba PuHuiTi 3.0** (free commercial) | same | `Noto Sans SC` |
| Mandarin (SC) body | **Noto Sans SC** variable (OFL) | same | `PingFang SC, Microsoft YaHei` |
| Mandarin immersion | **LXGW WenKai** (OFL) | same | `Kaiti SC, serif` |
| Traditional (post-launch) | **Noto Sans TC** | same | `PingFang TC` |

Explicitly rejected: **Inter** (the LLM default), **Fraunces** and **Instrument Serif** (the two LLM display serifs), any serif as the primary display face. Söhne Breit is chosen because it is wide, engineered, low-contrast, and reads as instrumentation at small sizes and as scale at large sizes, which is exactly the two-zone requirement.

### 3.2 Loading strategy

- Latin faces: self-hosted, `font-display: swap`, preload display + text weights only.
- CJK faces: **loaded per world, lazily, on world entry.** Never all six at once. Subset by `unicode-range`. A user in the Spanish world downloads zero CJK bytes.
- FORGE's hero glyph is the LCP element in that view; preload the world's display face on the world-entry route.
- Never synthesize bold on CJK. Load the real weight or do not use it.

### 3.3 Script rendering rules (load-bearing, not cosmetic)

1. **`lang` is mandatory on every element containing CJK.** `lang="ja"` vs `lang="zh-Hans"` selects different glyph shapes for shared codepoints (直, 骨, 込 etc.). Getting this wrong renders Chinese-form kanji to a Japanese learner, which is a correctness bug, not a styling bug.
2. **Never apply negative `letter-spacing` to CJK.** Display tracking of `-0.03em` applies to Latin only, via a `:lang()` scoped rule.
3. **Line height:** Latin body `1.55`; CJK body `1.8`. CJK display `1.15`; Latin display `1.05`.
4. **Line breaking:** `line-break: strict; word-break: normal; overflow-wrap: normal` for CJK. Never `break-all`.
5. **Furigana:** native `<ruby>` with `ruby-position: over`, ruby text at `0.42em`, `--ink-700`. Toggleable per user; default on below rating 1300, off above.
6. **Punctuation:** enable `font-feature-settings: "palt" 1` for Japanese body text to fix full-width punctuation gaps. Not on display sizes, where full-width spacing is correct.
7. **Hangul** does not need `palt` and must not receive it.

### 3.4 Type scale

Fluid, `clamp()`. Display max capped at 96px (6rem) except the FORGE hero glyph, which is a special case and is a single character.

| Token | Size | Line | Tracking | Weight | Use |
|---|---|---|---|---|---|
| `--t-glyph` | `clamp(5rem, 18vw, 11rem)` | 1.0 | 0 | 500 | FORGE hero character. CJK only. |
| `--t-display-1` | `clamp(3.25rem, 8vw, 6rem)` | 1.02 | -0.035em | 600 | Rating hero on profile. World name on entry. |
| `--t-display-2` | `clamp(2.5rem, 5.5vw, 3.75rem)` | 1.06 | -0.03em | 600 | World name in orrery. Band crossing moment. |
| `--t-display-3` | `clamp(1.875rem, 3.5vw, 2.5rem)` | 1.12 | -0.025em | 500 | **The verdict sentence.** Section leads. |
| `--t-title-1` | `1.5rem` | 1.25 | -0.015em | 500 | Panel titles. |
| `--t-title-2` | `1.25rem` | 1.3 | -0.01em | 500 | Sub-panel, rival name. |
| `--t-title-3` | `1.0625rem` | 1.4 | 0 | 500 | List headings, handle in ladder row. |
| `--t-body-lg` | `1.125rem` | 1.6 | 0 | 400 | DUEL brief text. Ask threads. |
| `--t-body` | `1rem` | 1.55 | 0 | 400 | Default. Mobile minimum. |
| `--t-body-sm` | `0.875rem` | 1.5 | 0 | 400 | Metadata, timestamps. Never primary content. |
| `--t-label` | `0.8125rem` | 1.3 | `0.06em` | 500 | The two permitted eyebrow elements only. |
| `--t-num-hero` | `clamp(2.75rem, 6vw, 4.5rem)` | 1.0 | -0.02em | 600 | Rating, display face, `tnum lnum`. |
| `--t-num` | `1.0625rem` | 1.2 | 0 | 500 | Inline rating, delta, `tnum lnum`. |
| `--t-mono` | `0.8125rem` | 1.4 | `0.01em` | 400 | Timers, rank, match IDs, replay counts. |

### 3.5 Numerals

Every numeral in the product carries `font-variant-numeric: tabular-nums lining-nums`. Non-negotiable: a rating that shifts width while counting is a layout bug and a credibility bug.

- **Ratings and ranks** use the *display* face with `tnum`, not mono. Mono ratings read as terminal output; display ratings read as a score. Authority comes from width, weight, and tight tracking.
- **Mono is reserved** for timers, match IDs, replay counters, and the ladder's rank column. That is the whole list.
- Ratings are rendered with a thin-space thousands separator (`1 588`), not a comma, and localized.
- Delta is always signed and always adjacent: `1 588 <span>+14</span>`.

---

## 4. Motion

### 4.1 Principles

1. **The world breathes; the instrument does not.** Ambient motion lives only in the sky layer (haze drift, star parallax, globe rotation). No card, list, button, or panel has a perpetual loop.
2. **Nothing animates during a timed prompt.** The clock depletes. That is all. The world visibly freezes on match start.
3. **The verdict is the only choreographed sequence in the product.** It gets five timed beats. Everything else is a single transition.
4. **Altitude changes are camera moves, not UI transitions.** They use a longer, heavier easing and they never happen in the moment of loss.
5. **Motion is never the only channel.** Every animated state change also changes a static property (color, weight, position, presence).

### 4.2 Tokens

```
--ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1)      /* default entrance */
--ease-out-quint:  cubic-bezier(0.22, 1, 0.36, 1)     /* press release, hover */
--ease-atmos:      cubic-bezier(0.65, 0, 0.35, 1)     /* camera, altitude, world entry */
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1)       /* utilitarian */

--dur-micro:       120ms   /* press, toggle, checkbox */
--dur-fast:        180ms   /* hover, tooltip, focus ring */
--dur-base:        260ms   /* tab, popover, panel */
--dur-slow:        420ms   /* sheet, dialog, route */
--dur-beat:        700ms   /* one verdict beat, rating count-up */
--dur-cinema:     1200ms   /* world entry dive, band crossing */
--dur-ignite:      900ms   /* star ignition */
--dur-hold:       1600ms   /* the pause after ignition, before dismissal is allowed */
```

Exit durations are 65% of enter. Stagger is 40ms per item, capped at 8 items (item 9+ appears with item 8).

### 4.3 What animates

| Element | Property | Duration / easing |
|---|---|---|
| Haze drift (sky) | `transform: translate3d` on two offset gradient layers | 34s and 51s, linear, infinite |
| Star field parallax | `translate3d`, max 6px, pointer-driven | continuous, motion-value driven, never React state |
| Globe rotation (orrery) | `rotateY` | 90s linear, infinite |
| World entry | camera dive: globe `scale` 1 → 8, sky crossfade, world name `opacity` + `translateY(24px)` | `--dur-cinema`, `--ease-atmos` |
| Altitude change | `--altitude` custom property interpolated; drives haze opacity, body scale, star opacity | `--dur-cinema`, `--ease-atmos` |
| Star ignition | `opacity` 0 → 1 with a `scale` 0.4 → 1 on the star's glow layer only | `--dur-ignite`, `--ease-out-expo`, then `--dur-hold` |
| Rating count-up | numeric interpolation, `tnum` so width is fixed | `--dur-beat`, `--ease-out-expo` |
| Verdict beats | `opacity` + `translateY(16px)` per beat | `--dur-beat` each, offset 700ms |
| Button press | `scale(0.985)` | `--dur-micro`, `--ease-out-quint` |
| Sheet / dialog | `translateY` from trigger side + scrim `opacity` | `--dur-slow`, `--ease-out-expo` |
| Timer | `transform: scaleX` on a 2px bar, driven by `requestAnimationFrame` writing one CSS custom property | linear, continuous |

### 4.4 What must never animate

- The timer's numerals. No pulse, no scale, no color flash. The bar depletes; at 5s a mono numeral appears, statically.
- The rating number while a match is live.
- The sky, during a timed prompt.
- The sky *downward*, on the verdict screen. Altitude loss is applied silently and is visible on the next world entry.
- The constellation, on load. It fills once, on earning. Otherwise it is a still image.
- Any `width`, `height`, `top`, `left`, `margin`, `padding`.
- Star twinkle. Twinkling stars are kitsch and there is no per-star idle animation anywhere.
- Any element on the ladder or profile on scroll. Those surfaces are static documents.

### 4.5 Reduced motion

`@media (prefers-reduced-motion: reduce)`:

| Normally | Becomes |
|---|---|
| Haze drift, star parallax, globe rotation | Static. The sky is a still gradient. |
| World entry dive | 180ms crossfade. |
| Altitude change | Instant state swap. |
| Verdict beats | Same five beats, same 700ms offsets, **crossfade instead of translate.** The emotional pacing is preserved; only the movement is removed. This is deliberate: collapsing the verdict to a single instant would remove the design's most important function. |
| Star ignition | `opacity` fade over `--dur-ignite`, no scale, `--dur-hold` preserved. |
| Rating count-up | Final value, immediately. |
| Stagger | All at once. |

`@media (prefers-reduced-transparency: reduce)`: the two glass surfaces (match HUD, sheet over sky) become solid `--ink-300`.

`@media (prefers-contrast: more)`: hairlines step from `--ink-400` to `--ink-600`; the grain overlay is removed; haze opacity is capped at 0.4 regardless of altitude so text never sits over dense atmosphere.

---

## 5. The altitude system

### 5.1 Mechanism

A single scalar drives everything.

```
--altitude: clamp(0, (rating - 700) / 1500, 1)
```

Every visual quantity is a function of `--altitude`, set as a CSS custom property on the world root by an `AltitudeProvider`:

```
--haze:        calc(0.94 - (var(--altitude) * 0.92))
--body-scale:  calc(0.04 + (var(--altitude) * 0.68))   /* fraction of viewport height */
--body-y:      calc(112% - (var(--altitude) * 74%))     /* below horizon → filling the sky */
--star-op:     calc(var(--altitude) * 1.0)
--rim:         calc(max(0, var(--altitude) - 0.25) * 1.1)
--deck-y:      calc(96% - (var(--altitude) * 62%))      /* the cloud deck */
```

**Continuous scalar, discrete named thresholds.** Continuous means every single match visibly moves the sky, so progress is always felt. Discrete means the standing is always sayable, which is the point of the brand. This is the mechanism behind spec constraint 6 (first threshold crossings are the highest-leverage retention events): the crossings are frequent early and spaced later.

### 5.2 Bands

| # | Band | Rating | Haze | Celestial body | Stars | Cloud deck | UI change |
|---|---|---|---|---|---|---|---|
| 1 | **Valley Floor** | < 900 | 0.92 | Not visible. | 0 | Above you, as ceiling | Sky is `--ink-100` → `--ink-050`. No rim light. The only warm light in frame is the river below and your own earned items. |
| 2 | **Treeline** | 900–1099 | 0.76 | A diffuse glow, no disc. | 3–5, faint, overhead | Still above | Horizon resolves as a soft band. First `--gold-800` edge on surfaces. |
| 3 | **Ridge** | 1100–1299 | 0.58 | Soft disc, low, 8% of frame. | Upper third | At your level | **Rose-gold rim light appears on UI edges for the first time.** Surfaces gain a 1px `--gold-800` top edge. |
| 4 | **Above the Deck** | 1300–1549 | 0.38 | 18% of frame, clear of the horizon. | Full field | **Below you.** | The single biggest visual moment in the ladder, placed at the most-reached milestone. Full-screen crossing sequence. Permanent horizon line is drawn at this altitude. |
| 5 | **The Long Light** | 1550–1799 | 0.22 | 30% of frame. Atmospheric rays. | Dense | A floor of light, far below | Rim light becomes directional. Surfaces cast a faint gradient away from the body. |
| 6 | **Exosphere** | 1800–2099 | 0.10 | 48% of frame, fills the upper half. Terminator visible. | Hard and numerous | Barely visible | Sky is `--ink-000`. Type gains 1 weight step in headers (500 → 600). |
| 7 | **Meridian** | 2100+ | 0.02 | 70% of frame. You are effectively in orbit. | Void-black field | Gone | Light is hard and directional; UI edges catch it on one side only. Season cosmetic unlocks a visible ring or aurora. |

Band boundaries at 900 / 1100 / 1300 / 1550 / 1800 / 2100: gaps of 200, 200, 250, 250, 300. Deliberately tight early.

### 5.3 Descent

- Rating loss lowers `--altitude`. Haze thickens. Nothing breaks.
- **Peak altitude is permanent.** Once a band has been reached in a world, a 1px `--gold-700` horizon rule is drawn at that altitude forever, labeled with the band name and the date. You can be below your own line; you cannot lose the line.
- Descent is **never animated in the moment of loss.** It is applied on the next world entry, as part of the entry dive, where it reads as arrival rather than punishment.
- Below band 4, the celestial body still renders once you have ever crossed band 4, at reduced opacity through the haze. You never return to total darkness.

### 5.4 Per-ladder altitude

Ratings are independent per world per ladder (DUEL / RECALL / FORGE). The sky renders the **maximum** of the three for that world, because the sky is the world's, not the ladder's. Individual ladder ratings appear as three numerals in the world HUD. This means tilting in DUEL does not visibly darken your sky, which is the visual expression of the spec's most important retention mechanism.

---

## 6. Key screen compositions

### 6.1 World select: "The Orrery"

**Layout.** Not a grid of six cards. A horizontal orbital track, viewed edge-on.

- One world is centered and large: a slowly rotating sphere occupying ~46vh, with its own atmosphere and celestial body rendered behind it. Default selection: the world with an unanswered match; failing that, last played.
- The other five recede on an arc left and right, at decreasing scale with increasing depth-of-field blur. Peers 3+ steps away are silhouettes.
- Drag, arrow keys, or swipe rotates the orrery. The centered world snaps.
- The page is asymmetric: the orrery sits low and right, the type block sits left and above the horizon line.

**Hierarchy.**
1. The centered globe (the visual subject).
2. World name: **native script large, Latin small and above it.** `JAPANESE` at `--t-label` in `--ink-650`, then `日本` at `--t-display-2` in the world's `atmos`. The native script being larger is the whole thesis of "you enter a place."
3. Rating: `--t-num-hero`, `tnum`, `--gold-100`. Band name beneath at `--t-label` in `--gold-400`. This is one of only two permitted eyebrow-shaped elements.
4. One state line at `--t-body`: `Kenji answered. Your move.` or `No open matches.`
5. One primary CTA: `Enter`. Pill, `--gold-500` fill, `--ink-100` label. No secondary CTA.

**Unstarted worlds.** Globe is dark and haze-choked. No rating. Label shows native script only. CTA reads `Begin`. The absence of a number is the invitation; do not add a "Start learning!" badge.

**Motion.** Globes rotate at 90s. Star field parallaxes to pointer at 6px max. Nothing else.

**Mobile.** Single globe fills the frame. Swipe-snap carousel with two partially-visible neighbors and a 6-dot indicator. Type block moves below the globe. `min-h-[100dvh]`, never `h-screen`.

**Never.** Six identical tiles. Flag emoji or flag colors. A progress ring around each globe. A "streak" badge. Icons of any kind on this screen.

### 6.2 Match in progress: "The Prompt"

**Layout.** Single column, centered, `max-width: 62ch`. This is the one screen in the product that is deliberately centered: under time pressure, symmetry is legibility, and the message is the design.

Everything not the task is removed. No nav. No rating. No avatar. No world HUD.

**Anatomy, top to bottom:**
1. **Timer.** A 2px bar spanning the full viewport width at the very top, depleting left to right, `--gold-500`. At 20% remaining it becomes `--signal-warn`. At 5s a mono numeral appears at the right end, static. The bar never pulses.
2. **Constraint line.** One line, `--t-label`, `--ink-650`: `IN ます FORM` / `UNDER 20 WORDS` / `MUST USE 因为`. This is the second and last permitted eyebrow. It earns its place because it carries a rule the user must obey to score.
3. **The prompt.**
   - FORGE: the hero glyph at `--t-glyph`, in the world's display face, with correct `lang`, centered. Optional stroke-order overlay as a 1px `--ink-600` path.
   - DUEL: the brief at `--t-body-lg`, 62ch, `--ink-900`.
   - RECALL: a waveform of 2px `--gold-500` hairline bars that fill as playback proceeds, plus a replay affordance with a mono count (`2 replays left`). No autoplay without an explicit start.
4. **Input.** Borderless field on `--ink-200`, single bottom hairline at `--ink-600` that becomes `--gold-400` on focus. Label above at `--t-body-sm`, never placeholder-as-label. Word counter only when the constraint is a word count: mono, right-aligned, turns `--gold-400` when satisfied.
5. **One action.** `Submit`. `Cmd/Ctrl+Enter`.

**Background.** The world's sky at the user's altitude, with haze locked one step thicker than normal and **all ambient motion frozen.** The world holds its breath.

**Never.** Hearts. Lives. Energy. A combo counter. "Streak on fire." A mascot. A sound sting on keystroke. A shake on a wrong character. Any hover state that moves anything.

### 6.3 Post-match verdict: "The Verdict"

The most important screen in the product. You just lost. The job is to make you feel *shown*, not scolded, and to point your attention at the thing you can own.

**Structural rule: wins and losses share one layout, one type scale, one motion sequence.** Only the content of the verdict line and the sign of the delta differ. A loss screen that looks structurally different from a win screen is a punishment screen.

**Sequence** (each beat `--dur-beat`, offset 700ms, `--ease-out-expo`):

- **Beat 0 (0ms). The world exhales.** Haze returns to normal, ambient motion resumes. Nothing else changes. This is the release, and it is the only reason the frozen match screen was worth doing.
- **Beat 1 (400ms). The two answers.** Side by side, yours left, theirs right. **Equal width, equal weight, equal typography, equal surface (`--ink-300`).** Not a podium. Headers are just authorship: `You · 1 412` and `Haruki · 1 588`. The higher-rated answer is not visually elevated; its authority comes from being better, which the reader can see for themselves. These two panels are the *only* legitimate use of a card in the entire product, and they are siblings, never nested.
- **Beat 2 (1100ms). The verdict line.** One sentence at `--t-display-3` in `--ink-900`. The largest type on the screen. Not gold, not red. Example: *"Haruki chose 〜てしまった. You chose 〜た. The regret is the whole point of the sentence."* This is the comprehensible-input moment and it gets the type budget.
- **Beat 3 (1800ms). The diff.** The specific differing spans are marked in each answer with a 2px bottom rule: `--gold-400` under theirs (the better move), `--verdict-loss` under yours. Never strikethrough. Never a red squiggle. Requires a real token-level diff, not a string diff.
- **Beat 4 (2500ms). The rating.** Bottom right, `--t-num`: `1 412 → 1 398`, delta `-14` in `--verdict-loss`. Counts over `--dur-beat` with `tnum`. **The sky does not move.** Altitude settles on next entry.
- **Beat 5 (3200ms). Three exits, ranked by usefulness rather than by revenge.**
  1. `Add 〜てしまった to Trials` (primary, `--gold-500` fill)
  2. `Ask about this` (ghost)
  3. `Next match` (ghost)

  **Rematch is deliberately not primary.** The primary action is to own the thing you lost to. The pedagogy is encoded in the button hierarchy.

**On a win.** Identical structure. The verdict line explains why yours won. The delta is `--verdict-win`. If the win crosses a band threshold or ignites a star, that is a **separate full-screen moment after dismissal**, never overlaid on the verdict. Do not stack rewards on top of the lesson.

**Voice.** Referee, not coach. Precise, present tense. Words never used here: *Oops. Almost! Nice job! Try again! Incorrect. You failed.* Words used: the reason.

**Never.** Confetti. A slot-machine reveal. A sad trombone. A face. A percentage score. A star rating. A "You're doing great!" banner.

### 6.4 Constellation view: "The Sky"

Full-bleed, no chrome except a single close affordance. This is the artifact.

**Rules.**
- Every owned item (character, word, grammar point) is a star.
- **Position is deterministic** from the item's identity (stable hash → coordinates). A user's sky is the same sky every time and is recognizable to their friends. This is what makes it a shareable identity object rather than a chart.
- **Brightness = mastery probability** from the knowledge-tracing model. `p(mastery)` 0.5 → 0.99 maps to opacity 0.25 → 1.0.
- **Size = item frequency tier.** Exactly three sizes: 1px, 2px, 3px. No continuous sizing.
- **Color = retention state.** `--gold-100` at full mastery, cooling and dimming toward `--ink-800` as FSRS retention decays. A word you are forgetting literally dims and cools. The SRS surfaced as sky.
- **Constellations** are named clusters by domain: for Japanese, 仮名 (Kana), 常用 by grade, 助詞 (Particles), 活用 (Conjugation), 語彙 tiers.
- **Lines are drawn only between two items that are both above mastery threshold.** The figure completes as you learn.
- **Unearned items are not shown as empty slots.** Instead the constellation's outline is a 1px `--ink-400` path at 30% opacity. You can see the shape you are filling without seeing a checklist of your failures. This distinction is the difference between an invitation and a guilt object.

**Interaction.** Pinch/scroll to zoom, drag to pan. Tap a star for a small panel: the item, its mastery, its next review, its match history (`you lost to this twice`). No twinkle, no idle animation.

**Share artifact.** A 1080×1350 render, sky only, one line of type: `HARUKI · JAPANESE · 1 588 · 2 140 STARS`. No dominant logo. Any watermark ≤10px. The image is the ad.

### 6.5 Profile: "Standing"

A vertical document, not a dashboard of cards. **The hero-metric template (big number, small label, three supporting stats, gradient accent) is explicitly banned here.**

1. **Header, ~60vh full-bleed.** The user's highest-altitude world sky as the image. Handle at `--t-display-1`. Beneath it, one row of six rating chips, one per world, each in that world's `mark`, showing rating + band. Unplayed worlds are hairline outlines with no number. **This row is the identity statement.**
2. **Peak ratings, permanent.** A compact table: world, ladder, current, peak, peak date. Display face with `tnum` for numbers, mono for dates. **Hairlines group by world, one divider per group, never one per row.**
3. **The constellation**, as a wide crop, tappable into the full view. One line: total stars, and the most recently ignited item.
4. **Rivals.** Named humans with head-to-head records: `Haruki 4-7`. Real type size at `--t-title-2`. When another user views the profile, records are shown from *their* perspective.
5. **Companions** (one per world) as small portraits; badges and season banners as a horizontal scroll-snap strip, not a grid.

**The streak, if shown at all, is a record:** `Longest run 84 days · Current 12`. Past tense, permanent, unpunishing. No flame. No countdown. No freeze inventory.

**Never.** A stat-tile row. A level bar. An XP number. A radar chart of "skills."

### 6.6 Ladder: "The Ascent"

**The list reads bottom to top.** The highest rating is at the top and the list scrolls upward into thinner air. The background haze thins as you scroll toward the top. **Scrolling the leaderboard is climbing.** This is the one place the altitude metaphor becomes a scroll mechanic, and it costs nothing to implement (haze opacity bound to scroll progress via a scroll-driven animation or `IntersectionObserver`, never a scroll listener).

**Row anatomy** (single line, `--t-title-3` height):
`rank (mono, tnum, --ink-650)` · `handle (text face 500)` · `rating (display face 600, tnum, right-aligned, largest element in the row)` · `7-day delta (--t-body-sm, gold up / --verdict-loss down)` · `40px sparkline of the last 20 matches (2px line, no fill, no grid, no axes, no dots)`.

**Dividers are sparse:** one hairline every 5 rows, plus one above the user's row. Never a border on every row.

**Band boundaries** are marked with a full-width hairline and the band name in the gutter, so the ceiling you are pushing at is always visible and always labeled with the distance to it. This is where the ICWSM threshold-crossing insight becomes a visual affordance.

**The user's own row**, when scrolled out of range, pins to the viewport edge on a `--gold-900` bed with a full 1px `--gold-700` border at 40%. **Not a left side-stripe** (banned).

**Filters** in one row above the list: ladder (DUEL / RECALL / FORGE), scope (Global / Crew / Rivals / Friends), window (Season / All-time). Segmented `ToggleGroup`, not a `Select`, because each has ≤4 options.

**States.** Loading: skeleton rows matching exact row height. Empty: names the reason and gives one action (`No crew yet. Join or start one.`), never a shrug illustration.

**Never.** A podium with pedestals. Trophy or medal icons. A filled progress track behind each rating. Avatars in every row (they turn a ladder into a chat list).

---

## 7. Component inventory

### 7.1 Use as-is from shadcn/Radix (reskinned to tokens, never default state)

`Dialog` · `AlertDialog` (destructive confirmation only) · `Popover` · `Tooltip` · `DropdownMenu` · `Tabs` · `ScrollArea` · `Separator` · `Label` · `Sheet` (mobile filters, star detail) · `Switch` · `Checkbox` · `RadioGroup` · `ToggleGroup` (segmented filters) · `Command` (global search, Ask lookup) · `Skeleton` · `Avatar` (sized with Tailwind classes; there is no `size` prop) · `Form` + `Input` + `Textarea` · `Collapsible` · `Sonner`/`Toast` (undo and system messages only) · `Progress` (determinate uploads only).

Init with `--base radix`, style `new-york`, `baseColor zinc` then override every color token. After `shadcn init`, replace the font declarations in `@theme inline` with literal family names (Tailwind v4 resolves `@theme inline` at parse time, so `var(--font-*)` self-references silently break font loading), and move font variable classNames to `<html>`.

### 7.2 Custom (this is the product)

| Component | Notes |
|---|---|
| `WorldOrrery` | WebGL (Three.js) or CSS 3D. Isolated `'use client'` leaf, lazy-loaded, with a static poster image as the LCP element so the orrery never blocks LCP. |
| `SkyLayer` | Four layers: sky gradient (CSS), celestial body (SVG/canvas), star field (canvas, single draw; a rAF loop only while parallaxing), haze (CSS radial-gradient). |
| `AltitudeProvider` | Rating → `--altitude` scalar + band name. Writes CSS custom properties on the world root. No React re-render on interpolation. |
| `Constellation` | Canvas or WebGL. Deterministic layout from item hashes, zoom/pan, share-frame export at 1080×1350. |
| `MatchTimer` | rAF writing one CSS custom property. Never React state. |
| `VerdictComparison` | The two-answer panel with token-level diff span marking. |
| `RatingNumeral` | `tnum` count-up, reduced-motion aware, zero layout shift. |
| `LadderRow` + `Sparkline` | Custom SVG sparkline per dataviz mark specs: 2px stroke, no fill, no grid, no axes, no dots. |
| `GlyphPrompt` | CJK hero glyph with correct `lang`, `<ruby>` support, optional stroke-order overlay. |
| `WaveformPlayer` | RECALL audio, 2px hairline bars, replay counter. |
| `RatingChipRow` | The six-world identity row on the profile. |
| `StarIgnition` | The reward moment. `--dur-ignite` + `--dur-hold`. |
| `BandCrossing` | Full-screen altitude threshold sequence. |
| `CompanionPortrait` | Non-anthropomorphic, at distance or in profile. |

### 7.3 Avoid, because it will look templated

| Avoid | Instead |
|---|---|
| shadcn `Card` as the default container | Spacing, hairlines, and the sky as ground. The verdict's two panels are the only card in the product. |
| Untouched shadcn `Button` | Pill, `--gold-500` fill, `--ink-100` label, `active:scale-[0.985]`. Ghost = 1px `--ink-600`, no fill. |
| `Table` for the ladder | `LadderRow`. A stock table's header row and per-row borders are the exact templated look to avoid. |
| `Accordion` for content | Settings only. Anywhere else it reads FAQ. |
| Recharts / shadcn `Chart` defaults | Custom SVG. Anything with a default legend, gridline set, or gradient area fill is out. |
| `Carousel` with dots and arrows for worlds | `WorldOrrery`. |
| `Progress` for rating or mastery | Nothing. Filled comparison tracks are banned. |
| `Badge` in default state | Reskin: pill, 1px border, no fill, `--t-label`. |
| Icon-heavy navigation | Phosphor **Light**, stroke 1.25, 20px, sparingly. The world select has zero icons. |
| Emoji, including flags | Never, anywhere. |

### 7.4 Radius, spacing, elevation, z-scale

**Radius.** Exactly four: `--r-1: 4px` (inputs, chips), `--r-2: 8px` (surfaces, panels), `--r-3: 12px` (sheets, verdict panels), `--r-full: 999px` (buttons, avatars, rating chips only). Nothing else.

*Explicit deviation:* the "double-bezel / machined hardware" pattern (2rem squircles, nested concentric enclosures, outer shells) from the high-end-visual-design skill is **rejected for this product.** That pattern signals premium-as-hardware. This product's premium signal is atmosphere and scale. Nesting enclosures would put a chrome frame around a sky.

**Spacing.** 4px base. Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128. Section rhythm on world surfaces is 96–128; on instrument surfaces 24–48.

**Elevation.** No drop shadows on Night. Depth = surface lightness step + hairline + background blur + inset top highlight `inset 0 1px 0 rgb(255 255 255 / .06)`. One shadow token exists, for Dusk only.

**Z-scale (semantic, never arbitrary).**
`--z-sky: 0` · `--z-content: 10` · `--z-sticky: 20` · `--z-hud: 30` · `--z-scrim: 40` · `--z-sheet: 50` · `--z-toast: 60` · `--z-tooltip: 70` · `--z-grain: 80`.

---

## 8. Anti-patterns

### 8.1 Generic AI slop (these would make it look machine-made)

- **AI purple/violet gradient CTAs, neon outer glows on buttons.** This product has glow, but glow is *atmospheric and has a position*: it comes from the celestial body. No colored `box-shadow` halos on interactive elements, ever. (Japanese's world hue is a periwinkle violet. It appears once, as one world's atmosphere, never as a UI accent, never as a gradient.)
- **Glassmorphism everywhere.** Glass is used exactly twice: the match HUD and the sheet over the sky. Every other surface is opaque tinted indigo.
- **The hero-metric template.** Big number, small label, three supporting stats, gradient accent. Banned on profile, banned on any dashboard surface.
- **Three or six identical cards in a row.** Banned. The world select is the highest-risk surface for this and is specified as an orrery precisely to avoid it.
- **An eyebrow above every section.** Budget: two in the whole product.
- **Numbered section scaffolding** (`01 / 02 / 03`). The only numbers on screen are ratings, ranks, timers, counts, records, and dates.
- **Em-dashes anywhere in UI copy.** Zero. Use periods and colons.
- **Gradient text** (`background-clip: text`).
- **Side-stripe borders** (`border-left: 3px solid accent`) on rows, callouts, or the user's ladder row.
- **Nested cards.**
- **Cream/sand/beige body background** in the Dusk theme, or tokens named `--paper`, `--cream`, `--sand`, `--bone`, `--linen`.
- **Inter** as the type system. **Fraunces** or **Instrument Serif** as display.
- **Fake precise numbers** in seeded content (`99.2% accuracy`, `4.7× faster`). Every number is a real quantity or is explicitly labeled sample data.
- **Generic names.** Bots are named characters with regional plausibility and a rating, and are always labeled `BOT`. Never "John Doe," never "Acme."
- **`window.addEventListener('scroll')`**; animating layout properties; `h-screen` instead of `min-h-[100dvh]`.
- **Scroll cues** (`Scroll to explore`, bouncing chevrons), locale/weather strips, version stamps, decorative status dots.
- **Dual-axis charts.** Two measures at different scales get two charts or an indexed base.
- **A dark build with no reduced-motion, reduced-transparency, or increased-contrast handling.**

### 8.2 Duolingo-adjacent (the explicit anti-reference)

- **No mascot with a face.** Companions are creatures of a world, seen at distance or in profile, non-anthropomorphic. They never speak in the first person to guilt you. They never appear on the verdict screen.
- **No green as a state color.** Not for success, not for progress, not for the brand. Success is rose-gold. Korean's world hue is jade; that is *place*, and the separation must be enforced in code review.
- **No red as a wrong-answer color.** Red is system failure only.
- **No hearts, lives, energy, gems, or any gate on practice.**
- **No streak flame, no "don't break your streak," no streak-freeze store.** The streak is a past-tense record. Freezes are free, automatic, and never announced.
- **No guilt notifications.** Every push is a fact about the world moving: `Haruki answered.` / `Season 1 ends in six hours. You are 40 points from Ridge.` Never a countdown of your failure, never a passive-aggressive character.
- **No confetti, no bouncing, no squash-and-stretch, no cartoon sound stings, no XP bars, no "COMBO!" callouts, no chest-opening.**
- **No cartoon rounded-everything.** Four radius values, max 12px except pills.
- **No cheerleader copy.** `Oops!` `Almost!` `Nice job!` `Great work!` are banned strings. Voice is referee.
- **No demotion** in leagues (per spec), and no demotion animation anywhere in the product.
- **No lesson tree of bubbles.** Trials is a constellation, not a path of circles.
- **No character-driven tutorial.** First run is one match in under 60 seconds, no account, no tour, no coach.
- **No cutesy naming inside the product.** No `-o`, no `-ly`, no onomatopoeia.

### 8.3 Product-specific traps

- **Do not make the sky pretty at the cost of legibility.** Every text surface sits on a solid or 90%+ opaque bed. Text directly on the sky is permitted only at `--t-display-*` sizes with a scrim.
- **Do not animate the sky downward on loss.** The single most likely well-intentioned mistake in this system.
- **Do not use the world hue for feedback.** The second most likely.
- **Do not put a rating on the match screen.** The third.
- **Do not let the orrery block LCP.** Poster image first, WebGL hydrated after.
- **Do not ship six CJK font families to every user.** Load per world.

---

## 9. Copy-ready

### 9.1 CSS custom properties

```css
/* ============================================================
   LoxeLingo design tokens
   Theme: Night (default, dark) / Dusk (alternate, light)
   Page Theme Lock: one theme per session, never per section.
   ============================================================ */

:root,
[data-theme="night"] {
  /* --- indigo base ramp --- */
  --ink-000: #05060F;
  --ink-050: #090C1B;
  --ink-100: #0D1226;   /* canvas */
  --ink-200: #141A33;   /* surface 1 */
  --ink-300: #1C2442;   /* surface 2 */
  --ink-400: #283154;   /* decorative hairline only (1.46:1) */
  --ink-500: #3A4570;   /* disabled fill */
  --ink-600: #5A6796;   /* functional border, large text (3.37:1) */
  --ink-650: #6F7CA8;   /* text tertiary (4.53:1) */
  --ink-700: #8792BC;   /* text secondary (6.07:1) */
  --ink-800: #B9C1DC;   /* icon default (10.36:1) */
  --ink-900: #E8EBF7;   /* text primary (15.60:1) */

  /* --- earned light (rose-gold). ONE accent. Earned or actionable only. --- */
  --gold-100: #FFF1E8;
  --gold-200: #FBD9C4;
  --gold-300: #F5BCA0;
  --gold-400: #EC9E7E;  /* accent text, icons, focus (8.62:1) */
  --gold-500: #DD7F62;  /* primary fill (6.44:1); label = --ink-100 */
  --gold-600: #BE5F4C;  /* pressed */
  --gold-700: #8E4239;
  --gold-800: #5C2A28;
  --gold-900: #2E1A1E;  /* earned-row tint bed */

  /* --- semantic surfaces --- */
  --canvas:            var(--ink-100);
  --surface-1:         var(--ink-200);
  --surface-2:         var(--ink-300);
  --hairline:          var(--ink-400);
  --border:            var(--ink-600);
  --text-primary:      var(--ink-900);
  --text-secondary:    var(--ink-700);
  --text-tertiary:     var(--ink-650);
  --text-disabled:     var(--ink-600);
  --accent:            var(--gold-500);
  --accent-text:       var(--gold-400);
  --accent-on:         var(--ink-100);
  --focus:             var(--gold-400);
  --focus-offset:      var(--ink-000);
  --scrim:             rgb(5 6 15 / .72);
  --selection:         rgb(221 127 98 / .28);
  --highlight-inset:   inset 0 1px 0 rgb(255 255 255 / .06);
  --shadow-sheet:      none;

  /* --- verdict / signal. Loss is weather. Red is system failure only. --- */
  --verdict-win:  #EC9E7E;
  --verdict-loss: #6E86B8;
  --verdict-draw: #8792BC;
  --signal-error: #E8757A;
  --signal-warn:  #E5B769;
  --signal-info:  #8792BC;

  /* --- world identity. Place, never state, never data. --- */
  --world-ja-atmos: #D3C7FF; --world-ja-mark: #866EC8; --world-ja-deep: #321E5C;
  --world-ko-atmos: #62D7AB; --world-ko-mark: #00A36F; --world-ko-deep: #003B23;
  --world-zh-atmos: #56DBDC; --world-zh-mark: #009CA0; --world-zh-deep: #003E43;
  --world-es-atmos: #FFBB5F; --world-es-mark: #C16600; --world-es-deep: #531A00;
  --world-fr-atmos: #E7A5F1; --world-fr-mark: #AF56BD; --world-fr-deep: #4A0953;
  --world-de-atmos: #67B2EE; --world-de-mark: #0087DA; --world-de-deep: #002E69;

  /* --- chart series. Max 3. Validated all-pairs (CVD + normal-vision). --- */
  --series-1: #DD6D45;
  --series-2: #005FC6;
  --series-3: #00A0A3;
}

[data-theme="dusk"] {
  --canvas:         #F3D9C9;
  --surface-1:      #EFD0BD;
  --surface-2:      #E9C6B0;
  --hairline:       #DDB29A;
  --border:         #B9836A;
  --text-primary:   #2E1A1E;  /* 12.15:1 */
  --text-secondary: #6B4238;
  --text-tertiary:  #7E5346;
  --text-disabled:  #A87E6C;
  --accent:         #8E4239;  /* 5.21:1 */
  --accent-text:    #8E4239;
  --accent-on:      #FFF1E8;
  --focus:          #8E4239;
  --focus-offset:   #FFF1E8;
  --scrim:          rgb(46 26 30 / .58);
  --selection:      rgb(142 66 57 / .22);
  --highlight-inset: inset 0 1px 0 rgb(255 255 255 / .42);
  --shadow-sheet:   0 24px 48px -20px rgb(46 26 30 / .28);

  --verdict-win:  #8E4239;
  --verdict-loss: #485B7D;   /* 5.08:1 */
  --verdict-draw: #3A4570;
  --signal-error: #A32F35;
  --signal-warn:  #7A5200;
  --signal-info:  #3A4570;

  --world-ja-mark: #5D4796; --world-ko-mark: #007044; --world-zh-mark: #006F74;
  --world-es-mark: #8F3F00; --world-fr-mark: #802E8D; --world-de-mark: #005CA7;

  --series-1: #CC572A;
  --series-2: #0058C4;
  --series-3: #00899D;
}

/* ============================================================
   Altitude. One scalar drives the whole environment.
   Set --altitude on the world root from rating.
   ============================================================ */
[data-world] {
  --altitude: 0;                                        /* 0..1, set by JS */
  --haze:       calc(0.94 - (var(--altitude) * 0.92));
  --body-scale: calc(0.04 + (var(--altitude) * 0.68));
  --body-y:     calc(112% - (var(--altitude) * 74%));
  --deck-y:     calc(96%  - (var(--altitude) * 62%));
  --star-op:    var(--altitude);
  --rim:        calc(max(0, var(--altitude) - 0.25) * 1.1);
}

/* ============================================================
   Typography
   ============================================================ */
:root {
  --font-display: "Söhne Breit", "Clash Display", ui-sans-serif, system-ui, sans-serif;
  --font-text:    "Söhne", "Satoshi", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Söhne Mono", "Geist Mono", ui-monospace, SFMono-Regular, monospace;

  --font-ja-display: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
  --font-ja-text:    "Noto Sans JP", "Hiragino Sans", sans-serif;
  --font-ja-serif:   "Shippori Mincho", "Yu Mincho", serif;
  --font-ko:         "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --font-ko-serif:   "Gowun Batang", "Apple SD Gothic Neo", serif;
  --font-zh-display: "Alibaba PuHuiTi 3.0", "Noto Sans SC", "PingFang SC", sans-serif;
  --font-zh-text:    "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-zh-serif:   "LXGW WenKai", "Kaiti SC", serif;

  --t-glyph:      clamp(5rem, 18vw, 11rem);
  --t-display-1:  clamp(3.25rem, 8vw, 6rem);
  --t-display-2:  clamp(2.5rem, 5.5vw, 3.75rem);
  --t-display-3:  clamp(1.875rem, 3.5vw, 2.5rem);
  --t-title-1:    1.5rem;
  --t-title-2:    1.25rem;
  --t-title-3:    1.0625rem;
  --t-body-lg:    1.125rem;
  --t-body:       1rem;
  --t-body-sm:    0.875rem;
  --t-label:      0.8125rem;
  --t-num-hero:   clamp(2.75rem, 6vw, 4.5rem);
  --t-num:        1.0625rem;
  --t-mono:       0.8125rem;
}

/* Numerals are always tabular. Non-negotiable. */
.num, .rating, .rank, .delta, time, [data-numeric] {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}

/* Display tracking applies to Latin only. */
:lang(en) .display { letter-spacing: -0.03em; }
:lang(ja), :lang(ko), :lang(zh) { letter-spacing: 0 !important; }
:lang(ja) { font-feature-settings: "palt" 1; }
:lang(ja) .display, :lang(zh) .display { font-feature-settings: normal; }
:lang(ja), :lang(zh), :lang(ko) {
  line-break: strict;
  word-break: normal;
  overflow-wrap: normal;
}
ruby > rt { font-size: 0.42em; color: var(--text-secondary); }

/* ============================================================
   Radius / spacing / motion / z
   ============================================================ */
:root {
  --r-1: 4px;  --r-2: 8px;  --r-3: 12px;  --r-full: 999px;

  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px; --sp-6: 24px;
  --sp-8: 32px; --sp-12: 48px; --sp-16: 64px; --sp-24: 96px; --sp-32: 128px;

  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-atmos:     cubic-bezier(0.65, 0, 0.35, 1);
  --ease-standard:  cubic-bezier(0.4, 0, 0.2, 1);

  --dur-micro: 120ms; --dur-fast: 180ms;  --dur-base: 260ms;
  --dur-slow:  420ms; --dur-beat: 700ms;  --dur-cinema: 1200ms;
  --dur-ignite: 900ms; --dur-hold: 1600ms;

  --z-sky: 0; --z-content: 10; --z-sticky: 20; --z-hud: 30;
  --z-scrim: 40; --z-sheet: 50; --z-toast: 60; --z-tooltip: 70; --z-grain: 80;
}

*:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--focus-offset);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  /* The verdict keeps its five beats; only the movement is removed. */
  [data-verdict-beat] {
    transition: opacity var(--dur-beat) var(--ease-standard) !important;
    transform: none !important;
  }
  [data-ambient] { animation: none !important; }
}

@media (prefers-reduced-transparency: reduce) {
  [data-glass] { backdrop-filter: none; background: var(--surface-2); }
}

@media (prefers-contrast: more) {
  :root { --hairline: var(--ink-600); }
  [data-grain] { display: none; }
  [data-world] { --haze: min(0.4, calc(0.94 - (var(--altitude) * 0.92))); }
}
```

### 9.2 Tailwind v4 theme

```css
/* app/globals.css, after @import "tailwindcss"; */
@theme inline {
  /* Literal font names. @theme inline resolves at parse time, so a
     var(--font-*) self-reference here silently breaks font loading. */
  --font-display: "Söhne Breit", "Clash Display", ui-sans-serif, system-ui, sans-serif;
  --font-sans:    "Söhne", "Satoshi", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Söhne Mono", "Geist Mono", ui-monospace, SFMono-Regular, monospace;

  --color-canvas:      var(--canvas);
  --color-surface-1:   var(--surface-1);
  --color-surface-2:   var(--surface-2);
  --color-hairline:    var(--hairline);
  --color-border:      var(--border);
  --color-fg:          var(--text-primary);
  --color-fg-muted:    var(--text-secondary);
  --color-fg-subtle:   var(--text-tertiary);
  --color-accent:      var(--accent);
  --color-accent-text: var(--accent-text);
  --color-accent-on:   var(--accent-on);

  --color-ink-000: #05060F; --color-ink-050: #090C1B; --color-ink-100: #0D1226;
  --color-ink-200: #141A33; --color-ink-300: #1C2442; --color-ink-400: #283154;
  --color-ink-500: #3A4570; --color-ink-600: #5A6796; --color-ink-650: #6F7CA8;
  --color-ink-700: #8792BC; --color-ink-800: #B9C1DC; --color-ink-900: #E8EBF7;

  --color-gold-100: #FFF1E8; --color-gold-200: #FBD9C4; --color-gold-300: #F5BCA0;
  --color-gold-400: #EC9E7E; --color-gold-500: #DD7F62; --color-gold-600: #BE5F4C;
  --color-gold-700: #8E4239; --color-gold-800: #5C2A28; --color-gold-900: #2E1A1E;

  --color-win:  var(--verdict-win);
  --color-loss: var(--verdict-loss);
  --color-draw: var(--verdict-draw);
  --color-error: var(--signal-error);
  --color-warn:  var(--signal-warn);

  --color-world-ja: var(--world-ja-atmos); --color-world-ja-mark: var(--world-ja-mark);
  --color-world-ko: var(--world-ko-atmos); --color-world-ko-mark: var(--world-ko-mark);
  --color-world-zh: var(--world-zh-atmos); --color-world-zh-mark: var(--world-zh-mark);
  --color-world-es: var(--world-es-atmos); --color-world-es-mark: var(--world-es-mark);
  --color-world-fr: var(--world-fr-atmos); --color-world-fr-mark: var(--world-fr-mark);
  --color-world-de: var(--world-de-atmos); --color-world-de-mark: var(--world-de-mark);

  --color-series-1: var(--series-1);
  --color-series-2: var(--series-2);
  --color-series-3: var(--series-3);

  --text-glyph:     var(--t-glyph);
  --text-display-1: var(--t-display-1);
  --text-display-2: var(--t-display-2);
  --text-display-3: var(--t-display-3);
  --text-num-hero:  var(--t-num-hero);
  --text-label:     var(--t-label);

  --radius:    8px;
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 12px;
  --radius-xl: 999px;

  --spacing: 4px;

  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-atmos:    cubic-bezier(0.65, 0, 0.35, 1);
}
```

**Tailwind v3 equivalent** (`tailwind.config.ts`), if the project is not on v4:

```ts
export default {
  darkMode: ["class", '[data-theme="night"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: { 1: "var(--surface-1)", 2: "var(--surface-2)" },
        hairline: "var(--hairline)",
        border: "var(--border)",
        fg: { DEFAULT: "var(--text-primary)", muted: "var(--text-secondary)", subtle: "var(--text-tertiary)" },
        accent: { DEFAULT: "var(--accent)", text: "var(--accent-text)", on: "var(--accent-on)" },
        ink: { "000": "#05060F", "050": "#090C1B", 100: "#0D1226", 200: "#141A33", 300: "#1C2442",
               400: "#283154", 500: "#3A4570", 600: "#5A6796", 650: "#6F7CA8", 700: "#8792BC",
               800: "#B9C1DC", 900: "#E8EBF7" },
        gold: { 100: "#FFF1E8", 200: "#FBD9C4", 300: "#F5BCA0", 400: "#EC9E7E", 500: "#DD7F62",
                600: "#BE5F4C", 700: "#8E4239", 800: "#5C2A28", 900: "#2E1A1E" },
        win: "var(--verdict-win)", loss: "var(--verdict-loss)", draw: "var(--verdict-draw)",
        world: { ja: "var(--world-ja-atmos)", ko: "var(--world-ko-atmos)", zh: "var(--world-zh-atmos)",
                 es: "var(--world-es-atmos)", fr: "var(--world-fr-atmos)", de: "var(--world-de-atmos)" },
        series: { 1: "var(--series-1)", 2: "var(--series-2)", 3: "var(--series-3)" },
      },
      fontFamily: {
        display: ['"Söhne Breit"', '"Clash Display"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans:    ['"Söhne"', '"Satoshi"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ['"Söhne Mono"', '"Geist Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        glyph:      ["clamp(5rem, 18vw, 11rem)",     { lineHeight: "1" }],
        "display-1":["clamp(3.25rem, 8vw, 6rem)",    { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        "display-2":["clamp(2.5rem, 5.5vw, 3.75rem)",{ lineHeight: "1.06", letterSpacing: "-0.03em" }],
        "display-3":["clamp(1.875rem, 3.5vw, 2.5rem)",{ lineHeight: "1.12", letterSpacing: "-0.025em" }],
        "num-hero": ["clamp(2.75rem, 6vw, 4.5rem)",  { lineHeight: "1", letterSpacing: "-0.02em" }],
        label:      ["0.8125rem",                     { lineHeight: "1.3", letterSpacing: "0.06em" }],
      },
      borderRadius: { xs: "4px", sm: "8px", md: "12px", lg: "12px", full: "999px" },
      transitionTimingFunction: {
        "out-expo":  "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
        atmos:       "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: { micro: "120ms", fast: "180ms", base: "260ms", slow: "420ms",
                            beat: "700ms", cinema: "1200ms", ignite: "900ms" },
      zIndex: { sky: "0", content: "10", sticky: "20", hud: "30", scrim: "40",
                sheet: "50", toast: "60", tooltip: "70", grain: "80" },
    },
  },
} satisfies import("tailwindcss").Config;
```

---

## 10. Pre-flight checklist (run before shipping any surface)

- [ ] Zero em-dashes in any user-visible string.
- [ ] One theme for the whole session; no section flips.
- [ ] Rose-gold appears only on earned or actionable elements.
- [ ] No world hue is used to encode state, correctness, or data.
- [ ] No green on any feedback surface, in any world.
- [ ] Red appears only on system failure.
- [ ] Every numeral has `tabular-nums`.
- [ ] Every CJK element has a correct `lang` attribute.
- [ ] No negative letter-spacing on CJK.
- [ ] Eyebrow count across the surface ≤ 2 for the whole product.
- [ ] No card except the two verdict panels.
- [ ] Body text ≥ 4.5:1; large text and functional borders ≥ 3:1.
- [ ] Focus ring visible over both dark surfaces and the celestial body.
- [ ] Reduced-motion, reduced-transparency, and increased-contrast paths all implemented.
- [ ] No motion on any timed-match surface.
- [ ] Altitude never animates downward on the verdict screen.
- [ ] Only `transform` and `opacity` animated.
- [ ] `min-h-[100dvh]`, never `h-screen`.
- [ ] CJK fonts load per world, not globally.
- [ ] Orrery does not block LCP.
- [ ] Empty, loading, and error states are designed, not placeholder text.
- [ ] Every number on screen is a real quantity or labeled sample.

---

## 11. Confidence and gaps

### Followed skill guidance directly (high confidence)
- Banned-pattern list (em-dash, gradient text, side-stripe borders, nested cards, hero-metric template, eyebrow budget, numbered scaffolding, `window.addEventListener('scroll')`, `h-screen`): verbatim from `impeccable`, `design-taste-frontend`, and `taste-design`.
- Contrast thresholds, focus visibility, reduced-motion mandate, touch targets, tabular figures: `ui-ux-pro-max` and `impeccable`.
- Chart rules (one axis, ≤3 series, no dual-axis, direct labels, no filled comparison tracks, sparkline mark spec, small multiples over a 6-hue palette): `dataviz`, with the palette **validated by running the skill's script**, not by inspection.
- shadcn usage, Tailwind v4 `@theme inline` font gotcha, `Avatar` sizing, `AlertDialog` vs `Dialog`: `vercel:shadcn`.
- Rejecting Inter, Fraunces, Instrument Serif, and defaulting-to-serif: `design-taste-frontend` §4.1 and `impeccable`.
- Dusk theme avoiding the cream/beige AI default band and forbidden token names: `impeccable`.

### Judgment calls (my decisions, flagged)
1. **Rose-gold as the win color instead of green.** Not from any skill. It follows from the Duolingo anti-reference plus the "cold unknown / warm earned" palette direction. It is the highest-leverage differentiating decision in the color system and I would defend it, but it is a bet.
2. **Slate-blue as the loss color instead of red, and red reserved for system failure.** Same origin. This is what makes "loss is not punishing" mechanical rather than aspirational.
3. **The two-zone dial split** (atmospheric world / still instrument). No skill says this. It resolves the real tension between "immersive, larger than life" and "competitive platform, precise."
4. **Both reference images become themes.** Night = the indigo reference, Dusk = the rose-gold megacity reference. My decision. It gives a legitimate light mode without breaking the altitude metaphor, and it solves the accessibility problem of a dark-only product.
5. **World hues never carry data; charts get a separate 3-series palette.** Forced by the validator: no six-hue set at these lightnesses passes all-pairs CVD separation. I verified this empirically across several hue configurations before concluding it. The resolution (small multiples + direct labels + a chip) is the skill's own prescribed escape hatch.
6. **Rejecting the double-bezel / machined-hardware pattern** from `high-end-visual-design`. That skill is prescriptive about it; I deliberately deviated because the pattern conflicts with an atmospheric register. Flagged as a conscious override, not an oversight.
7. **The verdict's five-beat sequence, and rematch not being the primary action.** Product design, not visual design. It is the strongest opinion in this document and the one most worth pressure-testing with real users.
8. **Söhne / Söhne Breit as the recommended licensed stack.** A paid dependency. The free path (Clash Display + Satoshi + Geist Mono) is specified and is genuinely good, but the licensed stack is materially better for the "authoritative numerals" requirement.
9. **Band names and thresholds** (Valley Floor → Meridian; 900/1100/1300/1550/1800/2100). Invented to satisfy the spec's "frequent early, spaced later" constraint. The specific numbers should be re-derived from the actual rating distribution once there is one.
10. **Japanese's world hue being a violet.** Sits close to the AI-purple ban. I judged it acceptable because it appears only as one world's atmosphere, never as a UI accent or gradient, and because periwinkle moonlight is the honest color for the concept. Worth a second look at visual QA.

### Open gaps
- **Companion visual language** is specified only negatively (non-anthropomorphic, no face, at distance). It needs its own art direction pass. It is the highest remaining unspecified surface.
- **Globe art per world** is described in prose but needs real concept art or a generation pass. The system depends on six globes that are instantly distinguishable at 80px.
- **Constellation figure design** per language (what shape does 常用 grade 1 actually make?) is unspecified and is a real content design job, not a code job.
- **Sound.** The spec bans sound stings but does not specify what sound the product does have. A competitive platform with no audio identity is leaving something on the table; deferred.
- **The Daily's shareable grid** (spec's primary organic growth lever) has no visual spec here. It should probably be a constellation fragment rather than an emoji grid, since Wordle-style emoji grids are explicitly commoditized per the competitor sweep. Recommend a dedicated pass.
- **Companion and season cosmetic tiers** interact with the palette (world skins, constellation themes are paid items). The token system supports theming, but the rules for what a paid theme may and may not override are not written.
- Contrast values are WCAG 2.x. If APCA is adopted, the tertiary text steps (`--ink-650`, world `mark` steps) are the ones most likely to need re-derivation.
