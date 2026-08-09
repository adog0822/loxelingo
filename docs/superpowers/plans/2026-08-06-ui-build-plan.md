# LoxeLingo — UI/UX Build Plan

**Date:** 2026-08-06
**Design system:** `docs/design/design-system.md` (existing — refined here, not replaced)
**Discovery:** `docs/design/discovery-view-transitions.md` · `discovery-planet-render.md` · `discovery-taste.md`

---

## The governing rule

**Show, never tell.** The product feels celestial. It never says so. No space vocabulary appears in any string — no "explore", no "galaxy", no "aboard", no "voyage". A user should be unable to point at a word that announces the theme, and unable to miss the theme.

This is a testable constraint, not a mood: a grep for space vocabulary across `src/**` must come back empty, and that grep is part of the verification phase.

## Decisions locked before planning

| Decision | Choice | Why |
|---|---|---|
| Planet rendering | Procedural WebGL shaders, zero image assets | Nothing stock, nothing generated, nothing that can read as slop. And the shader can read the same `--altitude` scalar the rest of the environment uses, so **the rating literally lights the planet** rather than sitting beside it. |
| Navigation motion | React View Transitions API | Keeps every page a Server Component. A client shell would have dissolved the data layer we built the whole backend around. |
| Cards | Still banned | Depth comes from lightness steps, hairlines and background blur. Drop shadows on dark read as cheap because there is nothing for a shadow to fall on. |
| Bot voice | One authored line at the verdict, keyed to archetype; self-description on ladder select; **silence during the match** | The verdict is the moment you just lost to a character. Silence under the clock is deliberate — it is the one still moment in the product. |

## The two-zone model, inherited and unchanged

The **world** is vast, slow, atmospheric. The **instrument** — match, ladder rows, verdict tables — is precise and completely still. Atmospheric everywhere is a screensaver; instrument everywhere is a quiz app. Every screen below declares which zone it is in.

---

## Phase 0 — Discovery *(in progress)*

Three agents establishing actual APIs. **No implementation may begin until all three report**, and any finding marked UNVERIFIED that a phase depends on must be resolved first.

1. **View Transitions** — whether `<ViewTransition>` is genuinely usable on the installed React 19.2.8, the Next 16 config flag, `addTransitionType`, shared-element naming, browser support and fallback behaviour.
2. **Planet rendering** — library choice and real bundle cost, how to get `--altitude` into a shader uniform without forcing layout every frame, the shader technique, battery and throttling, three fallback paths, and a working throwaway prototype the agent has looked at and critiqued.
3. **Taste** — typography validated or replaced (Clash/Satoshi are widely used in this exact register and may themselves be a template), premium dark-UI craft, spacing, UX copy rewrite table, and how to give three ladders distinct identities using only type, space, line and motion.

**Gate:** if `<ViewTransition>` is not usable on the installed React, the motion architecture changes and this plan is re-cut. That is the single highest-risk unknown.

---

## Phase 1 — Foundation refinements

Apply the typography decision, any token changes, and the depth primitives (lightness steps, hairline scale, blur surfaces) from discovery. Add the reduced-motion and low-end-device detection utilities the planet will need.

**Verify:** contrast ratios still pass on every palette pair; CJK still renders at display size without fallback substitution; no drop shadow appears anywhere on the Night theme.

---

## Phase 2 — The planet

A single `<World>` component: one WebGL context, procedural sphere, world hues in, `--altitude` driving light. Three fallbacks — no WebGL, reduced-motion, low-end device — each resolving to a still frame rendered from the same shader so the fallback is the same image, not a different design.

**Verify:** no context leak across mount/unmount cycles (assert context count); paused when off-screen and on `visibilitychange`; a forced-fallback render is visually continuous with the live one; frame cost measured, not assumed.

**Anti-patterns:** uniform bloom, lens flares, purple-cyan gradients, a perfectly smooth sphere with no surface variation. Each of those is what "AI space art" looks like, and any of them undoes the entire reason for going procedural.

---

## Phase 3 — World select

The home screen. Worlds in motion, subtle parallax, native script dominant over the Latin name. Locked worlds are legible as *not yet* without a padlock or a "coming soon" badge.

**Zone:** world. **Verify:** first match still reachable in under 60s from cold load; no layout shift as planets initialise; keyboard navigable; the six-worlds-on-screen WebGL context question resolved per discovery.

---

## Phase 4 — Descent (View Transitions)

The tapped planet becomes the world you land in. Directional: forward descends, back rises. Every page stays a Server Component.

**Verify:** works in Chrome and Safari; degrades to a clean cut in Firefox with no error; reduced-motion path preserves meaning rather than disabling everything; no transition waits visibly on database work.

---

## Phase 5 — Ladder select

DUEL, FORGE, RECALL as three distinct identities expressed **only** through type, spacing, line and motion — no icons, no illustrations. Bots appear here with their authored self-description, so you know who you are about to face.

**Zone:** transitional — atmospheric background, instrument foreground.

---

## Phase 6 — Prompt

Already largely built. Bring it to the new system: the world visibly freezes, haze thickens one step, nothing moves except the clock. **Zone: instrument.**

**Verify:** grep proves no animation runs during a timed prompt except the timer; the constraint line remains one of only two eyebrows in the entire product.

---

## Phase 7 — Verdict

The reveal. Five beats at 700ms. Haze parts. Both answers at equal weight — not a podium. The reason is the largest type on screen, larger than the rating delta. Rating moves last, small, bottom-right. **The bot's one line lands here**, keyed to its archetype rung.

**Verify:** win and loss use the identical layout; reduced-motion keeps all five beats as crossfades; `positionInconsistent` names no winner; a frozen rating is explained, never blank.

---

## Phase 8 — Verification

- **The show-don't-tell grep**: no space vocabulary in any user-facing string.
- Contrast, reduced-motion, reduced-transparency, forced-colors.
- Lighthouse on mobile; measured frame cost with planets live.
- Every screen driven in a real browser with real seeded data, screenshots read back and critiqued rather than assumed.
- 424 tests still green; typecheck and build clean.
