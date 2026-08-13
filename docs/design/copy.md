# LoxeLingo Copy

**Date:** 2026-08-13
**Status:** Applied. Every string described here is live.
**Scope:** every user-visible string in the product.
**Sources:** `docs/design/design-system.md` §1, §8.2 (voice and register), `docs/design/discovery-taste.md` §4 (banned vocabulary, rewrite table), `design:ux-copy` (error and empty-state structure).

This document exists so that a person adding a screen can write its strings
correctly without reading a brief, a design review, or this project's history.
Read §1 and §2. §3 and §4 are the receipts.

---

## 1. The voice

**LoxeLingo speaks as a referee, never as a coach.**

A referee reports what happened and what the rules allow next. A coach has
opinions about your feelings. The product is a competitive ladder for people
who want standing; standing is cheapened the moment the product congratulates
you for it. The strongest string in the product is the one at the emotional low
point, and it is a number changing with no sentence attached.

Six rules. They are not stylistic preferences and none of them is negotiable.

### 1.1 No em-dashes. Anywhere.

Not in strings, not in headings, not in `aria-label`s. A colon, a period or a
comma always works. En-dashes are banned on the same grounds, except in a
numeric range in data. The em-dash is the single most reliable tell that a
sentence was generated rather than written, and one of them undoes a screen.

### 1.2 Never open a sentence on a negation

`Not a student.` `No account until...` `Nobody to face there yet.` All three
shipped, and all three make the reader's first act one of subtraction. Say what
is there. The reader will work out what is not.

Also banned: the `X without Y` construction. `Ranked without a syllabus` names
the thing you are trying to avoid and hands it the emphasis.

### 1.3 No `no X, no Y, no Z` lists

`No account, no email, no password` is a pitch deck reading itself aloud. It is
three negations in a row and it is always replaceable by one positive sentence
about what happens instead.

### 1.4 Never use the word "genuinely"

It is a hedge dressed as emphasis. If the sentence needs it, the sentence is
not yet true.

### 1.5 No hype, no exclamation marks, no feature language

Banned outright: exclamation marks; `Oops`, `Almost!`, `Nice job!`, `Great
work!`, `Incorrect`, `You failed`; `Elevate`, `Seamless`, `Unleash`,
`Next-Gen`, `powerful`, `effortless`, `revolutionary`; scroll cues; emoji;
cutesy diminutives; any sentence whose subject is the product rather than the
reader or the world.

### 1.6 Say what a thing is and what it does. Let the reader infer.

The atmosphere is carried by four devices, none of which names anything:

1. **Rhythm.** Two short clauses, the second shorter. `Kenji answered. Your move.`
   The pause is the atmosphere.
2. **Concrete physical nouns that are not celestial.** *air, light, edge, line,
   weather, distance, ground, quiet, thin, stand.*
3. **Present tense, third person for the world, second person only for the
   reader's own action.** The world reports; it does not address you.
4. **Understatement at the emotional peak.** The bigger the moment, the fewer
   the words. A band crossing gets three words.

---

## 2. The banned list

From `discovery-taste.md` §4.1, restated here so this document stands alone. If
any of these ship, the theme has been said out loud, and saying it is what turns
it into a costume.

**Celestial and space nouns.** space, galaxy, galactic, cosmos, cosmic,
universe, universal, star, stellar, constellation *as marketing language*,
planet, planetary, moon, lunar, solar, orbit, orbital, nebula, void, celestial,
astral, interstellar, meteor, comet, asteroid, satellite, station, module, deck,
airlock, cockpit, capsule, gravity, zero-g, atmosphere *as a word*, stratosphere,
sky *as a label*.

Two carve-outs, and only two. **Star** is permitted for the literal earned item
in the constellation view. **Constellation** is permitted as the name of the
view that renders real mastery data. Neither may appear in marketing voice.

**Voyage and expedition verbs.** launch, liftoff, blast off, embark, voyage,
journey, expedition, explore, discover *(wanderlust sense)*, navigate, chart,
chart a course, set course, traverse, ascend and ascension *as a CTA*, dive,
warp, beam, dock, land, touch down. Treat **arrive** and **depart** as members
of this family: they are one step from `dock` and they carry the same costume.

**Sci-fi furniture.** commander, captain, pilot, crew *(only if it is the
literal product term, and then never dressed)*, mission, mission control,
transmission, signal *(except the internal `--signal-*` tokens)*, beacon,
telemetry, coordinates, sector, quadrant, frontier, horizon *as a label*.

**The test.** If a string would still make sense in a bank's app, it may be too
corporate. If it would make sense in a sci-fi game, it is banned. The correct
register sits between: plain nouns, present tense, short clauses, one beat of
rhythm.

---

## 3. The headline

### 3.1 What shipped

> # Your first match sets where you stand.
>
> Pick a world. The first match starts now. The account comes later, once there
> is a rating worth keeping.

