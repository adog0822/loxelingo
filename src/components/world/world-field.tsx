"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import type { WorldId } from "@/lib/design/worlds";
import { createPlanetField, type BodyDraw, type PlanetField } from "./planet-gl";
import { BODY_PARAMS, readWorldTokens } from "./world-bodies";

/**
 * WorldField
 * docs/design/discovery-planet-render.md §4, §5, §6, §7
 * docs/design/design-system.md §4.3, §4.5, §6.1
 *
 * One canvas, one WebGL2 context, every body on the screen. Not one canvas per
 * world: the context budget is 16 on desktop and 8 on Android, and overflowing
 * it does not fail loudly — it force-loses the OLDEST canvas on the page,
 * which is whatever the user has been looking at longest.
 *
 * The rows are server-rendered and arrive as `children`. This component only
 * measures the slots they left behind and paints into them, so the whole
 * composition — type, forms, the CSS body in each slot — exists in the HTML
 * before any JavaScript runs, and the canvas paints over it when it is ready.
 * There is no hydration difference to reconcile: the server and the first
 * client render produce the same markup, and every browser API is touched in
 * an effect.
 *
 * Rotation is 90 s per revolution and the frame rate is capped at 30. That is
 * about a quarter of a degree per frame: something noticed on second look, not
 * motion competing for attention.
 */

/**
 * Frame cap. The bodies turn once every 90 s (design-system §4.3), which is
 * a quarter of a degree per frame at this rate: 60 fps would spend twice the
 * battery to draw the same picture.
 */
const FRAME_INTERVAL_MS = 1000 / 30;

/**
 * The clock the poster frame is drawn at. Zero puts every body at rotation
 * zero, which is a frame nobody chose; this one is the frame the prototype's
 * stills were judged on.
 */
const POSTER_TIME_S = 18;

/** Above 2 the bodies are 200 px discs costing four times the fragments. */
const MAX_DPR = 2;

interface Slot {
  readonly el: HTMLElement;
  readonly world: WorldId;
  readonly atmos: [number, number, number];
  readonly mark: [number, number, number];
  readonly deep: [number, number, number];
}

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReduceMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getReduceMotion = () => window.matchMedia(REDUCE_MOTION).matches;

/** Never true on the server, and never read for markup: only for effects. */
const getReduceMotionOnServer = () => false;

export interface WorldFieldProps {
  className?: string;
  children: ReactNode;
}

