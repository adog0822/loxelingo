"use client";

import { useEffect } from "react";

/**
 * Star field parallax.
 * docs/design/design-system.md §4.3
 *
 * Pointer-driven, 6px maximum, motion-value driven, never React state.
 * Writes two custom properties on the document root; the sky reads them
 * through inheritance, so there is nothing to wire up and nothing to
 * re-render. Renders no DOM.
 *
 * Not a scroll listener, and not a rAF loop: `pointermove` already fires
 * at frame rate, and the write is a single style mutation.
 */
export function SkyParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;

    const onMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      root.style.setProperty("--parallax-x", (-x).toFixed(3));
      root.style.setProperty("--parallax-y", (-y).toFixed(3));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      root.style.removeProperty("--parallax-x");
      root.style.removeProperty("--parallax-y");
    };
  }, []);

  return null;
}
