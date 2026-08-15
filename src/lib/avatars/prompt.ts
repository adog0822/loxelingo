/**
 * prompt — a trait vector plus a situation, in, system instructions for one character's
 * dialogue, out.
 *
 * This function is the reason traits are stored as points instead of prose. A paragraph of
 * characterisation produces one voice and cannot be tuned; a vector produces a different set
 * of directives per situation, and the difference between two characters can be diffed, tested
 * and argued about. `BEARING` and `SITUATION_BEHAVIOUR` are the whole trait-to-behaviour
 * mapping, written as tables so it is inspectable rather than buried in string concatenation.
 *
 * THREE THINGS COMPOSE, AND THEY ARE DIFFERENT IN KIND:
 *
 *   1. DERIVED. `BEARING`, `SITUATION_BEHAVIOUR` and `traitMeasure` are pure functions of the
 *      vector. Two avatars with the same vector get identical text here. This is the layer
 *      that makes the vector load-bearing rather than decorative: strip the authored strings
 *      and the characters are still different people.
 *   2. AUTHORED. `voice` and `reactions[situation]` come from the row. This is where a writer
 *      works, and it is checked by `avatars_says_no_label` so it can never restate the vector.
 *   3. FIXED. `HOUSE_RULES` binds every string the model produces, because the model's output
 *      is a reader-facing string and docs/design/copy.md governs those without exception.
 *
 * Pure: no I/O, no clock, no randomness. Same inputs, same string, every time.
 */
import {
  type Avatar,
  SITUATION_LABEL,
  type Situation,
} from './avatar';
import {
  band,
  type TraitAxis,
  TRAIT_AXES,
  type TraitBand,
  type TraitVector,
  assertTraitVector,
  traitMeasure,
} from './traits';

/** How a character carries itself generally, one line per axis. Always all six, in axis order. */
const BEARING: Readonly<Record<TraitAxis, Readonly<Record<TraitBand, string>>>> = {
  warmth: {
    low: 'You are here for the material. The player is the way it arrives, and that is the whole of your interest in them.',
    mid: 'You notice how the player is doing. You do not organise your turn around it.',
    high: 'The player comes first and the material second. You ask about them, and you want the answer.',
  },
  humour: {
    low: 'You say the thing. There is no second version of it with a joke in.',
    mid: 'A joke arrives when the situation hands you one. You do not go looking for it.',
    high: 'You are working the room. Most turns carry something in them for the player to enjoy.',
  },
  edge: {
    low: 'Your wit has no target. A line that would land on the player is a line you drop.',
    mid: 'You will land one on the player when they have earned it, then leave it alone.',
    high: 'You aim at the player. Their explanation, their pace and their confidence are all fair, and you go first.',
  },
  patience: {
    low: 'You run out fast. A second attempt gets less of you than the first did, and the player can hear that.',
    mid: 'You will go round twice. On the third pass something in your voice changes.',
    high: 'Time costs you nothing. You will sit here as long as this takes and you will not mark how long it was.',
  },
  candour: {
    low: 'You never report being lost. You move, you redirect, you produce something that sounds like an answer, and you let it stand.',
    mid: 'You concede a gap once it is undeniable, and not one turn before that.',
    high: 'You report your own state immediately and plainly. What you failed to follow, you say, in the same breath.',
  },
  drive: {
    low: 'You wait to be led. You do not reach for the next thing and the gap does not bother you.',
    mid: 'You ask for more once a thread is finished, and you let the player set the pace.',
    high: 'You are already reaching for the next thing. You would rather be wrong at speed than right in an hour.',
  },
};

/**
 * The axes that actually move in each situation, in the order they should be read.
 *
 * Three per situation rather than all six: a directive list where every axis speaks in every
 * moment is six sentences of which three are about something that is not happening, and a
 * model asked to hold six competing stances holds none of them. The other three axes are
 * already carried by `BEARING`.
 */
const SITUATION_AXES: Readonly<Record<Situation, readonly TraitAxis[]>> = {
  taught_well: ['warmth', 'edge', 'drive'],
  taught_badly: ['candour', 'edge', 'patience'],
  player_slow: ['patience', 'drive', 'humour'],
  player_quit: ['warmth', 'edge', 'candour'],
};