export function WorldField({ className, children }: WorldFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * A user instruction, not a capability, so it wins outright: no rotation at
   * all and a single still frame. Subscribed rather than read once, because
   * the setting decides the context's attributes — a still field needs
   * preserveDrawingBuffer and an animated one must not pay for it — so a
   * change has to rebuild the context, not just stop the loop.
   */
  const stillOnly = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotion,
    getReduceMotionOnServer,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const slotEls = Array.from(
      container.querySelectorAll<HTMLElement>("[data-world-body]"),
    );
    if (slotEls.length === 0) return;

    const slots: Slot[] = slotEls.map((el) => {
      const world = el.dataset.worldBody as WorldId;
      // Once, at mount. Never per frame, and never a derived calc() property:
      // those resolve to an unevaluated string, not a number.
      const tokens = readWorldTokens(el, world);
      return { el, world, ...tokens };
    });

    /**
     * The canvas is created here rather than in JSX, and thrown away on
     * cleanup. Teardown has to call WEBGL_lose_context.loseContext() — it is
     * the only way to hand a context back promptly, and the budget is 16 —
     * but a canvas whose context has been lost that way keeps returning the
     * same dead context from getContext forever. Reusing one React-owned
     * element across effect runs therefore produces a canvas that can never
     * compile a shader again. A fresh element per run cannot.
     */
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none";
    container.appendChild(canvas);

    let field: PlanetField | null = createPlanetField(canvas, {
      still: stillOnly,
      allowSoftware: false,
    });
    // No hardware WebGL2. A software rasteriser cannot animate, but it can
    // still draw the real body once — which is a poster rendered by the same
    // shader, not an image asset.
    let still = stillOnly;
    if (field === null) {
      field = createPlanetField(canvas, { still: true, allowSoftware: true });
      still = true;
    }
    // Still nothing. The CSS body in each slot stays visible and the canvas is
    // removed again. No path in this component loads an image.
    if (field === null) {
      canvas.remove();
      return;
    }
    const active = field;

    canvas.style.opacity = "1";

    let bodies: BodyDraw[] = [];
    let raf = 0;
    let layoutRaf = 0;
    let lastFrame = -1e9;
    let running = false;
    let visible = true;
    let onScreen = true;
    const start = performance.now();

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const base = container.getBoundingClientRect();

      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const slot of slots) {
        const r = slot.el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      }
      if (!Number.isFinite(left)) {
        bodies = [];
        return;
      }

      // The canvas covers only the union of the slots, not the page. At these
      // sizes that is a few hundred KB of backing store instead of tens of MB,
      // and every pixel it owns is a pixel a body actually uses.
      const boxW = right - left;
      const boxH = bottom - top;
      canvas.style.left = `${left - base.left}px`;
      canvas.style.top = `${top - base.top}px`;
      canvas.style.width = `${boxW}px`;
      canvas.style.height = `${boxH}px`;
      active.resize(boxW, boxH, dpr);

      bodies = slots.map((slot) => {
        const r = slot.el.getBoundingClientRect();
        const p = BODY_PARAMS[slot.world];
        return {
          x: Math.round((r.left - left) * dpr),
          y: Math.round((r.top - top) * dpr),
          w: Math.round(r.width * dpr),
          h: Math.round(r.height * dpr),
          time: POSTER_TIME_S + p.phase,
          atmos: slot.atmos,
          mark: slot.mark,
          deep: slot.deep,
          sun: p.sun,
          axis: p.axis,
          terrain: [p.seed, p.plains[0], p.plains[1], p.craters],
          surface: [p.ridges, p.plainTint, p.purity, p.limb],
        };
      });
    };

    const drawAt = (seconds: number) => {
      for (let i = 0; i < bodies.length; i += 1) {
        const p = BODY_PARAMS[slots[i].world];
        bodies[i] = { ...bodies[i], time: seconds + p.phase };
      }
      active.draw(bodies);
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      // Still rAF-driven, just not every tick. A body turning once every 90 s
      // does not need 60 fps and should not spend a phone's battery on it.
      if (now - lastFrame < FRAME_INTERVAL_MS) return;
      lastFrame = now;
      drawAt(POSTER_TIME_S + (now - start) / 1000);
    };

    const stop = () => {
      running = false;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    };

    const run = () => {
      if (still || running || !visible || !onScreen) return;
      running = true;
      lastFrame = -1e9;
      raf = requestAnimationFrame(tick);
    };

    const relayout = () => {
      if (layoutRaf !== 0) return;
      layoutRaf = requestAnimationFrame(() => {
        layoutRaf = 0;
        layout();
        // A still field has to be repainted whenever its geometry moves; the
        // animated one will repaint on its own next frame anyway.
        if (still) drawAt(POSTER_TIME_S);
      });
    };

    layout();
    drawAt(POSTER_TIME_S);
    run();

    // A hidden document runs no animation frame callbacks at all — that is
    // spec-mandated, not an optimisation — and the same filter feeds
    // IntersectionObserver, so IO cannot see the hidden -> visible edge.
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) run();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        if (onScreen) run();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(relayout);
    ro.observe(container);
    for (const slot of slots) ro.observe(slot.el);
    window.addEventListener("resize", relayout);

    // The CJK faces load lazily, so a row can change height after first paint.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) relayout();
    });

    // It will fire: tab backgrounding, a driver reset, or some other part of
    // the app opening too many contexts. Without preventDefault the context
    // can never be restored.
    const onLost = (event: Event) => {
      event.preventDefault();
      stop();
      canvas.style.opacity = "0";
    };
    const onRestored = () => {
      // A restored context comes back with every object it owned deleted, so
      // the program and the VAO have to be built again before anything can be
      // drawn. If that fails the canvas stays hidden and the CSS body, which
      // has been showing the whole time, simply remains.
      if (!active.rebuild()) return;
      layout();
      drawAt(POSTER_TIME_S);
      canvas.style.opacity = "1";
      run();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      cancelled = true;
      // Cancel first, then delete: a pending callback would otherwise fire
      // against a deleted program.
      stop();
      if (layoutRaf !== 0) cancelAnimationFrame(layoutRaf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", relayout);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      active.dispose();
      canvas.remove();
    };
  }, [stillOnly]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      {children}
    </div>
  );
}
