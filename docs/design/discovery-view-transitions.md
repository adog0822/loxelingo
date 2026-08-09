# Discovery: View Transitions for LoxeLingo

Read-only API discovery. Everything below was verified against the packages installed in
this repo on 2026-08-09, or against a cited primary source. Anything not verified is
marked **UNVERIFIED**.

**Headline: `<ViewTransition>` IS usable here, with zero config changes.** No
`next.config.ts` flag, no `react@canary` install, no tsconfig edit. The reason is
non-obvious and is documented in §2.

---

## 1. Sources consulted

### Skill (authoritative, invoked)

- `vercel-react-view-transitions` — invoked via the Skill tool.
  - `/Users/arjavmehta/.claude/skills/vercel-react-view-transitions/SKILL.md`
  - `/Users/arjavmehta/.claude/skills/vercel-react-view-transitions/references/nextjs.md`
  - `/Users/arjavmehta/.claude/skills/vercel-react-view-transitions/references/css-recipes.md`
  - `/Users/arjavmehta/.claude/skills/vercel-react-view-transitions/references/patterns.md`

> **The skill's `references/nextjs.md` is stale for Next 16.** It instructs you to set
> `experimental: { viewTransition: true }`. That config key **does not exist in Next
> 16.3.0** (see §2.2). The Next-bundled docs supersede it, per this project's `AGENTS.md`.

### Next.js 16.3.0 bundled docs (read from `node_modules`, per `AGENTS.md`)

- `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` — the primary guide
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` — `transitionTypes`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — `push`/`replace` options
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — React 19.2/canary notes
- `node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md` — cross-reference only

### Installed packages inspected directly

| Path | Finding |
|---|---|
| `package.json` | `next@16.3.0`, `react@19.2.8`, `react-dom@19.2.8`, `@types/react@^19` |
| `node_modules/react/cjs/react.production.js` | **Does NOT export `ViewTransition` or `addTransitionType`** |
| `node_modules/next/dist/compiled/react/cjs/react.production.js` | `exports.version = "19.3.0-canary-cbb046ab-20260731"`; **exports `ViewTransition` and `addTransitionType`** |
| `node_modules/next/dist/compiled/react/cjs/react.react-server.production.js` | **exports `ViewTransition`** → works in Server Components |
| `node_modules/next/dist/compiled/react-experimental/cjs/react.production.js` | `19.3.0-experimental-…`; also exports `unstable_startGestureTransition` |
| `node_modules/next/dist/lib/needs-experimental-react.js` | Full source quoted in §2.2 |
| `node_modules/next/dist/build/webpack-config.js:338` | `bundledReactChannel` selection |
| `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:24157–24352` | `startViewTransition` call site + `try/catch` fallback (§6) |
| `node_modules/@types/react/canary.d.ts:38–115` | Exact `ViewTransitionProps` interface |
| `node_modules/next/dist/types.d.ts:1–5` | `/// <reference types="react/experimental" />` |
| `node_modules/next/dist/client/app-dir/link.d.ts:183` | `transitionTypes?: string[]` |

### Live typecheck performed (probe file created, then deleted)

`npx tsc --noEmit -p tsconfig.json` against a probe using `ViewTransition`,
`addTransitionType`, object-form `enter`/`exit`, `share`, `update`, `default`, and
`style={{ viewTransitionName }}` → **exit 0, no errors.** Confirmed the probe was actually
in the program via `--listFiles` and via a deliberate-error run.

### Web sources

