import { ScriptText } from "@/components/ui/script-text";
import { enterWorld } from "@/lib/actions/enter-world";
import { WORLDS, type WorldId } from "@/lib/design/worlds";
import { BODY_PARAMS } from "./world-bodies";

/**
 * The slot a world's body occupies.
 * docs/design/discovery-planet-render.md §5, §7
 *
 * Server-rendered, with a CSS body already in it. Three things follow:
 *
 * - The box exists in the HTML, so there is no layout shift when the canvas
 *   arrives and nothing about the composition waits on JavaScript.
 * - If WebGL2 never initialises — no context, a driver reset that never
 *   restores — this is what stays on screen. It is a gradient, not an asset:
 *   there is no image byte in any path.
 * - It is 78% of the slot, and the rendered sphere is 86%, so the canvas body
 *   covers it completely rather than leaving a ring of flat colour at the limb.
 *
 * The highlight sits where that world's light comes from, so the fallback and
 * the shader agree about the direction of the sun.
 */
function WorldBody({ world }: { world: WorldId }) {
  const [sx, sy] = BODY_PARAMS[world].sun;
  return (
    <span
      data-world-body={world}
      aria-hidden="true"
      className="relative block size-[88px] shrink-0 sm:size-[112px] md:size-[140px] lg:size-[168px]"
    >
      <span
        className="absolute left-1/2 top-1/2 block size-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-full)]"
        style={{
          // Stops weighted toward `deep` so the fallback reads as a lit body
          // with a dark side rather than as a saturated plastic ball.
          background: `radial-gradient(circle at ${(50 + sx * 26).toFixed(1)}% ${(
            50 -
            sy * 26
          ).toFixed(1)}%, color-mix(in oklab, var(--world-atmos) 82%, var(--ink-900)) 0%, var(--world-mark) 32%, var(--world-deep) 68%, color-mix(in oklab, var(--world-deep) 45%, var(--ink-100)) 100%)`,
        }}
      />
    </span>
  );
}

/**
 * One enterable world.
 * docs/design/design-system.md §6.1, docs/design/discovery-taste.md §3.2, §3.4
 *
 * The body, then the name, then the label, all inside one hit target. The
 * three parts of one world sit within 8 px of each other and the next world is
 * 56–72 px away, which is the proximity ratio the taste review found inverted
 * 5.6:1 in the wrong direction on the previous layout.
 *
 * Entering goes through a form because it provisions the guest session, and a
 * Server Component cannot write a cookie.
 */
export function WorldChoice({ world }: { world: WorldId }) {
  const definition = WORLDS[world];
  return (
    <li>
      <form action={enterWorld}>
        <input type="hidden" name="world" value={world} />
        <button
          type="submit"
          data-world={world}
          /* No row highlight: a full-width bar behind a hovered row is what
             turns a choice between places back into a settings list. The
             affordance is a faint wash of this world's OWN deep token plus
             the name taking its atmosphere, so hover reads as light arriving
             from the place rather than as a selected list item. */
          /* Body first on a phone, where the eye reads left to right into the
             name. From md the row reverses and hugs the right edge, so the
             bodies stack into a column on the right of the page while the type
             block holds the left — the asymmetry §6.1 asks for. The two halves
             of one world stay 20-36 px apart either way; the previous layout
             put them at opposite ends of the viewport, which is what made the
             screen read as a settings list. */
          className="group flex w-full items-center gap-5 rounded-[var(--r-2)] px-2 py-3 text-left transition-[background-color] duration-[var(--dur-base)] hover:bg-[color-mix(in_oklab,var(--world-deep)_34%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--world-deep)_34%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-offset)] sm:gap-7 md:flex-row-reverse md:justify-start md:gap-8 lg:gap-10 lg:px-3 lg:py-4"
        >
          <WorldBody world={world} />

          <span className="flex min-w-0 flex-col md:items-end md:text-right">
            <span className="text-[0.8125rem] font-medium uppercase leading-[1.3] tracking-[0.06em] text-[color:var(--ink-650)] transition-colors duration-[var(--dur-fast)] group-hover:text-[color:var(--ink-700)]">
              {definition.latinName}
            </span>
            <ScriptText
              world={world}
              tier="display"
              as="span"
              /* The only screen rendering every world at once. Blocking here
                 would serialise CJK stylesheets across two CDNs before
                 anything paints, on the first screen a user ever sees. The
                 per-language fallback stacks already show the correct glyph
                 shapes, so this costs a swap, not correctness. */
              blocking={false}
              className="mt-1 text-[clamp(3rem,5.4vw,4.25rem)] leading-[1.06] text-[color:var(--ink-900)] transition-colors duration-[var(--dur-base)] group-hover:text-[color:var(--world-atmos)] group-focus-visible:text-[color:var(--world-atmos)]"
            >
              {definition.nativeName}
            </ScriptText>
            <span className="mt-1.5 truncate text-[0.9375rem] leading-[1.4] text-[color:var(--ink-700)]">
              {definition.concept}
            </span>
          </span>
        </button>
      </form>
    </li>
  );
}

/**
 * A world that is not open yet.
 *
 * No padlock, no badge, no countdown, no body. The row is simply quieter and
 * does not respond to the cursor. Absence of affordance is the message;
 * anything louder turns a gap in the content into a marketing surface.
 */
export function QuietWorld({ world }: { world: WorldId }) {
  const definition = WORLDS[world];
  return (
    <li className="flex items-baseline gap-4 py-1.5 opacity-40" aria-disabled="true">
      <ScriptText
        world={world}
        tier="text"
        as="span"
        blocking={false}
        className="text-[1.0625rem] leading-[1.4] text-[color:var(--ink-800)]"
      >
        {definition.nativeName}
      </ScriptText>
      <span className="text-[0.8125rem] leading-[1.3] tracking-[0.02em] text-[color:var(--ink-700)]">
        {definition.latinName}
      </span>
    </li>
  );
}