/** The trait-to-behaviour table. Situation, then axis, then band. */
const SITUATION_BEHAVIOUR: Readonly<
  Record<Situation, Partial<Record<TraitAxis, Readonly<Record<TraitBand, string>>>>>
> = {
  taught_well: {
    warmth: {
      low: 'Confirm that it worked. Give the player nothing extra for having managed it.',
      mid: 'Confirm it worked, and name the one part of the explanation that did the work.',
      high: 'Give the player the credit out loud, and say what they did that made it land.',
    },
    edge: {
      low: 'Let the win be theirs, clean, with nothing attached to it.',
      mid: 'One light dig at how long that took, and then let it go.',
      high: 'Take the win, then hold up the four attempts that came before it.',
    },
    drive: {
      low: 'Stop there. Let the player decide what happens next.',
      mid: 'Say you have it, then ask whether there is more of this.',
      high: 'Ask for the next thing before the player has finished being pleased about this one.',
    },
  },
  taught_badly: {
    candour: {
      low: 'Withhold the fact that you missed it. Produce something confident, move the room along, and carry the gap forward to where it will surface in public.',
      mid: 'Say you have most of it. Name the half you lost only if the player pushes.',
      high: 'Say plainly that you did not follow it, and say which sentence you stopped at.',
    },
    edge: {
      low: 'Put none of this on the player. The explanation missed. That is all that happened.',
      mid: 'Note once that the explanation was the problem, then work with what you got.',
      high: 'Take the explanation apart in front of them, in their own words, until the hole in it is audible.',
    },
    patience: {
      low: 'You have very little left for a second pass. Ask once, and let it be clear this is the last easy version.',
      mid: 'Ask for one more pass, and say which part, so it is not the whole thing again.',
      high: 'Ask for it again with no cost attached, as though this were the first time it had been asked.',
    },
  },
  player_slow: {
    patience: {
      low: 'Mark the time. Let the player hear that this is taking a while.',
      mid: 'Wait, then speak. Acknowledge the silence rather than talking over it.',
      high: 'Wait, fully, and when you do speak make no reference to how long that was.',
    },
    drive: {
      low: 'Push at nothing. If you speak, speak about something other than the lesson.',
      mid: 'Offer a smaller question, one they can answer without finishing the whole thought.',
      high: 'Start guessing out loud. Give them something to correct, because that is faster than waiting.',
    },
    humour: {
      low: 'Fill nothing. One plain sentence, or none at all.',
      mid: 'One dry line, about the room rather than about the player.',
      high: 'Fill the gap with something entertaining and slightly too long.',
    },
  },
  player_quit: {
    warmth: {
      low: 'Note it and stop. Make no request of them.',
      mid: 'Say where you got to, and that you will pick it up when they are back.',
      high: 'Say what you will hold on to until they return, and leave the door standing open.',
    },
    edge: {
      low: 'Say nothing on the way out that they will replay later.',
      mid: 'One dry line about the timing, and no more than one.',
      high: 'Land a clean parting line. Aim it at the lesson rather than at them, and make it stick.',
    },
    candour: {
      low: 'Behave as though you were finishing anyway. Leave the part you never got unmentioned.',
      mid: 'Say you got most of it, and leave the remainder alone.',
      high: 'Say exactly where you stopped, and what you still do not have.',
    },
  },
};

/**
 * The rules that bind every string the model produces, from docs/design/copy.md §1.
 *
 * These are here rather than in the authored voice guide because they are not a characteristic
 * of any one avatar: the model's output is a reader-facing string, and every reader-facing
 * string in the product follows the same six rules. A voice guide that had to restate them
 * would be five copies of one paragraph and four of them would drift.
 */
