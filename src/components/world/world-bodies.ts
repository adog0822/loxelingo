import type { WorldId } from "@/lib/design/worlds";

/**
 * Per-world body parameters.
 * docs/design/design-system.md §2.5, docs/design/discovery-planet-render.md §9
 *
 * The prototype rendered exactly one world and said so: "the palette logic is
 * tuned to Japanese periwinkle... other worlds will need per-world parameters,
 * not just per-world hues." These are those parameters. Each world's §2.5
 * concept prescribes a surface, and following it is also the anti-slop move:
 * seven bodies that differ only in hue would read as one body recoloured.
 *
 * Nothing here is a colour. Hue arrives at the shader from the world tokens in
 * src/styles/tokens.css and from nowhere else.
 */
export interface BodyParams {
  /** Domain offset. Two worlds must not share a surface. */
  readonly seed: number;
  /**
   * Light direction. The z component decides how much of the disc is lit: keep
   * it in roughly 0.3-0.55 so the body reads as a lit object with a terminator
   * on it, rather than as a phase icon (z near 0) or a flat front-lit disc
   * (z near 1), which the render discovery names as a tell.
   */
  readonly sun: readonly [number, number, number];
  /** Rotation axis, tilted so the poles are never on the frame axes. */
  readonly axis: readonly [number, number, number];
  /** Seconds added to the clock, so the bodies are never in step. */
  readonly phase: number;
  /** smoothstep window on the plains field. Narrow = hard coastlines. */
  readonly plains: readonly [number, number];
  /** Crater relief. 0 is a body that was never bombarded. */
  readonly craters: number;
  /**
   * Ridged highland relief. Kept low: screen-space LOD removes the ridged
   * field's fine octaves at thumbnail size, and what survives is its LARGE
   * scale, which at full amplitude reads as swirling worms rather than as
   * rough ground. Craters carry the character at this size; ridges only
   * roughen what is between them.
   */
  readonly ridges: number;
  /** mix(deep, mark) for the plains albedo. deep alone crushes to black. */
  readonly plainTint: number;
  /** Chroma kept. Rock is not a gemstone. */
  readonly purity: number;
  /** Limb scattering strength. Under 1.0 pre-tonemap it stays chromatic. */
  readonly limb: number;
}