### 3.2 What it replaced, and why that had to go

> # Not a student. Ranked.
>
> Pick one. You play your first match now. No account until you have something
> worth keeping.

The old headline had the right rhythm and the right register, and it was still
wrong twice. `Not a student.` opens the product on a negation, and specifically
on a negation of the reader: the first thing the app says is what you are not.
`No account until you have something worth keeping` is the same failure in the
supporting line, and it puts the emphasis on the absent account rather than on
the rating that is the reason to delay it.

The idea both lines were carrying is worth keeping exactly as it was:
**you get a rating and a standing that you earn, instead of a syllabus you work
through.** The replacement had to carry that without the subtraction.

### 3.3 Why this one

`Your first match sets where you stand.` does four things at once.

- **It uses the product's own thesis as its verb.** Design system §1.1: *the
  number is a place you stand, not a badge you wear.* The headline is the
  principle, in the reader's second person, without explaining it.
- **It says the whole model in one clause.** A match, immediately, and a
  standing that comes out of it. A reader infers on their own that there is no
  syllabus, because a syllabus does not have a first match.
- **It is present tense and it reports.** Referee, not coach. Nothing is
  promised, nothing is congratulated.
- **It is a shape at 96px.** 37 characters against a 22ch measure gives two
  balanced lines, and the second line ends on `stand`, which is the word the
  whole product is about.

The supporting line then carries the three facts the headline deliberately
leaves out, as three clauses of rising length: which action to take, when play
starts, and what the account is for. `The account comes later, once there is a
rating worth keeping` is the positive form of the old sentence: same fact, and
the emphasis now sits on the rating instead of on the missing account.

### 3.4 Candidates that were rejected

| Candidate | Why it lost |
|---|---|
| `Standing, not progress.` | The sharpest of the lot and the most on-thesis, but it is the old headline's move in a new coat: an `X, not Y` frame whose whole force comes from the negation. Rule 1.2 exists to stop exactly this. |
| `You arrive ranked.` | Two words, excellent rhythm, and `arrive` is in the voyage family alongside `dock` and `land`. Rejected on §2 rather than on taste. |
| `Rated from your first match.` | Correct, short, and passive. The reader is the object of the sentence in a product whose entire argument is that the reader is the agent. |
| `Everyone here has a number.` | Good atmosphere, and it describes the other players rather than the reader. It also has to be decoded, and a headline that needs a second pass is a headline that lost. |
| `You get a rating. Then you defend it.` | Right shape, two clauses, second shorter. `Defend` is a bigger promise than the product keeps at this moment: on the world select nobody has anything to defend yet. Hold it for the profile, where it is true. |
| `A rating, earned in public.` | An elegant fragment making a claim the screen cannot support, since nothing about the ladder's visibility is on this page. |
| `Your first match decides where you stand.` | The near-miss. `Decides` is a verdict word, and it belongs to the judge; `sets` is what a first result does to a rating. One word apart and the wrong one puts the product's authority in the wrong place. |
| `Play a match. Take your rating.` | Two imperatives back to back reads as instructions, and the second one is not true: you do not take a rating, it comes out of the result. |

---

## 4. The rewrite table

Every string changed in this pass. **Before** is what shipped. **Rule** is the
one it broke.

| # | Where | Before | Rule | After |
|---|---|---|---|---|
| 1 | Headline, `src/app/page.tsx` | `Not a student. Ranked.` | 1.2 opening negation, and it negates the reader | `Your first match sets where you stand.` |
| 2 | Hero support | `Pick one. You play your first match now. No account until you have something worth keeping.` | 1.2 `no X until Y` | `Pick a world. The first match starts now. The account comes later, once there is a rating worth keeping.` |
| 3 | Guest session line | `Playing as a guest. Your rating is being saved.` | 1.6, and the progressive tense makes a saved rating sound provisional | `Playing as a guest. Your rating is saved and follows you into an account.` |
| 4 | `ERRORS.rate_limited` | `Too many new sessions from this network right now. Try again shortly.` | `design:ux-copy`: `shortly` is not an instruction | `This network has used up its new sessions for the hour. Wait a few minutes, then pick a world again.` |
| 5 | `ERRORS.guests_disabled` | `Guest play is unavailable right now.` | states a fact and offers the reader nothing to do | `Guest play is paused right now. Sign in to enter a world.` |
| 6 | `ERRORS.linking_disabled` | `Account linking is unavailable right now.` | same, and it leaves the reader wondering what happened to their rating | `Account linking is paused right now. Your rating is saved and stays with this browser.` |
| 7 | `ERRORS.unknown_world` | `That world does not exist.` | pure negation, no way out | `That link does not name a world. Pick one from the list below.` |
| 8 | `ERRORS.world_not_launched` | `That one is not open yet.` | `That one` has no referent once the reader is back on the list | `That world is closed for now. The open ones are listed below.` |
| 9 | `ERRORS.no_items` | `That ladder has nothing to set as a task yet.` | describes an internal data condition in internal words | `That ladder is still waiting on its first prompts. Pick another ladder in this world.` |
| 10 | `ERRORS.no_opponent` | `Nobody to face there yet.` | 1.2, opens on `Nobody` | `That ladder is waiting on a second player. Pick another ladder in this world.` |
| 11 | `ERRORS.unknown` | `Something went wrong starting your session.` | the generic apology shape. `Something` and `went wrong` are both refusals to say anything | `The session stopped short of starting. Pick a world to try again.` |
| 12 | Closed-world list, `src/app/page.tsx` | *(no accessible name at all)* | a screen reader met four disabled rows with no explanation | `Worlds opening later` and `Worlds you can enter now`, both `sr-only` |