- MDN — [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [`view-transition-class`](https://developer.mozilla.org/en-US/docs/Web/CSS/view-transition-class)
- [caniuse: view-transitions](https://caniuse.com/view-transitions) — 90.2% global
- [Chrome for Developers — What's new in view transitions (2025 update)](https://developer.chrome.com/blog/view-transitions-in-2025)
- [web.dev — Same-document view transitions are now Baseline Newly available](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- [react.dev — `<ViewTransition>`](https://react.dev/reference/react/ViewTransition), [`addTransitionType`](https://react.dev/reference/react/addTransitionType)

### Project files read (for fit, not modified)

`src/app/page.tsx`, `src/app/w/[world]/page.tsx`, `src/lib/actions/enter-world.ts`,
`src/lib/design/worlds.ts`, `src/app/globals.css`, `src/styles/motion.css`,
`src/styles/base.css`, `docs/design/design-system.md` (§4.5, §the verdict, tokens block),
`next.config.ts`, `tsconfig.json`, `AGENTS.md`.

---

## 2. Concrete findings

### 2.1 Is `<ViewTransition>` available in React 19.2.8 as shipped here? — YES, with a caveat you must understand

**The `react@19.2.8` in `node_modules/react` does NOT have it.** Verified by enumerating
every `exports.*` in `node_modules/react/cjs/react.production.js`: there is no
`ViewTransition`, no `addTransitionType`, no `unstable_ViewTransition`. If you were
building a plain Vite/React app against this dependency, the answer would be "not
available."

**But your app code never resolves to that package.** Next's App Router aliases `react`
and `react-dom` to its own vendored copies:

```js
// node_modules/next/dist/build/webpack-config.js:338
const bundledReactChannel = needsExperimentalReact(config) ? '-experimental' : '';
// :673–674 → aliases to `next/dist/compiled/react${bundledReactChannel}`
```

With `bundledReactChannel === ''` (our case), `react` resolves to
`next/dist/compiled/react`, whose `package.json` name is `react-builtin` and whose
`exports.version` is **`19.3.0-canary-cbb046ab-20260731`**. That build exports
`ViewTransition` and `addTransitionType` in both the client bundle and the
`react-server` (RSC) bundle.

This matches the Next 16 guide verbatim:

> "View transitions work in the App Router with no configuration. The App Router uses
> React canary releases, which contain all stable React 19 changes as well as newer
> features like `ViewTransition`. You do not need to install `react@canary` yourself."
> — `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`

**Status: experimental-channel feature, shipped in the canary React that Next 16 vendors.
Not in stable React 19.2.** It is not behind a runtime flag.

**Do NOT `npm install react@canary`.** The `19.2.8` in `package.json` is correct and
should stay; changing it would not help and risks a duplicate-React hazard.

**Exact import (works in Server Components and Client Components):**

```tsx
import { ViewTransition } from 'react'
```

**Exact props** — verbatim from `node_modules/@types/react/canary.d.ts`:

```ts
type ViewTransitionClassPerType = Record<"default" | (string & {}), "none" | "auto" | (string & {})>
type ViewTransitionClass = ViewTransitionClassPerType | ViewTransitionClassPerType[string]

interface ViewTransitionProps {
  children?: ReactNode | undefined
  default?: ViewTransitionClass | undefined
  enter?:   ViewTransitionClass | undefined
  exit?:    ViewTransitionClass | undefined
  update?:  ViewTransitionClass | undefined
  share?:   ViewTransitionClass | undefined
  name?: "auto" | (string & {}) | undefined          // @default "auto"
  onEnter?:  (instance: ViewTransitionInstance, types: Array<string>) => void | (() => void)
  onExit?:   (instance: ViewTransitionInstance, types: Array<string>) => void | (() => void)
  onShare?:  (instance: ViewTransitionInstance, types: Array<string>) => void | (() => void)
  onUpdate?: (instance: ViewTransitionInstance, types: Array<string>) => void | (() => void)
  ref?: Ref<ViewTransitionInstance> | undefined
}
declare const ViewTransition: ExoticComponent<ViewTransitionProps>
```

All six of the prop names in the brief — `name`, `default`, `enter`, `exit`, `update`,
`share` — are real. There is no `className` prop despite the JSDoc in `canary.d.ts`
referencing `{@link className}` (that's a stale doc-comment link in DefinitelyTyped; the
props themselves *are* the classes).

**TypeScript needs no change.** `@types/react`'s `ViewTransition` declaration lives in
`canary.d.ts`, which is normally opt-in — but `node_modules/next/dist/types.d.ts` line 3
contains `/// <reference types="react/experimental" />`, and `react/experimental.d.ts`
imports `./canary`. `tsc --explainFiles` output:

```
node_modules/@types/react/canary.d.ts
  Imported via "./canary" from file 'node_modules/@types/react/experimental.d.ts'
node_modules/@types/react/experimental.d.ts
  Type library referenced via 'react/experimental' from file 'node_modules/next/dist/types.d.ts'
```

So the types arrive transitively through `next-env.d.ts` → `next`. Verified by a real
`tsc` run (exit 0). *If a future Next release drops that reference*, the fix is adding
`"react/canary"` to `compilerOptions.types` or a single `import {} from 'react/canary'`.

### 2.2 Does Next 16.3.0 need a config flag? — NO. `experimental.viewTransition` no longer exists.

Verified three ways:

1. `viewTransition` does not appear in `node_modules/next/dist/server/config-schema.js`
   or `config-shared.d.ts`. A full grep of `node_modules/next/dist` for `viewTransition`
   returns only minified React internals (`react-dom-server.edge.production.js`,
   `react-dom-profiling.development.js`) — no config key anywhere.
2. The experimental-React gate does not mention it:
   ```js
   // node_modules/next/dist/lib/needs-experimental-react.js — full function
   function needsExperimentalReact(config) {
       const { blockingSSR, taint, transitionIndicator, gestureTransition } = config.experimental || {};
       return Boolean(blockingSSR || taint || transitionIndicator || gestureTransition);
   }
   ```
3. `transitionTypes` is present in the **non-experimental** runtime
   (`node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js`) and is a
   plain typed prop on `LinkProps` (`node_modules/next/dist/client/app-dir/link.d.ts:183`).

**Correct `next.config.ts` for LoxeLingo: unchanged.**

```ts
// next.config.ts — no view-transition config required in Next 16.3.0
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
}

export default nextConfig
```

Adding `experimental: { viewTransition: true }` would at best be ignored and at worst
fail config-schema validation. **Do not add it.**

> Only relevant related flag: `experimental.gestureTransition` would swap the whole app
> onto `next/dist/compiled/react-experimental` (for `unstable_startGestureTransition`,
> i.e. swipe-driven scrubbed transitions). We do not need it, and turning it on changes
> the React build under the entire app. Leave it off.

### 2.3 `addTransitionType` — import, signature, and forward vs. back

```tsx
import { addTransitionType } from 'react'

function addTransitionType(type: string): void
```

Verified in `node_modules/@types/react/canary.d.ts` and present as
`exports.addTransitionType` in `next/dist/compiled/react`.

Rules (react.dev + skill):

- Must be called **inside** the `startTransition` callback that causes the update.
- Callable multiple times to stack types.
- **Types reset after each commit**, so a subsequent Suspense reveal is a *separate*
  transition that carries **no** type. Use type-maps for page enter/exit; use plain
  string props for Suspense reveals.

**Direction is not automatic — you assign it.** There is no built-in "back" detection.
From the Next guide: *"The transition type is not automatic. You decide which links are
'forward' and which are 'back' based on your app's navigation hierarchy."*

Three ways to attach types, in order of preference for this codebase:

```tsx
// (a) Server Component, zero client JS — preferred
<Link href={`/w/${id}`} transitionTypes={['nav-forward']}>…</Link>
<Link href="/"          transitionTypes={['nav-back']}>All worlds</Link>
```

```tsx
// (b) Client Component, programmatic — Next 16 accepts transitionTypes as a router option
'use client'
import { useRouter } from 'next/navigation'
const router = useRouter()
router.push(`/w/${id}`, { transitionTypes: ['nav-forward'] })
router.replace(`?sort=${s}`, { transitionTypes: ['nav-back'] })
```
> `router.push(href, { scroll, transitionTypes })` and `router.replace(href, { scroll, transitionTypes })` — verbatim signatures from `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:44–45`.

```tsx
// (c) Client Component, raw — for non-link triggers (buttons, custom handlers)
'use client'
import { startTransition, addTransitionType } from 'react'
import { useRouter } from 'next/navigation'
startTransition(() => {
  addTransitionType('nav-forward')
  router.push(`/w/${id}`)
})
```

**Hard limitation — the browser Back button and `router.back()` carry no type.**
From the Next guide: *"Browser-initiated back navigations (the back button or swipe
gestures) do not carry a transition type, so the directional slide does not play."*
The skill adds the mechanism: `popstate` is synchronous and incompatible with
`startViewTransition`. Consequence for us: our in-page "All worlds" link **must** be a
real `<Link href="/" transitionTypes={['nav-back']}>` to get the reverse animation;
hardware/browser back will fall through to `default: 'none'` (a clean cut) while the
**shared-element morph still plays**, because `share` is name-driven, not type-driven.

### 2.4 Shared-element morph — the exact mechanism

Two `<ViewTransition>` components with the **same `name`**, one unmounting and one
mounting in the same transition, form a `share` pair. React applies
`view-transition-name` to the inline style of the **nearest DOM node inside** the
component, and the browser interpolates size + position between the old and new boxes.

```tsx
// Page A
<ViewTransition name={`world-globe-${id}`} share="morph" default="none"> … </ViewTransition>
// Page B — identical name
<ViewTransition name={`world-globe-${id}`} share="morph" default="none"> … </ViewTransition>
```

**Duplicate names are an error.** react.dev: *"It's important that there's only one thing
with the same name mounted at a time in the entire app."* In development React logs:

> "There are two `<ViewTransition name=%s>` components with the same name mounted at the
> same time. This is not supported and will cause View Transitions to error."

**Scoping when six planets are on screen and one is tapped.** You do *not* need to
conditionally name the tapped one. Give every planet a name derived from its id:

```tsx
{WORLD_IDS.map((id) => <ViewTransition key={id} name={`world-globe-${id}`} …>)}
```

Six distinct names, all mounted simultaneously — legal, because the uniqueness rule is
per-name, not per-page. On navigation to `/w/ja`, only `world-globe-ja` finds a partner
on the destination, so exactly one `share` pair forms and exactly one element morphs. The
other five have no counterpart; with `default="none"` and no `exit` they animate as part
of their parent page transition rather than individually.

Watch for the reusable-component trap from the skill: if a component carrying
`name={...}` is rendered in both a list and, say, a modal at the same time, both mount and
the morph breaks. Take the `name` as a prop or hoist the named `<ViewTransition>` into the
specific consumer.

**Three gotchas that will silently kill the morph:**

1. **`default="none"` without an explicit `share`.** Straight from the Next guide:
   *"When you add `default='none'` to a named pair, keep the explicit `share`. With
   `default='none'` and no `share` prop, the pair silently stops morphing."*
2. **Manual `viewTransitionName` on the root DOM node inside a `<ViewTransition>`** —
   React's auto-generated name overrides it (skill, `patterns.md`).
3. **Destination suspends into a fallback first.** Next guide: *"The morph plays when the
   destination content renders in the same commit as the navigation, which is the case
   with prefetched (cached) pages. If the destination suspends into a fallback first, no
   pair forms, and the content animates with its enter animation instead when it
   arrives."* This is the single biggest risk for our DB-backed pages — see §2.8.

**Nesting a shared element inside a directional page transition:** the Next guide composes
exactly this (Step 1 morph + Step 3 directional page VT on the same pages), so the
combination is supported. The skill's caveat is narrower than it first reads: *nested VTs
do not fire their own `enter`/`exit` when a parent VT is entering/exiting* — but `share`
pairs still form. Per-item **staggered** enter/exit during a page navigation is what's
impossible (react#36135).

### 2.5 CSS side

**Pseudo-elements** (all four exist, all four take a name or a `.class`):

```
::view-transition-group(name | .class)       /* the container; controls duration + geometry */
::view-transition-image-pair(name | .class)  /* old + new pair; good for mid-flight blur */
::view-transition-old(name | .class)         /* outgoing snapshot */
::view-transition-new(name | .class)         /* incoming snapshot */
::view-transition                            /* the whole overlay */
::view-transition-group(*)                   /* wildcard — needed for the reduced-motion block */
```

**How `view-transition-name` relates to the React component.** React writes
`view-transition-name` into the inline style of the nearest DOM node under
`<ViewTransition>`. If you omit `name`, React generates a unique one (`name` defaults to
`"auto"`). You select by *bare name* (no dot) — e.g. `::view-transition-group(site-header)`
— and by *class* (with a dot) — e.g. `::view-transition-group(.morph)`.

**How you target a transition type from CSS — this is the part people get wrong.**
React does **not** ask you to write `:active-view-transition-type()`. React's object-form
props map a transition type to a **`view-transition-class`**, and you then select that
class with a leading dot:

```tsx
<ViewTransition enter={{ 'nav-forward': 'nav-forward', default: 'none' }} />
```
```css
::view-transition-new(.nav-forward) { /* … */ }
```

The `:active-view-transition-type(type)` selector on `:root` is the raw-browser
alternative documented on react.dev for cases where you want to style outside a specific
VT's class. Prefer the class form — it is what every Next/skill example uses, and it is
what actually ships in the vendored React.

**Copy-ready CSS block for LoxeLingo** (uses the project's existing tokens from
`docs/design/design-system.md` §motion rather than inventing new durations):

```css
/* src/styles/motion.css — append. Uses existing --dur-* / --ease-* tokens. */

/* Keep the page interactive while a transition runs. */
::view-transition { pointer-events: none; }

@keyframes loxe-vt-fade {
  from { opacity: 0; filter: blur(3px); }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes loxe-vt-slide {
  from { translate: var(--vt-slide-offset); }
  to   { translate: 0; }
}
@keyframes loxe-vt-via-blur {
  30% { filter: blur(3px); }
}

/* --- Shared-element morph: the planet becomes the world --- */
::view-transition-group(.morph)      { animation-duration: var(--dur-slow); /* 420ms */ }
::view-transition-image-pair(.morph) { animation-name: loxe-vt-via-blur; }

/* --- Directional page transition --- */
::view-transition-old(.nav-forward) {
  --vt-slide-offset: -60px;
  animation:
    var(--dur-fast) var(--ease-standard) both loxe-vt-fade reverse,
    var(--dur-slow) var(--ease-atmos)    both loxe-vt-slide reverse;
}
::view-transition-new(.nav-forward) {
  --vt-slide-offset: 60px;
  animation:
    var(--dur-base) var(--ease-standard) var(--dur-fast) both loxe-vt-fade,
    var(--dur-slow) var(--ease-atmos)    both loxe-vt-slide;
}
::view-transition-old(.nav-back) {
  --vt-slide-offset: 60px;
  animation:
    var(--dur-fast) var(--ease-standard) both loxe-vt-fade reverse,
    var(--dur-slow) var(--ease-atmos)    both loxe-vt-slide reverse;
}
::view-transition-new(.nav-back) {
  --vt-slide-offset: -60px;
  animation:
    var(--dur-base) var(--ease-standard) var(--dur-fast) both loxe-vt-fade,
    var(--dur-slow) var(--ease-atmos)    both loxe-vt-slide;
}

/* --- Suspense reveal --- */
::view-transition-old(.reveal-out) {
  animation: var(--dur-fast) var(--ease-standard) both loxe-vt-fade reverse;
}
::view-transition-new(.reveal-in) {
  animation: var(--dur-base) var(--ease-standard) var(--dur-fast) both loxe-vt-fade;
}

/* --- The sky must not slide. It is the spatial anchor. --- */
::view-transition-group(loxe-sky) { animation: none; }
::view-transition-old(loxe-sky)   { display: none; }
::view-transition-new(loxe-sky)   { animation: none; }
```

Pair the last block with `style={{ viewTransitionName: 'loxe-sky' }}` on `<SkyLayer />`'s
root element. `SkyLayer` is our persistent atmosphere; without this it gets snapshotted
into the page transition and slides with the content, which would break the "descending
into the same sky" illusion. Note `[data-glass]` uses `backdrop-filter` — the
`display: none` on the old snapshot is exactly the skill's backdrop-blur workaround and is
required for the match HUD and the sheet-over-sky if either is ever given its own name.

### 2.6 Browser support today (August 2026), and what happens without it

**We only need SAME-document transitions.** Next App Router navigations are client-side;
React calls `document.startViewTransition` directly. The `@view-transition` at-rule and
cross-document transitions are irrelevant to this architecture — do not let cross-document
support numbers scare anyone off.

| Feature | Chrome/Edge | Safari | Firefox |
|---|---|---|---|
| Same-document `document.startViewTransition()` | **111+** | **18.0+** | **144+** (143 behind a flag) |
| `view-transition-class` (what React's `enter`/`exit`/`share` classes compile to) | **137+** (Chrome DevRel) — some sources say 125+ | **18.4+** | **144+** |
| View transition **types** (`{ update, types }`, `:active-view-transition-type()`) | Yes (Chromium 125+) | Yes (18.2+) | **NO — not in Firefox's initial implementation** |
| Cross-document (`@view-transition`) — *not used by us* | Yes | No | No (expected 2026) |

Same-document view transitions became **Baseline Newly available on 2025-10-14**
([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)).
[caniuse](https://caniuse.com/view-transitions) reports **90.2% global support**.

The Firefox types gap is quoted directly by Chrome DevRel:
> "Firefox's initial implementation of same-document view transitions does not include
> view transition types."
> — [What's new in view transitions (2025 update)](https://developer.chrome.com/blog/view-transitions-in-2025)

**Practical read for LoxeLingo:** in Firefox, the shared-element **morph works** (it's
`name`-driven), and the **directional slides do not** (they're type-driven and fall back
to `default: 'none'`, i.e. a clean cut). That is an acceptable, self-consistent
degradation — the morph is the emotionally load-bearing effect and it survives.

**What happens in a browser with no support at all: a plain cut, never an error.**
This is verified at the source level, not just from docs. In
`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:24157`,
React's `startViewTransition` wraps the browser call in `try`, and the `catch` at line
24342 is:

```js
} catch (x) {
  return (
    mutationCallback(),
    layoutCallback(),
    finishedAnimation(),
    spawnedWorkCallback(),
    null
  );
}
```

If `ownerDocument.startViewTransition` is undefined (throws `TypeError`), React runs the
mutation and layout synchronously and returns `null`. The DOM updates instantly; nothing
is thrown to app code. The Next 16 guide states the same in prose:

> "Without browser support, your application works normally; the transitions do not
> animate."
> — `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`

The same source dump shows React passes `{ update, types: transitionTypes }` — the object
form. **UNVERIFIED:** whether Firefox 144's `startViewTransition` accepts the object form
and merely ignores `types`, or rejects it. If it rejects, React's `try/catch` catches it
and Firefox degrades to a plain cut for *everything*, morph included. **Verify in Firefox
before shipping.**

### 2.7 `prefers-reduced-motion` — and why a blanket disable is wrong here

Two independent things must not be conflated.

**(a) The verdict's five beats are NOT view transitions.** They are CSS transitions on
`[data-verdict-beat]`, already handled at `src/styles/base.css:157–160`:

```css
[data-verdict-beat] {
  transition: opacity var(--dur-beat) var(--ease-standard) !important;
  transform: none !important;
}
```

`docs/design/design-system.md` §4.5 is explicit: *"Same five beats, same 700ms offsets,
crossfade instead of translate. The emotional pacing is preserved; only the movement is
removed."* View-transition work must not touch this rule and must not shorten
`--dur-beat`.

**(b) The existing global reduced-motion reset does NOT cover view transitions.**
`src/styles/base.css:148–155` uses `*, *::before, *::after`. View-transition
pseudo-elements live in a separate pseudo-element tree rooted at `::view-transition` on
the document root; `*` does not match them. So a dedicated block is required. *(High
confidence from the spec's pseudo-element tree model; not runtime-tested — worth a
30-second check in DevTools.)*

The skill's recipe (`animation-duration: 0s !important` on `*` selectors) is the blunt
version and would remove the world-entry crossfade entirely. Design-system §4.5 asks for
**"World entry dive → 180ms crossfade"**, i.e. `--dur-fast`, not zero. Use this instead:

```css
/* src/styles/motion.css — append. Keeps opacity, removes translation. */
@media (prefers-reduced-motion: reduce) {
  /* Kill positional motion only. */
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-name: loxe-vt-fade !important;
    animation-duration: var(--dur-fast) !important;   /* 180ms, per §4.5 */
    animation-delay: 0s !important;
  }
  ::view-transition-old(*) { animation-direction: reverse !important; }

  /* The morph's geometry interpolation IS positional motion. Cut it to a crossfade. */
  ::view-transition-group(*) {
    animation-duration: var(--dur-fast) !important;
    animation-delay: 0s !important;
  }
  ::view-transition-image-pair(.morph) { animation-name: none !important; }
}
```

Note that `loxe-vt-fade` includes a `blur()` — if motion sensitivity testing objects to
the blur, split it into `loxe-vt-fade-plain` (opacity only) for the reduced-motion path.
`--dur-fast` is `180ms`, exactly what §4.5 specifies for the world-entry dive.

### 2.8 Server Components, streaming, and Suspense — does the transition wait for data?

**Yes, it waits.** react.dev, `<ViewTransition>` reference:

> "React waits for data and new CSS (`<link rel="stylesheet" precedence="...">`) before
> running the animation. In addition to this, ViewTransitions also wait up to 500ms for
> new fonts to load before starting the animation to avoid them flickering in later."

The 500ms is real and I found the constant:
`SUSPENSEY_FONT_AND_IMAGE_TIMEOUT = 500` at
`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:29986`,
used in a `Promise.race([Promise.all(blockingPromises), setTimeout(resolve, 500)])` inside
the `update` callback. The same block also blocks on in-viewport images that haven't
loaded (subject to a byte budget), which matters for our globe art.

**What the user sees during the wait — two cases, and this is the whole ballgame for us:**

| Case | What happens | Morph? |
|---|---|---|
| Destination is prefetched / resolves in the same commit | Old page stays fully visible and interactive; then one snapshot → one animation → new page | **Yes** |
| Destination suspends and there IS a `<Suspense>` / `loading.tsx` boundary | Transition commits to the **fallback** first (animation #1: old page → skeleton). When data arrives, a **second, separate** transition runs (animation #2: skeleton → content), carrying **no transition type** | **No** — the Next guide: *"If the destination suspends into a fallback first, no pair forms, and the content animates with its enter animation instead when it arrives."* |
| Destination suspends and there is **no** boundary | React holds the old UI (transitions don't block the current page) until the tree is ready, then animates once | Yes, but the delay is unbounded and reads as "the tap didn't work" |

**This has a direct consequence for the LoxeLingo home → world navigation.** There are
currently **no `loading.tsx` files anywhere in `src/`** (verified by `find`), and
`src/app/w/[world]/page.tsx` `await`s `getSessionState()`. If that awaits a real DB round
trip on a cold navigation, the morph will not play — you get the two-stage
fallback-then-content path instead, or a stall. To make the descent feel like a descent:

1. **Prefetch aggressively.** `<Link>` prefetches on viewport entry by default; the six
   world links are all above the fold, so the world page shell should already be in the
   client cache before the tap.
2. **Do not add a `loading.tsx` at `src/app/w/[world]/`** if you want the morph on the
   *shell*. Instead push the `<Suspense>` boundary *inside* the page, below the globe, so
   the globe (the morph participant) renders synchronously from `WORLDS[id]` — it's static
   design data, not DB data — while the ratings stream in underneath.
3. Give the streamed region the two-layer treatment from §3.

**Server Component compatibility is confirmed at the bundle level:**
`next/dist/compiled/react/cjs/react.react-server.production.js` exports `ViewTransition`,
so `<ViewTransition>` can be rendered directly in an `async` Server Component page. Only
`startTransition` + `addTransitionType` (pattern (c) in §2.3) require `'use client'`.
`<Link transitionTypes={...}>` works in a Server Component with no client boundary.

**Project-specific blocker you need to decide on.** `src/app/page.tsx` enters a world via
`<form action={enterWorld}>` (a Server Action that ends in `redirect('/w/${world}')`), not
via `<Link>`. Consequences:

- `transitionTypes` is a `<Link>` / `router.push` option. **A Server Action form
  submission has nowhere to put it.** So the `nav-forward` directional slide is not
  available on the app's single most important navigation, as currently written.
- **UNVERIFIED:** whether the `redirect()` navigation that follows a Server Action
  activates `<ViewTransition>` at all. React form actions do run inside a transition, so
  in principle yes — but this is the one claim in this document I could not confirm from
  either the installed source or the docs. **Test it before designing around it.**

Three options, in order of how much I'd recommend them:

- **(A) Rely on the morph alone for world entry.** The morph is `name`-driven and needs no
  transition type. "The planet you tapped becomes the world you land in" is precisely a
  `share` morph. Keep the form, keep the Server Action, add matching
  `name={`world-globe-${id}`}` on both pages. Contingent on the UNVERIFIED point above.
- **(B) Move guest provisioning out of the click path** — into `src/proxy.ts` or the
  `/w/[world]` route — and make the world tile a plain
  `<Link href={`/w/${id}`} transitionTypes={['nav-forward']}>`. Fully in the documented,
  supported path; costs an architectural change to session provisioning.
- **(C) Client wrapper**: a `'use client'` submit handler doing
  `startTransition(() => { addTransitionType('nav-forward'); formAction(fd) })`.
  **UNVERIFIED and I'd expect it to fail** — react.dev states transition types *"reset
  after each commit"*, and the Server Action round-trip plus `redirect()` almost certainly
  spans more than one commit. Do not build on this without proving it first.

The return trip (`/w/[world]` → `/`) is already a `<Link href="/">` at
`src/app/w/[world]/page.tsx:49`, so `transitionTypes={['nav-back']}` drops straight in
with no architectural cost. Do that one regardless.

---

## 3. Copy-ready snippets

### 3.1 Shared-element morph between two App Router pages (both Server Components)

```tsx
// src/app/page.tsx — world select. Six planets, six unique names.
import { ViewTransition } from 'react'
import { WORLDS, WORLD_IDS } from '@/lib/design/worlds'

export default async function Page() {
  return (
    <ul className="flex flex-col">
      {WORLD_IDS.map((id) => (
        <li key={id}>
          <form action={enterWorld}>
            <input type="hidden" name="world" value={id} />
            <button type="submit">
              {/* One name per world. Only the tapped world finds a partner
                  on the destination, so exactly one pair forms. */}
              <ViewTransition name={`world-globe-${id}`} share="morph" default="none">
                <WorldGlobe world={id} size="tile" />
              </ViewTransition>
              <ScriptText world={id} tier="display" as="span">{WORLDS[id].native}</ScriptText>
            </button>
          </form>
        </li>
      ))}
    </ul>
  )
}
```

```tsx
// src/app/w/[world]/page.tsx — destination. Identical name, different geometry.
import { ViewTransition } from 'react'

export default async function WorldPage({ params }: { params: Promise<{ world: string }> }) {
  const { world: raw } = await params
  if (!isWorldId(raw)) notFound()

  return (
    <AltitudeProvider world={raw} ladderRatings={ladderRatings} as="main">
      {/* Persistent anchor: the sky does not slide. See §2.5 CSS. */}
      <SkyLayer style={{ viewTransitionName: 'loxe-sky' }} />

      <ViewTransition name={`world-globe-${raw}`} share="morph" default="none">
        <WorldGlobe world={raw} size="hero" />
      </ViewTransition>

      {/* … ladders … */}
    </AltitudeProvider>
  )
}
```

Both sides carry `share="morph"` **and** `default="none"` — omitting `share` while keeping
`default="none"` silently kills the morph (§2.4).

### 3.2 Directional transition using transition types

Reusable wrapper (Server-Component safe — no hooks, no `'use client'`):

```tsx
// src/components/ui/directional-transition.tsx
import { ViewTransition } from 'react'

/**
 * Page-level directional wrapper. Goes in each `page.tsx`, NEVER in a layout:
 * layouts persist across navigation, so enter/exit never fire there.
 *
 * `default: 'none'` means untyped transitions (browser back, router.refresh(),
 * Suspense reveals, and Firefox — which has no view transition types) produce a
 * clean cut instead of a wrong-direction slide.
 */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      exit={{  'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
```

Tagging the navigations (Server Components, no client JS):

```tsx
// forward — descending into a ladder
<Link href={`/w/${world}/${ladder}`} transitionTypes={['nav-forward']}>…</Link>

// back — returning to the world list  (src/app/w/[world]/page.tsx:49)
<Link href="/" transitionTypes={['nav-back']}>All worlds</Link>
```

`ViewTransitionClassPerType` **requires** a `default` key — omitting it is a TS error
(`Property 'default' is missing`).

### 3.3 Two-layer pattern: directional slide + Suspense reveal, with real DB work

```tsx
// src/app/w/[world]/[ladder]/page.tsx
import { Suspense, ViewTransition } from 'react'
import { DirectionalTransition } from '@/components/ui/directional-transition'

export default async function LadderPage({ params }: { params: Promise<{ world: string; ladder: string }> }) {
  const { world, ladder } = await params

  return (
    <DirectionalTransition>
      <div>
        {/* Static, morph-participating chrome renders immediately — no await above it. */}
        <ViewTransition name={`world-globe-${world}`} share="morph" default="none">
          <WorldGlobe world={world} size="hero" />
        </ViewTransition>

        {/* DB work streams in below. Simple string props: Suspense reveals
            are a separate transition and carry NO transition type. */}
        <Suspense
          fallback={
            <ViewTransition exit="reveal-out" default="none">
              <StandingsSkeleton />
            </ViewTransition>
          }
        >
          <ViewTransition enter="reveal-in" default="none">
            <Standings world={world} ladder={ladder} />
          </ViewTransition>
        </Suspense>
      </div>
    </DirectionalTransition>
  )
}
```

The two layers do not fight because they fire at different moments (navigation vs. data
arrival) and both are pinned to `default="none"`.

### 3.4 CSS

See §2.5 for the full transition block and §2.7 for the reduced-motion block. Both are
written against the project's existing `--dur-*` / `--ease-*` tokens and belong in
`src/styles/motion.css`, which is already imported by `src/app/globals.css`.

---

## 4. Anti-patterns — things that do not exist, or are wrong here

| Don't | Why |
|---|---|
| `experimental: { viewTransition: true }` in `next.config.ts` | **The key does not exist in Next 16.3.0.** Verified against `config-schema.js` and `needs-experimental-react.js`. The skill's `references/nextjs.md` is stale here; the bundled Next 16 docs supersede it. |
| `npm install react@canary` / `react-dom@canary` | Next already vendors `19.3.0-canary` and aliases `react` to it. Installing canary risks a duplicate React and is explicitly warned against by both the skill and the Next guide. |
| Calling `document.startViewTransition()` yourself | React owns the call (it needs to coordinate the commit, wait on fonts/images/CSS, and pass `types`). Skill: *"Never call `startViewTransition` yourself."* |
| The `next-view-transitions` npm package | A React-18-era shim for when `<ViewTransition>` didn't exist. Not installed here, not needed, and would conflict with React's own coordination. Use the native component. |
| `import { unstable_ViewTransition }` or `unstable_addTransitionType` | Neither export exists. Enumerated exports are `ViewTransition` and `addTransitionType`, unprefixed. |
| Putting the directional `<ViewTransition>` in `layout.tsx` | Layouts persist across navigation, so `enter`/`exit` fire only on first mount. Worse, a layout-level VT wrapping `{children}` makes page-level VTs nested, and nested VTs never fire their own enter/exit. Put it in each `page.tsx`. |
| Omitting `default="none"` | Every VT then cross-fades on *every* transition — Suspense resolves, revalidations, unrelated navigations. Use `default="none"` everywhere and opt in explicitly. |
| `default="none"` on a named pair without `share` | Silently stops the morph (Next guide, verbatim). |
| `router.back()` for the "return to worlds" affordance | `popstate` is synchronous and cannot drive `startViewTransition`. Use `<Link href="/" transitionTypes={['nav-back']}>`. |
| `flushSync` around the state change | Skips the animation entirely. Use `startTransition`. |
| Manual `viewTransitionName` on the root DOM node *inside* a `<ViewTransition>` | React's auto-generated name overrides it. Put manual names on elements *outside* any `<ViewTransition>` (e.g. `SkyLayer`). |
| A blanket `@media (prefers-reduced-motion) { animation-duration: 0s }` on all VT pseudo-elements | Contradicts design-system §4.5, which mandates a 180ms crossfade for the world-entry dive and five preserved beats for the verdict. Use the scoped block in §2.7. |
| Assuming the global `*` reduced-motion reset in `src/styles/base.css` covers this | It does not — VT pseudo-elements are not matched by `*`. |
| Expecting the directional slide in Firefox | Firefox 144 has same-document VTs but **no transition types**. Falls through to `default: 'none'`. The morph still works. |
| Expecting `@view-transition` / cross-document transitions to matter | We never do a cross-document navigation. Chromium-only support there is irrelevant to this architecture. |

---

## 5. Confidence and gaps

### High confidence — verified against installed source or a live tool run

- `<ViewTransition>` and `addTransitionType` are available via `import … from 'react'` in
  this project, in both Server and Client Components. *(Export enumeration of
  `next/dist/compiled/react` client + `react-server` builds; live `tsc --noEmit` pass.)*
- `node_modules/react@19.2.8` on its own does **not** export them.
- No `next.config.ts` change is needed, and `experimental.viewTransition` does not exist
  in Next 16.3.0.
- Exact prop names, value types, and the `ViewTransitionClassPerType` `default`-key
  requirement.
- `addTransitionType(type: string): void`.
- `transitionTypes?: string[]` on `<Link>` and as an option to
  `router.push`/`router.replace`.
- TypeScript works with no tsconfig change, via
  `next/dist/types.d.ts → react/experimental → react/canary`. *(Confirmed with
  `tsc --explainFiles`.)*
- Unsupported browsers get a **plain cut, never a thrown error** — React `try/catch`es the
  `startViewTransition` call and falls through to a synchronous commit.
- React passes `{ update, types }` and blocks on fonts/in-viewport images with a **500ms**
  cap (`SUSPENSEY_FONT_AND_IMAGE_TIMEOUT = 500`).
- The project has **no `loading.tsx` anywhere**, and world entry goes through a Server
  Action form, not a `<Link>`.

### Medium confidence — from primary docs, not runtime-tested here

- Browser version numbers in §2.6. caniuse and Chrome DevRel **disagree on
  `view-transition-class`**: Chrome DevRel says Chrome 137+/Safari 18.4+, other sources
  and the Next guide say Chromium 125+/Safari 18.2+. Either way, all three engines support
  it in current releases; the discrepancy only matters for old-version support policy.
- Firefox 144 lacking view transition **types** (Chrome DevRel, quoted).
- A `share` pair still forms when nested inside an exiting parent VT — the Next guide
  composes Step 1 (morph) with Step 3 (directional page VT) on the same pages, but I did
  not run it.
- The global `*` reduced-motion reset not matching VT pseudo-elements (spec reasoning
  about the pseudo-element tree).

### UNVERIFIED — do not build on these without testing first

1. **Does a Server Action `redirect()` activate `<ViewTransition>` at all?** This gates
   option (A) in §2.8 and therefore gates the entire world-entry morph as the code is
   written today. **Test first, before anything else.**
2. **Does `addTransitionType` survive a Server Action round-trip + `redirect()`?**
   I expect **no** (types reset per commit). Option (C) in §2.8 is likely dead.
3. **Does Firefox 144's `startViewTransition` accept the `{ update, types }` object form
   and ignore `types`, or reject it?** If it rejects, React catches and Firefox degrades
   to a plain cut for *everything* — including the morph. Test in Firefox.
4. **Does the 500ms font-blocking window interact badly with our CJK webfonts?**
   `src/app/page.tsx` deliberately does not block on the three CJK stylesheets on the
   world-select screen. React blocks a transition up to 500ms on `document.fonts.ready`.
   Worst case is a 500ms stall on the first world entry. Measure it.
5. **Whether the morph reads correctly with the `WorldGlobe` art** — shared elements take
   raster snapshots, and a small tile scaled to a hero produces visible artifacts. The
   `.morph` mid-flight blur in §2.5 exists to hide this; if the globe is an `<svg>` or a
   CSS gradient rather than a raster, evaluate whether the blur is needed at all. (The
   skill's `text-morph` recipe is the analogous fix for text.)
6. `WorldGlobe` is referenced throughout §3 as the morph participant. **No such component
   exists in `src/components/ui/` today** — §3 snippets assume it lands as part of this
   work. `src/styles/motion.css` already reserves `@keyframes loxe-globe-spin` "Referenced
   by WorldOrrery when it lands," so the naming should be reconciled before implementation.