function unit(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Every world has parameters even though five of them are not enterable. A
 * world becomes reachable by flipping `worlds.is_launched` in the database,
 * and the screen must not need a code change to follow it.
 */
const RAW: Readonly<Record<WorldId, BodyParams>> = {
  // The Cloud Sea. A vast pale moon: heavily cratered highlands and wide
  // plains, the prototype's surface tuning unchanged. Lit from the upper left
  // and slightly toward the viewer, so about three quarters of the disc is in
  // light and the terminator crosses the right of it rather than halving it.
  ja: {
    seed: 0,
    sun: [-0.78, 0.26, 0.46],
    axis: [0.16, 1.0, 0.09],
    phase: 0,
    plains: [0.46, 0.6],
    craters: 1.0,
    ridges: 0.2,
    plainTint: 0.52,
    purity: 0.6,
    limb: 9.0,
  },
  // The Celadon Coast. Sea-light and black basalt: mostly plain, the
  // highlands reduced to headlands, craters nearly gone under the water.
  ko: {
    seed: 12.7,
    sun: [-0.52, 0.36, 0.62],
    axis: [-0.22, 1.0, 0.14],
    phase: 31,
    plains: [0.42, 0.51],
    craters: 0.35,
    ridges: 0.16,
    plainTint: 0.46,
    purity: 0.55,
    limb: 11.5,
  },
  // The Ink Valley. Karst spires: the most vertical surface in the set, so
  // ridges are pushed and the plains window is wide and soft.
  zh: {
    seed: 24.1,
    sun: [0.7, 0.28, 0.4],
    axis: [0.09, 1.0, -0.26],
    phase: 58,
    plains: [0.48, 0.68],
    craters: 0.55,
    ridges: 0.34,
    plainTint: 0.5,
    purity: 0.58,
    limb: 10.0,
  },
  // The Long Sun. §2.5 rule 4: the Spanish disc renders white-hot rather than
  // gold. Almost no relief, purity dropped hard, and the light nearly head-on
  // so the terminator is a thin sliver at the limb.
  es: {
    seed: 37.3,
    sun: [-0.36, 0.14, 0.78],
    axis: [0.2, 1.0, 0.05],
    phase: 12,
    plains: [0.5, 0.72],
    craters: 0.18,
    ridges: 0.1,
    plainTint: 0.7,
    purity: 0.34,
    limb: 13.0,
  },
  // The Salt Flats. Still water and a small brilliant sun: flat plains with
  // hard edges, and the strongest limb in the set.
  fr: {
    seed: 49.9,
    sun: [0.6, -0.22, 0.55],
    axis: [-0.14, 1.0, 0.2],
    phase: 44,
    plains: [0.44, 0.5],
    craters: 0.3,
    ridges: 0.13,
    plainTint: 0.58,
    purity: 0.52,
    limb: 12.5,
  },
  // The Standing Stones. A dark world: granite and snow, the deepest relief in
  // the set, and the light nearly side-on so the ridges throw long shadows.
  de: {
    seed: 61.4,
    sun: [-0.86, 0.14, 0.33],
    axis: [0.28, 1.0, -0.1],
    phase: 71,
    plains: [0.5, 0.63],
    craters: 0.8,
    ridges: 0.3,
    plainTint: 0.42,
    purity: 0.5,
    limb: 8.0,
  },
  // The Lichen Steppe. Not cratered and not mountainous: a low, mottled
  // surface where the plains window is very wide, so the two terrains
  // interleave as patches rather than resolving into coast and highland.
  en: {
    seed: 74.6,
    sun: [0.62, 0.3, 0.5],
    axis: [-0.19, 1.0, -0.16],
    phase: 25,
    plains: [0.4, 0.74],
    craters: 0.42,
    ridges: 0.2,
    plainTint: 0.64,
    purity: 0.52,
    limb: 10.5,
  },
};

export const BODY_PARAMS: Readonly<Record<WorldId, BodyParams>> = Object.freeze(
  (Object.keys(RAW) as WorldId[]).reduce(
    (acc, id) => {
      acc[id] = { ...RAW[id], sun: unit(RAW[id].sun), axis: unit(RAW[id].axis) };
      return acc;
    },
    {} as Record<WorldId, BodyParams>,
  ),
);

/**
 * Fallback hexes, used only if the token cannot be read off the DOM. The
 * authority is src/styles/tokens.css; this exists so a body is never
 * colourless, not so a colour can be defined in two places.
 */
export const FALLBACK_TOKENS: Readonly<
  Record<WorldId, readonly [string, string, string]>
> = {
  ja: ["#d3c7ff", "#866ec8", "#321e5c"],
  ko: ["#62d7ab", "#00a36f", "#003b23"],
  zh: ["#56dbdc", "#009ca0", "#003e43"],
  es: ["#ffbb5f", "#c16600", "#531a00"],
  fr: ["#e7a5f1", "#af56bd", "#4a0953"],
  de: ["#67b2ee", "#0087da", "#002e69"],
  en: ["#b9d06b", "#768c02", "#2a3201"],
};

/** sRGB hex to linear. Lighting in gamma space is what makes a sphere plastic. */
export function hexToLinear(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return [0, 0, 0];
  const c = (i: number) => Math.pow(parseInt(full.slice(i, i + 2), 16) / 255, 2.2);
  return [c(0), c(2), c(4)];
}

/**
 * The world's three hues, read once from the cascade so tokens.css stays the
 * single source of truth. Once, at mount: never per frame, and never for a
 * derived calc() property, which resolves to an unevaluated string.
 */
export function readWorldTokens(el: Element, world: WorldId): {
  atmos: [number, number, number];
  mark: [number, number, number];
  deep: [number, number, number];
} {
  const style = getComputedStyle(el);
  const pick = (name: string, index: 0 | 1 | 2) => {
    const raw = style.getPropertyValue(name);
    const linear = hexToLinear(raw);
    if (linear[0] === 0 && linear[1] === 0 && linear[2] === 0) {
      return hexToLinear(FALLBACK_TOKENS[world][index]);
    }
    return linear;
  };
  return {
    atmos: pick("--world-atmos", 0),
    mark: pick("--world-mark", 1),
    deep: pick("--world-deep", 2),
  };
}
