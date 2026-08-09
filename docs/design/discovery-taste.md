# LoxeLingo - Taste Discovery

**Date:** 2026-08-09
**Status:** Research and critique. No application code was written.
**Refines:** `docs/design/design-system.md` (not a replacement - that document stands except where explicitly challenged below)
**Brief:** premium minimalism. Dark, clean typography, generous spacing, atmospheric glow. Not corporate, not gamified, not Duolingo. Luxury travel app meets cosmic navigation system.
**Hard constraint:** show, never tell. Celestial in feel, never in vocabulary.
**Screenshots:** `/private/tmp/loxe-taste/` (7 files, captured 2026-08-09 against `localhost:3000`)

---

## 0. Sources consulted

| Source | What it actually contributed here |
|---|---|
| `ui-ux-pro-max` | §6 `number-tabular`, `color-dark-mode`, `color-accessible-pairs`; §1 contrast floors (4.5:1 body / 3:1 large + functional borders); §5 `readable-font-size` 16px mobile minimum and `line-length-control`. Used as the pass/fail floor for the audit in §6. |
| `impeccable` | The contrast-verification discipline ("if it's even close, bump toward ink"); the display tracking floor ≥ −0.04em; the clamp ceiling ≤ 6rem; "don't pair two similar-but-not-identical grotesques - pair on a contrast axis or use one family in multiple weights" (this is the single rule that decides §1); "cards are the lazy answer"; the absolute bans (side-stripes, gradient text, glassmorphism-as-default, hero-metric template, eyebrow-on-every-section). Also its category-reflex test, first- and second-order, which is what §7 is built on. |
| `taste-design` | Never pure `#000000`; max one accent below 80% saturation; the explicit ban on AI purple/blue neon glow; "no filler UI text / scroll cues"; skeletal loaders over spinners; composed empty states. Its `Inter` ban is already honoured by the existing system. |
| `design-taste-frontend` | §4.1 serif discipline and the Inter/Fraunces/Instrument-Serif bans; §4.2 the colour-consistency lock; §4.4 tint shadows to the background hue and the shape-consistency lock; §6.E grain only on fixed `pointer-events-none` pseudo-elements; §9.F/9.G the production-test tells and the absolute em-dash ban; §4.9 the copy self-audit, which drove the rewrite table in §4. |
| `high-end-visual-design` | The double-bezel / nested-enclosure pattern, which the existing design system explicitly rejects (§7.4). I agree with the rejection of the 2rem-squircle machined-hardware version, **but** I am re-importing one narrow piece of it in §2.3 (the paired light-top / dark-bottom edge), because on dark that pair is the only cheap substitute for a shadow. Also its custom-cubic-bezier mandate and its `backdrop-blur`-only-on-fixed-elements performance rule. |
| `design:ux-copy` | Error structure (what happened + why + how to fix), empty-state structure (what this is + why it's empty + how to start), "label buttons with the action". Directly responsible for the rewrites of the two live copy failures found in §6. |
| Empirical | Four instrumented measurement passes in a real browser against the running app (font metrics, digit advances, computed styles, contrast). Every number in §1 and §6 marked *measured* came from those runs, not from documentation. |

Web sources for licensing: [Klim pricing changes](https://klim.co.nz/blog/changes-to-eulas-new-pricing/) · [Grilli Type licensing information](https://www.grillitype.com/information) · [Pangram Pangram - PP Neue Montreal](https://pangrampangram.com/products/neue-montreal) · [UNCUT.wtf](https://uncut.wtf/) · [Archivo (Wikipedia)](https://en.wikipedia.org/wiki/Archivo)

---

## 1. Typography - replace Clash Display. Replace Satoshi too.

### 1.1 The finding that settles it

The brief asked whether Clash Display and Satoshi read as their own template. That turns out to be the *second* problem. The first is that **Clash Display cannot render this product's ratings.**

I measured digit advance widths in the running app, at 100px, weight 500, from the exact Fontshare stylesheet the app loads (`src/lib/design/font-sources.ts`):

| Face | `0` | `1` | `7` | max/min ratio | `tnum`/`lnum` effect |
|---|---|---|---|---|---|
| **Clash Display** | 70.40 | **33.20** | 56.90 | **2.120** | **none - identical output** |
| Satoshi | 66.00 | 66.00 | 66.00 | 1.000 | none needed (already tabular) |
| Helvetica (control) | 55.62 | 49.16 | 55.62 | 1.131 | — |
| Geist Mono (control) | 60.00 | 60.00 | 60.00 | 1.000 | — |

Clash Display's `1` is **less than half the width** of its `0`, and the free Fontshare release ships **no tabular figure set at all** - requesting `font-variant-numeric: tabular-nums` and `font-feature-settings: "tnum" 1, "lnum" 1` produces byte-identical metrics. The control faces prove the measurement discriminates correctly.

The design system's own §3.5 says: *"Ratings and ranks use the display face with `tnum`, not mono"* and *"a rating that shifts width while counting is a layout bug and a credibility bug."* Those two sentences are mutually unsatisfiable with Clash Display. A rating counting `1 588 → 1 599` shifts by roughly 0.37em per changed `1`. On the profile hero at 72px that is a **27px jump**, mid-animation, on the number the entire product is about.

Second measured fact: **the free Clash Display release does not include weight 600.** `document.fonts.check('600 100px "Clash Display"')` returns `false`; only 200/300/400/500 resolve. The type scale specifies 600 for `--t-display-1` and `--t-display-2`. Those tokens are currently unrenderable as written.

That is enough. Clash Display is out on engineering grounds before taste enters the room.

### 1.2 The taste argument, which points the same way

Clash Display + Satoshi is *the* Fontshare pair of the dark-premium-startup register. That is a real risk but it is the weaker argument, and I want to be honest that it is: plenty of good products use widely-used faces. The stronger version of the taste objection is specific to this product.

Clash Display is a geometric-humanist display face with tight apertures, a curled `a` tail and a distinctive `g`. This product sets Latin display type **immediately adjacent to** Zen Kaku Gothic New, Pretendard and Noto Sans SC - all low-contrast modern gothics with even stroke weight and open counters. Clash's modulation and quirk do not sit with them; you can see the mismatch in `01-world-select-desktop.png`, where `Español` in Clash and `日本` in Zen Kaku read as two different design systems stacked in one list. The Latin display face for this product has a job description: **low-contrast, engineered, neutral enough to disappear next to three different CJK gothics, and wide enough to read as scale at 96px.** That is exactly why the design system's paid first choice was Söhne *Breit* - the wide cut.

### 1.3 Recommendation: Archivo variable, at two widths, as the whole Latin system

**Keep:** nothing from the current Latin stack.
**Replace with:** **Archivo** - variable, `wdth 62–125` × `wght 100–900`, by Omnibus-Type, **SIL Open Font License 1.1, free for commercial use, no attribution required in-product.** Available from Google Fonts and self-hostable.

Measured, from a clean load of the full variable axis range:

| `wdth` | `JAPANESE` @100px | `1111` default | `1588` default | `1111` +tnum | `1588` +tnum |
|---|---|---|---|---|---|
| 62 | 356.4 | 140.0 | 155.4 | 166.8 | **166.8** |
| 88 | 479.7 | 201.9 | 206.6 | 211.1 | **211.1** |
| 100 | 536.6 | 230.4 | 230.3 | 231.6 | **231.6** |
| 112 | 607.7 | 248.5 | 262.7 | 262.9 | **262.9** |
| 125 | 684.8 | 268.0 | 297.8 | 296.8 | **296.8** |

Three things that matter, all measured rather than claimed:

1. **The tabular set works, at every width.** `1111` and `1588` are identical to the tenth of a pixel across the entire axis. Ratings will not shift.
2. **It has a proportional set too.** Default figures differ (248.5 vs 262.7 at wdth 112), so numbers inside prose stay properly spaced. Satoshi cannot do this - it only has tabular, which is why numbers in Satoshi body copy look gappy.
3. **The width axis spans 1.92×.** `JAPANESE` goes from 356px to 685px in one file. Archivo at `wdth 112` *is* a Breit. Archivo at `wdth 100` is the text cut. **Söhne + Söhne Breit, in one OFL file.**

This is the product-specific argument, and it is the reason I am recommending one family rather than a pair:

> The design system's most important structural decision is the two-zone dial split - the world is vast, slow and atmospheric; the instrument is dense, fast and still. Right now that split has no typographic expression at all; both zones use the same face at the same width and (as §6 shows) the same weight. **Give the split to the width axis.** The world speaks at `wdth 112`. The instrument speaks at `wdth 100`. Same voice, two postures. It costs zero additional font bytes, it satisfies `impeccable`'s "use one family in multiple weights" rule instead of violating its "don't pair two similar grotesques" rule, and §5 below uses the same axis to give the three ladders distinct identities without a single icon.

Archivo's provenance also fits: it is an American-gothic-derived grotesque drawn for high performance at small sizes and for highway/print signage lineage. "Instrumentation at small sizes, scale at large sizes" is literally its design brief. It is a Google Fonts staple at default width, which is a mild template risk - but at `wdth 112 / wght 600` it does not look like the Archivo anyone recognises, and the counter-risk (a face that cannot render a rating) is not survivable.

**Mono:** keep **Geist Mono** (OFL, Vercel). It appears in three places at 13px - timers, match IDs, replay counters. Replacing it buys nothing and the template risk at that usage volume is negligible. One refinement below moves the ladder rank column off mono.

**CJK:** keep the existing per-world stack (Zen Kaku Gothic New / Pretendard / Noto Sans SC + Alibaba PuHuiTi where licensable). Archivo pairs with all three far better than Clash does - both are low-contrast and vertically stressed. **But** see §1.5: the app currently declares `Alibaba PuHuiTi 3.0` first for Mandarin display and never loads it, so `中文` renders in Noto Sans SC - a *body* face - at display size. Either license and self-host PuHuiTi or drop it from the stack and set Mandarin display in Noto Sans SC 700 deliberately.

### 1.4 Alternatives I considered and rejected

| Face | Licence / price | Why not |
|---|---|---|
| **Instrument Sans** | OFL, free | Genuinely good, has a width axis - but measured range is `wdth 75–100`. It can condense; **it cannot expand.** No Breit is possible. Also the fastest-rising face in exactly the same premium-startup register, so it is the second-order reflex: "not Fontshare → Instrument Sans." |
| **Schibsted Grotesk** | OFL, free | Strong, characterful, under-used in US startup-land. Measured digit ratio 1.000. Viable as display **if** paired with Archivo for text - but that is two grotesques, which `impeccable` bans. Keep as the fallback if the team finds Archivo too plain. |
| **Wix Madefor Display** | OFL, free | **Disqualified on the same test as Clash:** measured digit ratio **1.387**, and `tnum` does not correct it. |
| **Anybody** | OFL, free | Huge width axis (50–150), very distinctive - and that is the problem. It reads sci-fi, which walks straight into the §7 trap. |
| **Bricolage Grotesque / Familjen Grotesk / Host Grotesk / Chivo / Funnel Display / Gabarito / Hanken Grotesk / Public Sans / Geist** | OFL, free | All measured with digit ratio 1.000, all technically fine. None has a usable width axis, so none can carry the two-zone split; and Geist is now the most-defaulted face in the category. |
| **Uncut Sans** (uncut.wtf), **Apfel Grotezk** (Collletttivo) | OFL, free | Good, genuinely off the beaten path, worth a look if the team wants more character. Neither is variable, so both cost more bytes than Archivo for less range. |
| **Söhne + Söhne Breit** (Klim) | **Paid.** Klim's base is **$60 USD per style** at the minimum licence tier (desktop/web/app), with package discounts of **15% for 2 styles, 20% for 3**, and larger cross-format bundle discounts (Klim cites up to 57–60% for a family across desktop+web+app). Web tier is metered by **pageviews *or* unique users, chosen at purchase and not switchable later**. | Still the best possible answer and still what I would buy if there is budget. The realistic bundle here is 5–6 styles (Söhne Buch + Kräftig, Breit Buch + Kräftig, Mono Buch), so a low-hundreds-of-dollars starter web licence. I could not read the exact multi-style total - Klim's configurator is JS-rendered and returned "Loading, please wait…". **Flag the metering:** the web licence scales with traffic, so a hit product owes more money. Archivo does not. |
| **GT America** (Grilli Type) | Paid, USD, web tier priced by **projected unique monthly visitors**. Exact figures behind their shop. | Excellent and correctly wide, but same traffic-metered exposure, and GT America is itself heavily used. |
| **PP Neue Montreal / Right Grotesk** (Pangram Pangram) | Paid, **"licences start at $40 USD"**. | Neue Montreal is now as saturated as Clash. Right Grotesk is strong but its display cuts are loud. |

### 1.5 Copy-ready CSS - type scale change

This replaces §9.1's typography block and the font declarations in §9.2's `@theme inline`. Everything not listed is unchanged.

```css
/* ============================================================
   Typography - Archivo variable (SIL OFL 1.1), one family.
   The two-zone dial is carried by the WIDTH axis, not by a
   second family. World = wide. Instrument = normal.
   ============================================================ */
:root {
  --font-display: Archivo, ui-sans-serif, system-ui, sans-serif;
  --font-text:    Archivo, ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, SFMono-Regular, monospace;

  /* CJK faces unchanged; loaded per world, lazily, on world entry. */
  --font-ja-display: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
  --font-ja-text:    "Noto Sans JP", "Hiragino Sans", sans-serif;
  --font-ko:         "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --font-zh-display: "Noto Sans SC", "PingFang SC", sans-serif;   /* PuHuiTi removed until licensed + self-hosted */
  --font-zh-text:    "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;

  /* --- the two postures --- */
  --wdth-world:      112;   /* world names, band names, the verdict sentence */
  --wdth-instrument: 100;   /* ladder, profile, forms, prose */
  --wdth-rank:        78;   /* ladder rank column. Replaces mono there. */

  /* --- optical CJK correction. MEASURED, not guessed. ---
     Archivo cap-height  = 0.686 em  (H, actualBoundingBoxAscent @200px = 137.2)
     Zen Kaku 日 visual  = 0.885 em  (asc 157.2 + desc 19.8 @200px)
     Noto Sans SC 日     = 0.853 em  (asc 156.0 + desc 14.6 @200px)
     Set CJK at these factors of the adjacent Latin size, or the CJK
     reads ~29% larger at identical font-size. */
  --cjk-optical-ja: 0.775;
  --cjk-optical-zh: 0.805;
  --cjk-optical-ko: 0.80;   /* NOT measured. Verify against Pretendard before shipping. */

  /* --- scale. Display max still capped at 6rem except --t-glyph. --- */
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

  /* --- measure. Measure in ch scales INVERSELY with size. --- */
  --measure-body:      66ch;  /* 16px  */
  --measure-body-lg:   58ch;  /* 18px  */
  --measure-title:     42ch;  /* 24px  */
  --measure-display-3: 34ch;  /* the verdict sentence, 30-40px */
  --measure-display-1: 22ch;  /* 52-96px */
}

/* The tokens carry width, weight and tracking together. Applying a size
   without its posture is what produced the flat 400-weight page in §6. */
.t-display-1 { font-family: var(--font-display); font-size: var(--t-display-1);
  font-variation-settings: "wdth" var(--wdth-world); font-weight: 600;
  line-height: 1.02; letter-spacing: -0.02em; max-width: var(--measure-display-1);
  text-wrap: balance; }

.t-display-2 { font-family: var(--font-display); font-size: var(--t-display-2);
  font-variation-settings: "wdth" var(--wdth-world); font-weight: 600;
  line-height: 1.06; letter-spacing: -0.018em; text-wrap: balance; }

.t-display-3 { font-family: var(--font-display); font-size: var(--t-display-3);
  font-variation-settings: "wdth" var(--wdth-world); font-weight: 500;
  line-height: 1.14; letter-spacing: -0.015em;
  max-width: var(--measure-display-3); text-wrap: balance; }

.t-body { font-family: var(--font-text); font-size: var(--t-body);
  font-variation-settings: "wdth" var(--wdth-instrument); font-weight: 400;
  line-height: 1.55; max-width: var(--measure-body); text-wrap: pretty; }

/* Numerals: Archivo's tabular set is real and verified at every width. */
.num, .rating, .rank, .delta, time, [data-numeric] {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
.t-num-hero { font-family: var(--font-display); font-size: var(--t-num-hero);
  font-variation-settings: "wdth" 106; font-weight: 600;
  line-height: 1; letter-spacing: -0.01em; }

/* The ladder rank column moves off mono. It does not need a terminal
   voice; it needs a narrow tabular one. Same family, narrow posture. */
.t-rank { font-family: var(--font-display); font-size: var(--t-mono);
  font-variation-settings: "wdth" var(--wdth-rank); font-weight: 500;
  font-variant-numeric: tabular-nums lining-nums; }

/* Latin tracking only. Unchanged rule, restated because it is load-bearing. */
:lang(ja), :lang(ko), :lang(zh) { letter-spacing: 0 !important; }

/* Mixed Latin/CJK display runs. Without this the CJK reads 29% larger. */
[data-script="ja"] .cjk { font-size: calc(1em * var(--cjk-optical-ja)); line-height: 1.15; }
[data-script="zh"] .cjk { font-size: calc(1em * var(--cjk-optical-zh)); line-height: 1.15; }
[data-script="ko"] .cjk { font-size: calc(1em * var(--cjk-optical-ko)); line-height: 1.15; }
```

Tailwind v4 `@theme inline` replacement:

```css
@theme inline {
  --font-display: Archivo, ui-sans-serif, system-ui, sans-serif;
  --font-sans:    Archivo, ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, SFMono-Regular, monospace;
}
```

Loading: one variable woff2, latin + latin-ext subset, `wdth 62–125` `wght 100–900`, self-hosted, `font-display: swap`, preloaded. That is a single request replacing the current two-family Fontshare request, and it removes a third-party origin (`api.fontshare.com` / `cdn.fontshare.com`) from the critical path.

---

## 2. What makes dark UI premium rather than cheap

The existing system already bans drop shadows on dark and builds depth from lightness steps, hairlines and background blur (§2.8, §7.4). That is correct and it is more than most products get right. Here is what else is checkable.

### 2.1 Measure elevation in OKLCH lightness, and budget it

Hex steps lie. Perceived elevation on dark is almost entirely a function of OKLCH `L`. The current ramp:

| Token | Hex | approx OKLCH L | ΔL from previous |
|---|---|---|---|
| `--ink-100` canvas | `#0D1226` | ~0.183 | — |
| `--ink-200` surface 1 | `#141A33` | ~0.222 | 0.039 |
| `--ink-300` surface 2 | `#1C2442` | ~0.267 | 0.045 |

**Rule: 0.035–0.045 ΔL per surface step, and never more than three steps total.** Below 0.03 the step is invisible on a phone in daylight; above 0.06 the surface stops reading as "the same material, closer" and starts reading as a light-mode card pasted onto a dark page. The existing ramp is in the right band - keep it, and write the rule down so nobody adds a `--ink-350`.

The corollary that is currently broken is in §2.5.

### 2.2 Cap chroma as a function of element size

The failure mode that makes dark UIs look cheap is saturated colour at small sizes. On OLED, high-chroma light text on near-black halates; the glyph edges bloom and the text loses its shape. Concrete budget:

- Text below 20px: **OKLCH C ≤ 0.11.** (`--ink-650` through `--ink-900` and `--gold-400` all comply.)
- Text 20–48px: C ≤ 0.14.
- Large areas (sky, haze, celestial body): C is unconstrained - this is where chroma belongs.
- Never `#FFFFFF` for body text on near-black. The system's `--ink-900` `#E8EBF7` at 15.6:1 is exactly right and is one of the things it already does better than most. Pure white on `#0D1226` would be 17.6:1 and would read *worse*, because contrast past ~15:1 buys nothing and halation costs a lot.

(`taste-design`: never pure black, max one accent below 80% saturation. `ui-ux-pro-max` §6 `color-dark-mode`: dark mode uses desaturated tonal variants, not inverted colours.)

### 2.3 The paired edge - the one shadow substitute that works

A single `inset 0 1px 0 rgb(255 255 255 / .06)` top highlight (which the system has) makes a surface look lit. It does not make it look like it has *thickness*. The cheap, checkable upgrade is the **pair**: light on top, dark on the bottom.

```css
--edge-raised:
  inset  0  1px 0 rgb(255 255 255 / .07),
  inset  0 -1px 0 rgb(0 0 0 / .28);
```

Two lines. That is the entire useful residue of `high-end-visual-design`'s double-bezel idea, without the 2rem squircle nesting the design system correctly rejected in §7.4. A surface with only a top highlight reads as a rectangle with a line on it; a surface with both reads as a plane with an edge. Verify by squinting: if the surface still has a visible boundary when you defocus, it worked.

### 2.4 Hairline opacity is a function of its bed, not a constant

`--hairline: rgb(255 255 255 / .06)` is applied uniformly today. It should not be. A white line at fixed alpha over a lighter bed produces *less* separation, because the bed is already closer to white. Table:

| Sits on | Hairline | Resulting ΔL |
|---|---|---|
| `--ink-100` canvas | `rgb(255 255 255 / .075)` | ~0.030 |
| `--ink-200` surface 1 | `rgb(255 255 255 / .065)` | ~0.028 |
| `--ink-300` surface 2 | `rgb(255 255 255 / .055)` | ~0.026 |
| Over the sky / a bright celestial body | `rgb(0 0 0 / .18)` | inverts - a dark hairline is the only one that survives a light background |

That last row matters: this product has a screen where UI sits over a body filling 70% of the frame. A white hairline disappears there. **Hairlines need a light-on-dark and a dark-on-light variant, chosen by what is behind them, not by the theme.**

The system's §2.3 split between decorative `--ink-400` (1.46:1, hairlines) and functional `--ink-600` (3.37:1, input borders) is correct and rare. Keep it and enforce it in review: *if a border tells you where something begins, it is 3:1 minimum per WCAG 1.4.11; if it merely groups, it may be invisible-ish.*

### 2.5 Atmosphere has to be a bigger delta than furniture - and right now it is not

This is the largest single defect in the live build and it is one line of CSS.

`src/styles/tokens.css:104` sets `--haze-color: 20 26 51`, which is `#141A33` - **exactly `--ink-200`, the surface-1 token.** The sky bottom is `--ink-100` `#0D1226`. So the haze, which is the entire atmospheric system, is being painted in a colour **one surface step (ΔL ≈ 0.039) away from the canvas**, at a maximum contrast ratio of about **1.08:1**.

That is why every screenshot reads flat. At `--altitude: 0` the haze opacity is 0.94 - nearly fully opaque - and it still produces almost nothing, because it is 94% of a colour that is nearly identical to what is underneath.

**Rule: atmosphere must be at least 2× the surface step, and it must move in hue, not only in lightness.** Haze that is a lighter grey of the sky is fog on a monitor. Haze that is lighter *and* shifted toward the world's own `atmos` hue is air. Concretely:

```css
/* was: --haze-color: 20 26 51;  (= --ink-200, ΔL 0.039, ~1.08:1) */
--haze-color: 38 48 92;   /* ΔL ≈ 0.105, ~1.35:1, and +0.03 chroma toward indigo */
```

and let the world tint it further:

```css
[data-world] {
  --haze-tint: color-mix(in oklab, rgb(var(--haze-color)) 84%, var(--world-atmos));
}
```

The atmospheric glow the brief asks for is currently specified, implemented, and invisible. This is the fix.

### 2.6 Glow falloff - the single biggest tell

Most "cosmic" dark UI fails at the gradient, in three specific ways:

1. **Interpolating to `transparent`.** In sRGB, `transparent` is *transparent black*, so `radial-gradient(circle, #D3C7FF, transparent)` passes through a grey-brown dead zone and produces a visible dirty ring. **Never write `transparent` in a glow. Write the same colour at alpha 0**, and interpolate in oklab:
   ```css
   background: radial-gradient(circle at 50% 42% in oklab,
     rgb(211 199 255 / 1) 0%,
     rgb(211 199 255 / .55) 18%,
     rgb(211 199 255 / .22) 38%,
     rgb(211 199 255 / .07) 62%,
     rgb(211 199 255 / 0) 100%);
   ```
2. **Two-stop falloff.** A two-stop gradient falls off linearly. Real luminance falls off roughly inverse-square: fast near the source, then a long faint tail. A linear falloff reads as a spotlight on a wall. **Five stops at 0 / 18 / 38 / 62 / 100% with alphas 1 / .55 / .22 / .07 / 0** approximates it well enough that the eye stops objecting. The app's current celestial body uses four stops with a hard cut at 78% - that hard cut is a visible edge; extend it to 100%.
3. **Glow with no source.** If several elements glow and the light comes from everywhere, it comes from nowhere, and the scene reads as decoration. **One light source per screen, and every other element must agree with it.** The app currently draws the rim light as a full-width `top: 0; height: 1px` bar (`sky-layer.tsx`, layer 6). A uniform top rim is by definition sourceless. It should be a gradient along the edge, brightest on the side the body is on, and surfaces lower in the frame should catch less of it.

### 2.7 Grain is dithering, not decoration

The system specifies `feTurbulence` at opacity `.035`, fixed, `pointer-events: none`. That is correct and it should be defended against anyone who calls it decoration. A large smooth gradient across 40vh+ on a dark background will band on 8-bit displays. **The grain is what breaks the bands.** Two constraints: tile at native resolution (128–256px, `background-repeat`, never scaled - a scaled noise texture becomes visible blotches), and keep it on a fixed pseudo-element so it never repaints during scroll (`design-taste-frontend` §6.E, `high-end-visual-design` §6).

### 2.8 Optical vs mathematical spacing - five places it bites here

`impeccable` says vary spacing for rhythm; the operational version is that *equal numbers do not look equal*.

1. **Tracked uppercase labels sit low.** `--t-label` is 13px, `0.06em` tracking, all caps. Caps have no descender, so mathematical vertical centering in a padded box puts them visually below centre. Subtract 1px from bottom padding (or use `text-box: trim-both cap alphabetic` where supported). Applies to the match constraint line and the band label - the only two eyebrows in the product, so both are high-visibility.
2. **Pill buttons look bottom-heavy.** `padding: 12px 24px` around 16px text reserves descender space the label may not use. Use `padding-block: 12px 11px`.
3. **Right-aligned tabular numbers sit inset.** A tabular figure carries symmetric sidebearings. Right-align a rating under a right-aligned label and the number reads ~0.06em further left than the label. In the ladder, right-align on the numeral column and pull the rating `margin-right: -0.04em`, or align both to the same optical edge.
4. **Round and pointed glyphs need overhang.** `O`, `C`, `0`, `A`, `V` should overhang a shared left edge by roughly 1.5% of their size. Relevant on the profile where a handle set in `--t-display-1` sits above a rating in `--t-num-hero`.
5. **CJK next to Latin at the same `font-size` is 29% too big.** Measured: Archivo cap-height 0.686em, Zen Kaku `日` visual height 0.885em. This is the biggest optical error in the product because the world select puts them on the same line. Tokens are in §1.5.

### 2.9 Why most dark UIs fail - the short list

- They invert a light palette. Mid-greys land at the wrong lightness, every border disappears, and the shadows are still there doing nothing.
- They use pure `#000000`, so there is no lightness *below* the canvas to build a void with, and no hue for the eye to read depth against.
- They keep drop shadows. On dark, a shadow is a slightly-darker dark: invisible. (The system already bans this. Credit where due.)
- They run accents at full chroma at 12–14px and get halation.
- They give up on borders because borders "look heavy", and end up with floating text on an undifferentiated field - which is exactly the failure mode this build is closest to (§6).
- They animate the glow. Breathing glows are the loudest possible statement that the atmosphere is a CSS effect rather than a place.

---

## 3. Layout and spacing - what "generous" actually means numerically

### 3.1 Measure scales inversely with size

A single 65ch rule is wrong for a product whose most important sentence is set at 30–40px. 65ch at 40px is a 1600px line. The scale is in §1.5; restated:

| Size | Measure | Why |
|---|---|---|
| 14px metadata | 74ch | small text tolerates more characters per line |
| 16px body | **66ch** | the classic figure, and the only one most guides give |
| 18px `--t-body-lg` (DUEL brief) | 58ch | |
| 24px title | 42ch | |
| 30–40px `--t-display-3` (the verdict sentence) | **34ch** | this is the product's most important string; it must be readable in one or two saccades |
| 52–96px display | 22ch | at this size the line is a shape, not a sentence |

### 3.2 Section rhythm and the proximity ratio

The system's §7.4 already specifies 96–128px between sections on world surfaces and 24–48px on instrument surfaces. That is right. What is missing is the rule that actually determines whether spacing reads as *composed* or as *empty*:

> **Related : unrelated must be at least 1 : 2.5, and 1 : 3 is better. Whichever direction the eye travels.**

Concretely, in an 8px system:

| Relationship | Gap | Ratio to the next tier up |
|---|---|---|
| Label → its field | 8px | — |
| Field → its helper/counter | 8px | — |
| Field group → next field group | 24px | 3× |
| Sub-section → sub-section | 48px | 2× |
| Section → section (instrument) | 48px | — |
| Section → section (world) | 96px / 128px | 2–2.7× |

The live world select violates this in the horizontal direction, badly, and it is the reason the screen reads as a spreadsheet rather than a composition: the horizontal gap between `日本` and `Japanese` (two parts of the *same* item) is roughly **560px**, while the vertical gap between one world row and the next (two *different* items) is about **100px**. The ratio is inverted 5.6:1 in the wrong direction. The fix is not more space; it is putting the two halves of one item within 8px of each other.

### 3.3 Grid, so that "centred" stops meaning "floating"

All three live screens are a ~620px column centred in a 1440px viewport with roughly 410px of nothing on each side. That is not generosity; it is an absent composition. `design-taste-frontend` §4.3's anti-centre bias exists for exactly this.

```css
--grid-max: 1200px;
--grid-cols: 12;
--gutter: 24px;
```

- **World surfaces:** type block in columns 2–7, the sky and the celestial body doing real work in 8–12. Asymmetric, as §6.1 of the design system already specifies ("the orrery sits low and right, the type block sits left and above the horizon line"). The empty right half is only empty because the orrery is not built yet.
- **Instrument surfaces (ladder, profile):** full 12 columns, `--grid-max` 1200, because density is the point.
- **The match screen** is the one legitimate exception: single centred column, `max-width: 62ch`. Under time pressure symmetry is legibility. Keep it - but see §6 for the alignment bug inside it.

### 3.4 Surviving 375px without becoming empty

Generosity on a phone is **vertical and typographic**, never horizontal. The common mistake is to keep 32–48px gutters on mobile, which eats 17–26% of a 375px viewport and makes the content column feel starved rather than spacious.

| Property | 375px | 390–430px | ≥768px | ≥1024px |
|---|---|---|---|---|
| Horizontal gutter | **20px** | 24px | 40px | 64px, then `--grid-max` |
| Prose max-width | 100% − gutters | " | 640px | 640px |
| Section rhythm, world | **56px** | 64px | 96px | 128px |
| Section rhythm, instrument | **32px** | 32px | 40px | 48px |
| Body size | 16px (never lower) | 16px | 16px | 16px |
| Smallest permitted text | **13px** (`--t-label`) | " | " | " |

Then the rule that actually does the work:

> **On a small viewport, exactly one element per screen is allowed to be big. Everything else gets small and tight.**

Emptiness reads as unfinished when *everything* is medium. It reads as confidence when one thing is 15vw and the rest is 13–16px sitting close together. On world select that one element is the native script (`日本` at `clamp(3rem, 15vw, 4.5rem)`). On the match screen it is the FORGE glyph or the brief. On the verdict it is the verdict sentence. Nothing else on those screens should exceed 20px.

Two more, both currently violated (§6): a 12px string is not permitted anywhere, and a fixed 36px display size on a phone is a scale that was never designed - everything display-tier must be `clamp()`.

---

## 4. UX copy under show-don't-tell

### 4.1 Banned vocabulary

Hard-banned in all user-visible strings. If any of these ship, the theme has been said out loud, and saying it is what makes it a costume.

**Celestial / space nouns:** space, galaxy, galactic, cosmos, cosmic, universe, universal (in the "vast" sense), star (except the literal earned item in the constellation, which is the one intentional exception), stellar, constellation *as marketing language*, planet, planetary, moon, lunar, solar, orbit, orbital, nebula, void, celestial, astral, interstellar, meteor, comet, asteroid, satellite, station, module, deck, airlock, cockpit, capsule, gravity, zero-g, atmosphere *as a word* (it may be a visual, never a label), stratosphere, sky *as a label outside the constellation view*.

**Voyage / expedition verbs:** launch, liftoff, blast off, embark, voyage, journey, expedition, explore, discover *(in the wanderlust sense)*, navigate, chart, chart a course, set course, traverse, ascend/ascension *as a CTA*, dive, warp, beam, dock, land, touch down.

**Sci-fi furniture:** commander, captain, pilot, crew *(use "crew" only if it is the literal product term for a group; if it is, never dress it)*, mission, mission control, transmission, signal *(except `--signal-*` internal tokens)*, beacon, telemetry, coordinates, sector, quadrant, frontier, horizon *as a label*.

**Plus the register bans already in the design system**, restated because they are the same failure: no `Oops`, `Almost!`, `Nice job!`, `Great work!`, `Incorrect`, `You failed`; no exclamation marks anywhere; **zero em-dashes and zero en-dashes** (`design-taste-frontend` §9.G); no "Elevate", "Seamless", "Unleash", "Next-Gen"; no scroll cues; no cutesy diminutives.

**The test:** if a string would still make sense in a bank's app, it may be too corporate. If it would make sense in a sci-fi game, it is banned. The correct register sits in between: **plain nouns, present tense, short clauses, and one beat of rhythm.**

### 4.2 How the atmosphere is carried instead

Four devices, none of which name anything:

1. **Rhythm.** Two short clauses, the second shorter than the first. `Kenji answered. Your move.` The pause is the atmosphere.
2. **Concrete physical nouns that are not celestial.** *air, light, edge, line, weather, distance, ground, quiet, thin.* These do all the work "cosmic" would do and none of the damage.
3. **Present tense and third person for the world; second person only for the user's own action.** The world reports; it does not address you.
4. **Understatement at the emotional peak.** The bigger the moment, the fewer the words. A band crossing gets three words, not a sentence.

### 4.3 Rewrite table

Eight strings this product actually needs. **Corporate** = the safe default. **Try-hard** = what the theme produces if it is allowed to speak. **Correct** = what ships.

| # | Situation | Corporate | Try-hard themed | **Correct** |
|---|---|---|---|---|
| 1 | Entering a world for the first time (CTA) | `Get started` | `Launch into Japanese` / `Begin your voyage` | **`Begin`** |
| 2 | Entering a world you have played (CTA + state line) | `Continue learning` · `Resume your session` | `Return to the station` · `Re-enter orbit` | **`Enter`** · `Kenji answered. Your move.` |
| 3 | Waiting for an opponent to be matched | `Finding an opponent…` | `Scanning the sector for a challenger…` | **`Looking for someone at your level.`** *(then, after 8s)* `Still looking. This one is taking a while.` |
| 4 | Waiting for a judged verdict | `Processing your submission. Please wait.` | `Your transmission is being received…` | **`Reading both answers.`** |
| 5 | Rating frozen during judge calibration | `Rating updates are temporarily disabled while we recalibrate our scoring model.` | `The stars are still settling. Your altitude holds.` | **`Ratings are held while the judge is being checked. This match still counts toward your record.`** |
| 6 | Verdict where the model cannot separate the two answers (position-inconsistent) | `Unable to determine a winner. Inconclusive result.` | `The two paths diverge and neither is brighter.` | **`Read in both orders, the judge picked a different answer each time. That means these are too close to separate. Nobody moves.`** |
| 7 | Empty ladder (no crew yet) | `No data available.` | `No one has climbed here yet. Be the first to reach the summit.` | **`No crew yet. Join one, or start one and invite two people.`** |
| 8 | Empty ladder (scope has results, you are unplaced) | `You are not currently ranked.` | `You have not yet found your altitude.` | **`Three more matches and you get a number.`** |
| 9 | Losing a match, delta line | `−14 points. Better luck next time!` | `You have drifted down. The air thickens.` | **`1 412 → 1 398`** *(the delta is the sentence; no prose at all)* |
| 10 | Reaching a band for the first time | `Congratulations! You've reached Level 4!` | `You have broken through the cloud deck into the long light.` | **`Above the Deck.`** *(three words, full screen, once)* |
| 11 | Submission rejected by the server | `Error: submission failed.` | `Your signal was lost.` | **`That answer was over 30 characters, so it was not scored. Shorten it and lock it in again.`** *(state which rule, and the way out - `design:ux-copy`)* |
| 12 | Push notification | `Don't lose your streak! Practice now 🔥` | `Your world awaits your return.` | **`Season 1 ends in six hours. You are 40 points from Ridge.`** |

Rows 5, 6, 7 and 11 are the ones worth reading twice. Row 6 in particular: the honest explanation of a position-inconsistent judge is *more* atmospheric than any metaphor, because it treats the reader as someone who can handle a real reason. Row 9 is the thesis - at the emotional low point the product says nothing at all, and that restraint is the entire brand.

---

## 5. Three ladders, three identities, no icons

The constraint is real: the system bans icon-heavy UI and the world select is specified with zero icons. It also bans a per-ladder colour, because colour encodes place (world) and earned-state (gold) and nothing else. So the available channels are **type, spacing, line and motion** - and the width axis introduced in §1 gives a fourth for free.

The system: **each ladder owns one point on the width axis, one dominant line direction, and one motion vector. No ladder may borrow another's.**

| | **DUEL** - dynamic | **FORGE** - structured | **RECALL** - reflective |
|---|---|---|---|
| Width posture | `wdth 112` - widest | `wdth 100` - normal | `wdth 88` - narrowest |
| Weight | 600 | 500 | 400 |
| Tracking | −0.02em, tight | 0 | +0.01em, open |
| Dominant line | **None.** No rules at all. Structure comes from an off-axis 7/5 column split with a hard edge. | **Horizontal.** A visible 24px module: hairlines at a fixed rhythm the eye can feel. The only surface with a perceptible baseline grid. | **One vertical rule**, full height, at the left of the content. A listening axis. No horizontal rules anywhere. |
| Composition | Asymmetric, two unequal columns, content pushed to the outer edges | Strictly centred on one axis, single column, one glyph | Single column, indented from the vertical rule, wide left margin |
| Measure / leading | 34ch / 1.45 - short, punchy | one glyph / 1.15 | 62ch / **1.75** - the only loose leading in the product |
| Motion vector | **X.** The only entrances in the product that come from the side (`translateX(20px)`), `--ease-out-expo`, `--dur-base` | **Y, quantised.** Everything enters on the same 24px step, staggered 40ms, `--ease-standard` - no overshoot, machine-like | **None.** Opacity only. `--dur-ignite` (900ms) instead of `--dur-base`. Nothing arrives quickly. |
| Section rhythm | 32px - compressed | 24px - modular | 64px - sparse |
| Verdict beat timing | beats at 700ms (spec default) | beats at 700ms | beats at **900ms** |

Why this works without a single drawn mark:

- **You can feel it before you read it.** Wide-and-heavy vs normal-and-modular vs narrow-and-airy is legible at a glance from across a room, and it survives at 375px where an icon would be 16px of mush.
- **It is the same argument as the product.** DUEL is a confrontation, so it is composed as two opposed masses. FORGE is drilling, so it is a grid you can count. RECALL is listening, so it has a long left margin and it will not hurry.
- **It costs zero bytes.** All three postures are instances of one variable font already loaded.
- **It cannot leak into the world hue or the earned gold**, so the colour locks stay intact.
- **It degrades correctly.** Under `prefers-reduced-motion` the motion vectors collapse but width, leading, rhythm and line direction survive - so the identities are still fully legible with all animation off. That is the test that separates a real system from a set of transitions.

Naming rule that follows: since the ladders now have visual voices, they must **never** be labelled with a coloured chip, a badge, a letter mark, or an ordinal. On the world page they are three rows with three different postures and nothing else. If a user needs a legend, the system failed.

---

## 6. Critique of what is live

Captured 2026-08-09 against `localhost:3000` at 1440×900 and 375×812. Files in `/private/tmp/loxe-taste/`.

### What already works, genuinely

- **The colour system holds up under measurement.** Every text/canvas pair I sampled passes: 15.60 for `--ink-900` on canvas, 6.07 for secondary, 4.53 for tertiary. No failures. That is unusual for a dark build and it is the design system doing its job.
- **No pure white, no pure black.** `#E8EBF7` on `#0D1226`. Correct call, and it is why the type does not bloom.
- **The verdict panels are honestly equal in width and surface.** No podium, no elevation on the opponent's card. The hardest structural rule in the system survived contact with implementation.
- **`Rematch` is demoted to a bare text link** while `Ask about this` and `Next match` are pills. The pedagogy is in the button hierarchy exactly as specified.
- **The star field is density-graded, not uniform** (`y` weighted by `next() * next()`, `sky-layer.tsx`). Real skies are mostly empty. Almost every AI-built starfield is uniform. This one is not, and nobody would notice - which is the point.
- **The timer is a 2px bar with no pulse.** Restraint under pressure, as specified.
- **The comment block above `:root, [data-world]` in `tokens.css`** explaining why the altitude derivations must resolve at `:root` - failing to ground level rather than to Meridian - is the best piece of design reasoning in the codebase. Keep that discipline.
- **The copy register is already close.** `Not a student. Ranked.` is the right voice: two clauses, second shorter, no adjectives, zero space vocabulary. `A bad day in one is not a bad day.` is better than that.

### What reads as generic, unsparingly

**1. There is no atmosphere. The brief's core promise is not on screen.**
`--haze-color` is `#141A33`, which is `--ink-200` - the surface token. Painting the sky's haze in a colour 1.08:1 from the canvas means that at `--altitude: 0`, with haze opacity at 0.94, the atmospheric system produces a barely-perceptible smudge. All four screenshots read as a flat near-black rectangle. Everything downstream - depth, altitude, the whole "you are standing in it" thesis - is invisible. Fix in §2.5. This is the highest-leverage change in the entire report.

**2. The type scale is not wired up. Every display element ships at weight 400 with zero tracking.**
Measured computed styles on the live world select:

| String | rendered | spec says |
|---|---|---|
| `Not a student. Ranked.` | 48px / **400** / tracking `normal` | `--t-display-1`: clamp → 96px at 1440 / **600** / **−0.035em** |
| `日本` | 36px / 400 / line-height **1.0** | display tier / CJK leading **1.15** |
| `Español` | 36px / 400 / tracking normal | same tier as `日本` |
| `The Cloud Sea` | **12px** | not in the scale at all - the floor is 13px `--t-label` |

Two consequences. First, the page reads thin and unauthored, because a 48px headline at weight 400 with default tracking is what a browser does when nobody made a decision. Second, **weight 600 is not available in the free Clash Display release** (measured: `document.fonts.check('600 …')` → `false`), so the specified scale was never achievable. This is not sloppiness downstream of a good spec; the spec named a face that cannot execute it.

**3. World select is a spreadsheet with the two halves of each item at opposite ends of the screen.**
`日本` is flush left; `Japanese` and `The Cloud Sea` are flush right, ~560px away. Row-to-row spacing is ~100px. Related items are 5.6× further apart than unrelated ones. Add a hairline under **every** row (7 of them, including the last) and you have the exact pattern `design-taste-frontend` §9.F bans and the design system's own §6.6 bans ("dividers are sparse: one hairline every 5 rows"). It reads as a settings list, not as a choice between places.

Compounding it: **no world hue appears anywhere.** Six worlds, six carefully validated `atmos` hues in the tokens, and the screen renders all seven rows in identical `--ink-900` / `--ink-700` / `--ink-650`. The single most atmospheric affordance the system owns is switched off. On 375px it is worse - `The Celadon Coast` is 12px of dim blue-grey, and the two halves of each row are still hard against opposite gutters.

**4. There is a grey dot in the middle of the page.**
`sky-layer.tsx` layer 3 renders the celestial body as a `100dvh` square scaled by `--body-scale`, which is `0.04` at altitude 0 - a ~36px disc. On the world-select route there is no `[data-world]`, so `--world-atmos` is unset and it falls back to `--ink-800` `#B9C1DC`. Result: a flat light-grey circle floating over the content at the bottom of the desktop page and **directly between `Español` and `Français` at 375px**. It reads as a loading spinner or a rendering artifact. The design system's band table says Valley Floor's celestial body is "**Not visible**" - so the correct implementation is `opacity: 0` below band 2, not `scale(0.04)`.

**5. The three ladders are three identical rows.**
`src/app/w/[world]/page.tsx` defines DUEL / RECALL / FORGE as three objects in one array rendered through one template: same size, same weight, same `Unrated` right-aligned, same hairline. This is the exact "three identical cards in a row" failure the system bans in §8.1, in list form. §5 above is the proposed fix.

**6. The world page has a 280px hole in the middle of it.**
`日本` ends at roughly y=210; `Three ladders. Three ratings.` starts at roughly y=480. Nothing in between. That is not generous spacing, it is a missing element - the sky, the altitude, the rating. Meanwhile the `h2` (`Three ladders…`) is rendered at body size in muted grey, so the semantic hierarchy and the visual hierarchy disagree.

**7. The match screen has an alignment bug that reads as a mistake.**
The eyebrow, the brief and the input group are centred. `Lock in answer` is flush left under a centred stack. Pick one. (I would left-align the whole response group and keep only the task centred - but not this.) Two more on the same screen: the brief is centred body copy over three ragged lines with no `text-wrap: balance`, which costs real reading speed under a clock; and the textarea is ~155px tall for a **30-character** answer, so the affordance promises an essay while the constraint asks for a sentence. Size the field to the constraint.

Also: the vertical rhythm is flat. Eyebrow→brief is ~50px; brief→label is ~55px. The task zone and the response zone are separated by the same distance as the parts within them, so they do not read as two things (§3.2).

**8. The verdict screen is missing its own thesis and has no primary action.**
The design system says the verdict sentence is the largest type on the page and the reason the screen exists. On the live screen there is no verdict sentence at all. In its place, right-aligned, small, in `--ink-700`: *"Ratings are frozen while the judge is being calibrated, so this match was judged but moved no number."* Rewrite in §4.3 row 5.

And the two panels are not actually equal in weight, despite being equal in width: the left header is the single word `You`; the right is `Satoru · 940 BOT` plus a persona line. Three pieces of chrome against one. The opponent's card is heavier, which is the podium the system was trying to avoid - reintroduced through content rather than through styling.

Finally: `Ask about this`, `Next match` and `Rematch` - no gold fill anywhere, so **there is no primary action**. The spec's primary (`Add 〜てしまった to Trials`) is absent, which means the one screen designed to convert a loss into ownership currently offers three ways to leave and none to own.

**9. The error copy names two possible causes and commits to neither.**
Live string: *"The answer was not accepted." / "The server did not accept that answer. An empty answer, or one past the stated limit, is refused rather than scored."* The first sentence restates the heading; the second lists two hypotheses and leaves the user to guess. `design:ux-copy`: what happened + why + how to fix. Rewrite in §4.3 row 11.

**10. The font stack advertises three faces nobody has licensed.**
Computed `font-family` on the live page resolves first to `Söhne`, `Söhne Breit` and `Alibaba PuHuiTi 3.0` - none loaded. The Latin fall-through to Clash/Satoshi works. The Mandarin one does not: `中文` falls through to **Noto Sans SC**, the *body* face, at 36px display size. Either license and self-host PuHuiTi or set Mandarin display in Noto Sans SC 700 on purpose.

### Severity order

| | Issue | Effort |
|---|---|---|
| P0 | Haze colour - the atmosphere is invisible (§2.5) | one line |
| P0 | Display type ships at 400/no tracking; spec weight unavailable in the current font (§1, §6.2) | font swap + token wiring |
| P0 | Verdict sentence absent; no primary action on the verdict (§6.8) | |
| P1 | Grey celestial disc rendering over content at altitude 0 (§6.4) | opacity gate |
| P1 | World select proximity inversion + hairline-per-row + no world hue (§6.3) | recompose |
| P1 | Three ladders visually identical (§6.5, §5) | |
| P2 | Match screen alignment, textarea size, flat rhythm (§6.7) | |
| P2 | Error and frozen-rating copy (§4.3 rows 5, 11) | |
| P2 | 12px string; fixed 36px display size on mobile (§3.4) | |
| P3 | Unlicensed faces first in the stack; Mandarin display falls to a body face (§6.10) | |

---

## 7. Anti-patterns specific to this brief

What turns a celestial product into AI slop, concretely.

### 7.1 Named gradients that are instant tells

- `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` - the single most-generated gradient in existence.
- The `#0f0c29 → #302b63 → #24243e` "cosmic" preset and its siblings.
- Three or four `filter: blur(120px)` colour blobs positioned in the corners at 30–40% opacity ("aurora mesh"). This is the current default for every dark AI landing page.
- Any `background-clip: text` gradient headline (already banned; it is worth restating that it is *doubly* wrong here because gold means earned).
- `box-shadow: 0 0 40px rgba(139, 92, 246, .45)` on a button, or any `0 0` spread glow on an interactive element. Glow in this product comes from a body with a position; a button does not emit light.
- Any gradient whose final stop is the keyword `transparent` (§2.6).

**Note the local hazard:** Japanese's world hue `#D3C7FF` is a periwinkle violet. The design system already flags this (§11, judgment call 10) and permits it only as one world's atmosphere. That is right - but it means a violet radial glow will exist in the codebase, and the distance between "Japanese world atmosphere" and "AI purple mesh gradient" is one careless reuse. Enforce mechanically: `--world-ja-atmos` may appear only inside `SkyLayer` and the world chip. Never in a `box-shadow`, never on a button, never on a second element in the same viewport.

### 7.2 Compositions that are tells

- Centred H1 with a glowing orb directly behind it. This is *the* generated cosmic hero.
- A 3-column grid of `backdrop-blur` cards with 1px violet borders.
- **A decorative connected-dots "constellation" SVG in the background.** This is the most dangerous one for this product specifically: LoxeLingo has a *real* constellation that encodes real mastery data. A decorative one anywhere else would retroactively turn the real one into wallpaper. Zero connected-dot backgrounds, ever.
- A ringed planet in the bottom-right corner at 20% opacity.
- Twinkling stars (`@keyframes twinkle`). Already banned in §4.4 - it is banned because it is the tell.
- Star layers parallaxing on scroll at different speeds. The system's 6px pointer parallax is restrained and correct; scroll-linked multi-layer starfields are screensaver grammar.
- `text-shadow: 0 0 20px currentColor` on a heading.
- A tiled starfield PNG.
- Full-screen `radial-gradient` vignettes used to fake depth on an otherwise flat page. (Related: the current build has essentially only a vignette, which is why it reads flat - the answer is real atmosphere, not a stronger vignette.)

### 7.3 Why these read as machine-made

Three underlying failures, each of which generates dozens of surface symptoms:

1. **Glow without a source.** Machine-generated scenes light everything, because each element was styled independently. Real scenes have one light and everything agrees with it: rim lights on one side, haze denser away from it, shadows pointing consistently. The single most effective check on any screen in this product: *point at where the light is coming from.* If you cannot, it is decoration.
2. **Saturation substituted for lightness structure.** Slop reaches for hue (purple! teal!) on a flat `#0a0a0a`, because hue is cheap and a lightness ramp is work. Premium dark is a lightness structure first - a canvas, two or three surfaces, a void below the canvas - and hue second, at low chroma, on top of it. This product already has the ramp; it just is not using it for atmosphere yet (§2.5).
3. **Uniformity.** Uniform star density, uniform card sizes, uniform hairlines on every row, uniform section padding, uniform rim light across the full width, uniform 400 weight. Every one of those is present somewhere in the current build, and each one individually is defensible. Together they are the signature. **Variation that follows a rule is design; variation that follows no rule is noise; no variation at all is generated output.**

### 7.4 The two-altitude reflex check (`impeccable`)

- **First-order:** could someone guess this palette and theme from "competitive language app"? No - the category reflex is green, gamified, mascot. The system is already clear of it.
- **Second-order:** could someone guess it from "competitive language app that is *not* Duolingo"? This is where the risk lives. The anti-Duolingo reflex lands on exactly one place: **dark indigo, glassmorphism, thin geometric sans, purple-violet glow, constellation motif.** That is where a large fraction of "serious alternative to a gamified app" concepts land, and it is roughly where this system is standing.

What keeps it clear, and what must be defended:

- **Rose-gold as the win colour instead of green or violet.** This is the design system's best decision and its strongest defence against the second-order reflex. Nothing in the anti-Duolingo cluster is warm.
- **Slate-blue loss, red reserved for system failure.** Also unusual, also load-bearing.
- **Glass used exactly twice.** Defend the count.
- **A wide engineered grotesque rather than a thin geometric sans** (§1). "Thin geometric sans on dark" is the reflex; wide-and-engineered is not.
- **Dusk as a real second theme.** A dark-only cosmic product is the reflex. A product with a saturated warm-rose light theme is not.

The remaining exposure is the violet. Keep it inside one world's sky and it is honest; let it out and the whole system collapses into the exact family it was designed to escape.

---

## 8. Confidence and gaps

### Measured, high confidence - these are facts, not opinions

- Clash Display digit advances (0 = 70.40, 1 = 33.20 at 100px/500), ratio **2.120**, and `tnum`/`lnum` producing byte-identical output. Verified against Helvetica (1.131) and Geist Mono (1.000) controls. **Clash Display cannot render this product's ratings.**
- Clash Display free release has no weight 600.
- Satoshi digit ratio 1.000 (tabular by default, no proportional set).
- Archivo variable: `wdth 62–125` axis functional (1.92× range), tabular set correct at every tested width, proportional set present.
- Wix Madefor Display digit ratio 1.387 with no `tnum` correction.
- Archivo cap-height 0.686em; Zen Kaku `日` 0.885em; Noto Sans SC `日` 0.853em → the 0.775 / 0.805 optical factors.
- `--haze-color` = `#141A33` = `--ink-200`, ~1.08:1 against the canvas.
- Live computed styles: 48px/400/normal H1; 36px/400/lh-1.0 world names; a 12px string; contrast 15.60 / 6.07 / 4.53.
- Celestial body renders at `scale(0.04)` of a `100dvh` square with `--world-atmos` unset on the root route.
- DUEL/RECALL/FORGE rendered from one array through one template.

### Followed skill guidance directly

Contrast floors, tabular-figure mandate, touch targets, reduced-motion (`ui-ux-pro-max`, `impeccable`). Tracking floor, clamp ceiling, the one-family-in-multiple-weights rule, the ban list (`impeccable`). Em-dash ban, spec-table hairline ban, grain-on-fixed-elements, colour/shape consistency locks (`design-taste-frontend`). Pure-black ban, one-accent rule, skeleton-over-spinner (`taste-design`). Error and empty-state structure (`design:ux-copy`). The `backdrop-blur`-on-fixed-only performance rule (`high-end-visual-design`).

### Judgment calls - mine, not the skills'

1. **Replacing Satoshi as well as Clash Display, and going to one family.** Clash is disqualified on evidence. Satoshi is technically fine; I am replacing it for coherence and to get the width axis. A reasonable person could keep Satoshi for text and take Archivo only for display - that is two grotesques, which `impeccable` bans, but the ban is a heuristic and Satoshi/Archivo are different enough to argue about.
2. **Archivo over Schibsted Grotesk.** Archivo wins on the width axis, which is the whole argument. If the team finds it too plain in situ, Schibsted Grotesk display + Archivo text is the fallback, at the cost of the two-grotesque rule.
3. **Giving the two-zone dial to the width axis.** Not from any skill. It is the strongest idea in this document and it is untested at scale.
4. **The three-ladder identity system in §5** (width posture + line direction + motion vector). Entirely mine. It is a system rather than a set of decorations, which is what makes me confident in the shape, but the specific values (112/100/88, 1.45/1.15/1.75) are first-draft numbers that want a real visual pass.
5. **Moving the ladder rank column off mono to Archivo `wdth 78` tabular.** Deviates from design-system §3.5, which reserves mono for ranks. My reasoning: the rank column needs *narrow tabular*, not a terminal voice, and a mono column in a display-face row is a texture change with no meaning.
6. **The 1:2.5 (ideally 1:3) proximity ratio and the "one big element per mobile screen" rule.** Craft heuristics I hold, stated as rules so they can be checked. Not from a cited source.
7. **The specific haze value `38 48 92`.** Directionally right (roughly 2.7× the surface step, shifted toward indigo); the exact value wants a visual pass at several altitudes and both themes.
8. **The banned-vocabulary list in §4.1.** Assembled by me. It is deliberately over-inclusive; a few entries (`horizon`, `sky`, `star`) have legitimate in-product uses that the list carves out, and the carve-outs are where it will get argued.
9. **Row 6 of the rewrite table** (the position-inconsistent verdict). Explaining a judge's order-dependence to a Gen Z player in two sentences is a real bet. It might be too much information; the alternative (`Too close to separate. Nobody moves.`) is safer and less honest.
10. **Reintroducing one element of the double-bezel pattern** (§2.3, paired light-top/dark-bottom edge) after the design system rejected the pattern wholesale in §7.4. I think the wholesale rejection threw out the useful half.

### Open gaps

- **Pretendard's Hangul optical ratio is not measured.** `--cjk-optical-ko: 0.80` is an estimate. Measure it with the same `actualBoundingBoxAscent`/`Descent` method before shipping mixed Korean/Latin display lines.
- **Exact paid-licence totals.** Klim's and Grilli Type's configurators are JS-rendered and did not yield line-item prices. Verified anchors only: Klim **$60 USD/style** minimum tier with 15%/20% multi-style discounts and pageview-or-unique-user web metering; Grilli Type priced by projected unique monthly visitors in USD; Pangram Pangram **from $40 USD**. Someone should run a real cart before this becomes a budget line.
- **Archivo has not been seen at 96px next to `日本` at real size in situ.** All my pairing reasoning is from metrics plus reading specimens. It needs a rendered comparison before it is locked.
- **The orrery does not exist yet**, so the world select critique in §6 is a critique of a placeholder. The proximity and hairline findings still stand - they are composition failures independent of the orrery - but the "620px column floating in 1440px" observation will partly resolve itself once the sky occupies columns 8–12.
- **I did not see a settled verdict with real answers, a populated ladder, the constellation, the profile, or the Dusk theme.** The verdict critique is from an unsettled match (both answers empty). The verdict-sentence absence and the missing primary action are structural and would appear in any state, but the diff marking, the beat timing and the rating count-up are untested.
- **Dusk theme is entirely unaudited.** Every measurement in this document is Night. `--haze-color` in Dusk is `243 217 201` against a `#f3d9c9` canvas - which is the *same* one-step problem inverted, and probably the same fix, but I have not verified it.
- **Sound** remains unspecified, as the design system already notes. Nothing here changes that.