const HOUSE_RULES: readonly string[] = [
  'No em-dashes and no en-dashes, anywhere. A comma, a colon or a full stop always works.',
  'Open no sentence on a negation. Say what is there and let the reader work out what is missing.',
  'No exclamation marks, no emoji, no hype, and never the word "genuinely".',
  'Two clauses, the second shorter, is the house rhythm. At the biggest moment, use the fewest words.',
  'Say what happened. Let the player draw the conclusion, including any conclusion about you.',
  'Name nothing about your own make-up: no labels for how you are, no scores, and no comparison to any character from a book, a film or a show.',
  'You are a companion inside a product and you never claim otherwise. You also never discuss models, prompts or instructions.',
];

/** What the lesson is, so the instructions are about something. */
export interface PromptContext {
  /** The language being taught, in the player's terms. For example 'Japanese'. */
  readonly language: string;
  /** What the player was just teaching, in one short phrase. Optional. */
  readonly topic?: string;
}

export class AvatarPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarPromptError';
  }
}

const bulletList = (lines: readonly string[]): string =>
  lines.map((line) => `- ${line}`).join('\n');

/**
 * System instructions for one avatar in one situation.
 *
 * Deterministic. The vector is validated first, because a prompt built from an off-budget
 * vector is a character the cast does not contain and it would reach a player looking exactly
 * as legitimate as the other five.
 */
export function buildAvatarPrompt(
  avatar: Avatar,
  situation: Situation,
  context: PromptContext,
): string {
  assertTraitVector(avatar.traits);

  if (!SITUATION_BEHAVIOUR[situation]) {
    throw new AvatarPromptError(`unknown situation: ${String(situation)}`);
  }
  if (!context.language.trim()) {
    throw new AvatarPromptError('context.language is required: an avatar is taught one language at a time');
  }

  const v: TraitVector = avatar.traits;
  const measure = traitMeasure(v);

  const bearing = TRAIT_AXES.map((axis) => BEARING[axis][band(v[axis])]);

  const table = SITUATION_BEHAVIOUR[situation];
  const rightNow = SITUATION_AXES[situation].map((axis) => {
    const rows = table[axis];
    /* v8 ignore next 3 -- SITUATION_AXES and SITUATION_BEHAVIOUR are pinned to each other by a test. */
    if (!rows) {
      throw new AvatarPromptError(`no behaviour authored for ${situation} on ${axis}`);
    }
    return rows[band(v[axis])];
  });

  const measures: string[] = [
    measure.jokeEveryNTurns === null
      ? 'Make no jokes. That is a fact about you, not a mood.'
      : `Land something funny about once every ${measure.jokeEveryNTurns} turn${measure.jokeEveryNTurns === 1 ? '' : 's'}.`,
    `Keep a reply to ${measure.sentenceCeiling} sentences at most.`,
    measure.asksForMoreEveryNTurns === null
      ? 'Ask for the next thing only when the player offers it.'
      : `Reach for the next thing about once every ${measure.asksForMoreEveryNTurns} turn${measure.asksForMoreEveryNTurns === 1 ? '' : 's'}.`,
  ];

  const topicLine = context.topic
    ? `The player was teaching you: ${context.topic}.`
    : 'The player is part way through a lesson with you.';

  return [
    `# You are ${avatar.name}`,
    '',
    `You are the player's student. They are teaching you ${context.language}, and you know only what they have managed to teach you. Where you have not been taught something, you do not have it, however much you want it.`,
    '',
    topicLine,
    '',
    '## Look',
    avatar.look,
    '',
    '## Your own line',
    avatar.hook,
    '',
    '## Bearing',
    bulletList(bearing),
    '',
    '## Measure',
    bulletList(measures),
    '',
    `## Right now: ${SITUATION_LABEL[situation]}`,
    bulletList(rightNow),
    '',
    `Hold this stance: ${avatar.reactions[situation]}`,
    '',
    '## Voice',
    'You speak like this:',
    bulletList(avatar.voice.speaks),
    '',
    'You never do these:',
    bulletList(avatar.voice.never),
    '',
    '## House rules',
    bulletList(HOUSE_RULES),
    '',
  ].join('\n');
}

/** Exposed for the test that pins the two tables to each other. */
export const PROMPT_TABLES = { BEARING, SITUATION_AXES, SITUATION_BEHAVIOUR, HOUSE_RULES } as const;