Rows 4 through 11 all follow one structure, which is the structure every new
error string must follow:

> **What happened, in the reader's terms. Then the one thing they can do.**
> Present tense. No apology. No cause the reader cannot act on.

Row 11 is the one worth reading twice. `Something went wrong` is the default
that every product reaches for and it is the only string in the set that tells
the reader nothing at all: not what failed, not whether it will fail again, not
what to press. `The session stopped short of starting` is barely more
informative and it is honest about its own vagueness, which buys back the trust
that a fake apology spends.

### 4.1 Strings deliberately left alone

- **The world concepts** (`The Cloud Sea`, `The Celadon Coast`, `The Ink
  Valley`, `The Long Sun`, `The Salt Flats`, `The Standing Stones`, `The Lichen
  Steppe`) in `src/lib/design/worlds.ts`. They are already doing exactly what §1.6
  asks: concrete physical nouns, no celestial vocabulary, no explanation. `The
  Long Sun` in particular carries more atmosphere than any sentence could.
- **`src/lib/actions/enter-world.ts`** contains no reader-facing string and now
  says so in a comment. It moves codes; the sentences live in the `ERRORS` map in
  `src/app/page.tsx`. That separation is deliberate: a message written inside a
  server action is a message nobody reviews.
- **The `message` fields on `AuthFailure`** in `src/lib/auth/actions.ts`
  (`Guest play is unavailable.`, `No user returned.`, `No session to convert.`)
  are developer-facing and never rendered. They are outside this pass's scope and
  should stay that way; if one is ever shown to a reader, it needs a row in the
  table above first.

### 4.2 The one string that could not be improved

`ERRORS.unknown` is a compromise. `The session stopped short of starting` is
present tense, unapologetic and actionable, and it still cannot say *why*,
because the code path that produces it is by definition the one where the cause
is unknown. Every honest alternative was either vaguer (`Something is failing`)
or a lie (naming a cause the server did not report). The rewrite improves the
shape and the register; it does not fix the underlying problem, which is that
`unknown` catches too much. Narrowing `AuthFailure` so that fewer failures land
here would do more for this string than any wording will.

---

## 5. Writing a new string

1. **Say what happened, then what the reader can do.** If a string has only one
   of those halves, it is not finished.
2. **Read the first three words.** If they are a negation, a hedge, or an
   apology, start again.
3. **Search your draft for the em-dash and en-dash characters** (U+2014 and
   U+2013). Then for `genuinely`, `!`, `Oops`, and any word in §2.
4. **Read it aloud.** Two clauses, the second shorter than the first, is the
   house rhythm. Three clauses of rising length is the other permitted shape and
   it belongs to supporting copy, never to a heading.
5. **Ask whether a bank could ship it.** If yes, it is too corporate. Ask
   whether a space game could ship it. If yes, it is banned. The target is
   between.
6. **At the emotional peak, cut.** A rating delta needs no sentence. A band
   crossing gets three words. The restraint is the brand, and the temptation to
   add a sentence there is the single most reliable way to lose it.
7. **If the string is an empty state**, use the same two halves as an error:
   what this is and why it is empty, then how to start. `No crew yet. Join one,
   or start one and invite two people.`
8. **Put it where it can be reviewed.** Reader-facing strings live in the page
   or component that renders them, or in a named map at the top of that file.
   Never inside a server action, a util, or a catch block.

---

## 6. Where the strings are

| Strings | File |
|---|---|
| World select headline, hero support, guest line, list headings | `src/app/page.tsx` |
| Every failed-entry message | `ERRORS` in `src/app/page.tsx` |
| World names and concepts | `src/lib/design/worlds.ts` |
| Ladder names, verdict, match copy | `src/app/w/**`, `src/components/match/**` |

The rewrite table for strings this product needs but has not built yet, in the
product's own register, is `discovery-taste.md` §4.3. Use it before inventing a
new one: rows 5, 6, 7 and 11 there are the hardest strings in the product and
they are already written.
