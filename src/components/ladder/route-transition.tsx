import { ViewTransition } from "react";

/**
 * RouteTransition
 * docs/design/discovery-view-transitions.md §2.3, §2.4, §3.2
 * docs/design/design-system.md §4.1, §4.5
 *
 * One page becoming another, rather than one page being replaced by another.
 * A cut tells the reader the two screens are unrelated documents. A descent
 * tells them the ladder is inside the world, which is the fact the whole
 * altitude system is built on.
 *
 * `<ViewTransition>` comes from the React canary that Next 16 vendors, so this
 * needs no config flag, no `react@canary` install and no tsconfig change. See
 * the discovery document for why, and for the trap this file avoids: a named
 * pair with `default="none"` and no explicit `share` silently stops morphing.
 *
 * Three properties worth defending:
 *
 *   `default: "none"` on every map. Untyped transitions happen constantly:
 *   browser back, router.refresh(), a Suspense reveal, and every navigation in
 *   Firefox, which has same-document view transitions but no transition types.
 *   Without the default those all get a direction chosen at random.
 *
 *   The direction is a TYPE, supplied by the link. `<Link transitionTypes>` is
 *   the whole mechanism; there is no automatic back detection. Hardware back
 *   carries no type and lands on `default: "none"`, a clean cut, which is why
 *   every in-page return is a real Link with `nav-back` on it.
 *
 *   It goes in a `page.tsx`, never a layout. A layout persists across
 *   navigation, so `enter` and `exit` would fire once in its whole life, and a
 *   layout-level wrapper would nest every page-level one, which stops the
 *   inner ones firing at all.
 *
 * Unsupported browsers get a plain cut. React wraps the
 * `document.startViewTransition` call in a try/catch and falls through to a
 * synchronous commit, so nothing is thrown and nothing is left half painted.
 *
 * MEASURED, 2026-08-13, and read this before spending a day on it.
 *
 * On Next 16.3.0 with the React it vendors (19.3.0-canary-cbb046ab-20260731),
 * NO navigation in this app currently activates a view transition. Verified in
 * a visible Chromium (the agent browser pane reports
 * `document.visibilityState === "hidden"`, where the API aborts with "invalid
 * state", so it cannot be used to test this), against both `next dev --webpack`
 * and a production `next build` + `next start`, with a real trusted click:
 *
 *   /  ->  /w/ja      Server Action + redirect()   no transition
 *   /w/ja -> /w/ja/duel   <Link transitionTypes>   no transition
 *
 * `document.startViewTransition` is never called and React never writes a
 * `view-transition-name` onto any element, confirmed with a MutationObserver on
 * the whole document. Repeated with a permissive `default` class in place of
 * `default="none"`, to rule out everything resolving to "none".
 *
 * The gate is in React, not here. `commitBeforeMutationEffects` computes
 * `isViewTransitionEligible = (committedLanes & 335544064) === committedLanes`
 * (react-dom-client.development.js:14847), and every enter, exit and update
 * tracking call sits behind it, so a commit that carries even one lane outside
 * the transition set never reaches `startViewTransition` at :19478. Which
 * non-transition update joins the router's commit is unresolved.
 *
 * The answer to the discovery document's open question is therefore "no" for a
 * Server Action redirect, with the caveat that the control case fails the same
 * way: the behaviour is not specific to Server Actions.
 *
 * This is kept rather than deleted because it is the documented, type-checked,
 * correct wiring, it costs nothing at runtime while inert, and the day the lane
 * behaviour changes the transitions appear with no further work. Do not treat a
 * silent cut as a bug in this file.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
