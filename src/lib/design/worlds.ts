/**
 * The seven worlds.
 * docs/design/design-system.md §2.5, §3.1, §3.3
 *
 * Six of them are foreign languages for a native English speaker. `en` is
 * the inverse: nobody whose first language is English enters it, so every
 * learner there is reading the interface in a second language. That does
 * not change anything in this module — English is a Latin-script,
 * non-CJK world like es/fr/de — but it is why its content is authored
 * with shorter, more concrete instructions than the other six.
 *
 * A world owns a hue, an atmosphere, a celestial body and a terrain. The
 * hue paints place. It never encodes correct/incorrect, win/loss, rank
 * or data. World identity is always carried by native script + Latin
 * name + globe art + hue, never hue alone.
 *
 * This module is also the single source of truth for `lang`. `lang="ja"`
 * and `lang="zh-Hans"` select different glyph shapes for the same
 * Unicode codepoints, so getting it wrong renders Chinese-form kanji to
 * a Japanese learner: a correctness bug, not a styling bug. No component
 * takes a `lang` prop; components take a `world` and read the tag from
 * here. See src/components/ui/script-text.tsx.
 */

import { CJK_FONT_SOURCES, type FontSource, type ScriptTier } from "./font-sources";

export type { ScriptTier };

export type WorldId = "ja" | "ko" | "zh" | "es" | "fr" | "de" | "en";

export type CjkWorldId = "ja" | "ko" | "zh";

/**
 * BCP-47 tags. `zh-Hans` is mandatory: bare `zh` is not specific enough.
 * `en` needs no region subtag: nothing here selects a glyph form or a
 * dialect from it, and `en-US` would be a claim the content does not make.
 */
export type WorldLang = "ja" | "ko" | "zh-Hans" | "es" | "fr" | "de" | "en";

export interface World {
  readonly id: WorldId;
  readonly lang: WorldLang;
  /** Small and above the native script, per §6.1. */
  readonly latinName: string;
  /** Large. The native script being larger is the whole thesis. */
  readonly nativeName: string;
  /** The place, in one phrase. */
  readonly concept: string;
  /** True when the world needs a per-world lazily loaded CJK face. */
  readonly cjk: boolean;
  /** CSS custom property holding the family stack for each tier. */
  readonly fontVar: Readonly<Record<ScriptTier, string>>;
}

export const WORLDS: Readonly<Record<WorldId, World>> = {
  ja: {
    id: "ja",
    lang: "ja",
    latinName: "Japanese",
    nativeName: "日本",
    concept: "The Cloud Sea",
    cjk: true,
    fontVar: {
      display: "var(--font-ja-display)",
      text: "var(--font-ja-text)",
      immersion: "var(--font-ja-serif)",
    },
  },
  ko: {
    id: "ko",
    lang: "ko",
    latinName: "Korean",
    nativeName: "한국",
    concept: "The Celadon Coast",
    cjk: true,
    fontVar: {
      display: "var(--font-ko)",
      text: "var(--font-ko)",
      immersion: "var(--font-ko-serif)",
    },
  },
  zh: {
    id: "zh",
    lang: "zh-Hans",
    latinName: "Mandarin",
    nativeName: "中文",
    concept: "The Ink Valley",
    cjk: true,
    fontVar: {
      display: "var(--font-zh-display)",
      text: "var(--font-zh-text)",
      immersion: "var(--font-zh-serif)",
    },
  },
  es: {
    id: "es",
    lang: "es",
    latinName: "Spanish",
    nativeName: "Español",
    concept: "The Long Sun",
    cjk: false,
    fontVar: {
      display: "var(--font-display)",
      text: "var(--font-text)",
      immersion: "var(--font-text)",
    },
  },
  fr: {
    id: "fr",
    lang: "fr",
    latinName: "French",
    nativeName: "Français",
    concept: "The Salt Flats",
    cjk: false,
    fontVar: {
      display: "var(--font-display)",
      text: "var(--font-text)",
      immersion: "var(--font-text)",
    },
  },
  de: {
    id: "de",
    lang: "de",
    latinName: "German",
    nativeName: "Deutsch",
    concept: "The Standing Stones",
    cjk: false,
    fontVar: {
      display: "var(--font-display)",
      text: "var(--font-text)",
      immersion: "var(--font-text)",
    },
  },
  en: {
    id: "en",
    lang: "en",
    latinName: "English",
    // The endonym and the Latin name are the same string. That is not a
    // placeholder: §6.1 sets the native form large and the Latin name
    // small above it, and English simply has nothing else to show there.
    nativeName: "English",
    concept: "The Lichen Steppe",
    cjk: false,
    fontVar: {
      display: "var(--font-display)",
      text: "var(--font-text)",
      immersion: "var(--font-text)",
    },
  },
} as const;

export const WORLD_IDS = Object.keys(WORLDS) as readonly WorldId[];

export function getWorld(id: WorldId): World {
  return WORLDS[id];
}

/** The only correct way to get a `lang` value for world content. */
export function langForWorld(id: WorldId): WorldLang {
  return WORLDS[id].lang;
}

export function isCjkWorld(id: WorldId): id is CjkWorldId {
  return WORLDS[id].cjk;
}

/**
 * The stylesheet a world needs for a given tier, or `null` for the three
 * Latin worlds, which need nothing beyond the global Latin faces.
 */
export function fontSourceForWorld(id: WorldId, tier: ScriptTier): FontSource | null {
  if (!isCjkWorld(id)) return null;
  return CJK_FONT_SOURCES[id][tier];
}
