-- =============================================================================
-- LoxeLingo — English content seed (CEFR A2–B1). The seventh world.
--
-- Loaded by `npx supabase db reset` through config.toml:
--   [db.seed] sql_paths = ["./seed.sql", "./seeds/*.sql"]
-- The CLI executes each seed file over a plain SQL connection rather than through
-- psql, so a `\ir` include inside seed.sql is a syntax error; that ordered list IS
-- the include mechanism. Section 7 at the bottom of supabase/seed.sql points here.
--
-- Self-contained. It depends only on the migrations — the `en` row in `worlds`
-- (migration 20260806064130_english_world), the `ladders` rows, and
-- `items.external_id` (migration 20260806022357) — and on nothing supabase/seed.sql
-- creates, so it may load in any order relative to the other files in ./seeds.
--
-- IDEMPOTENT, on the same natural keys as the Japanese seed:
--   concepts       -> (world_slug, slug)          [concepts_slug_unique_per_world]
--   items          -> (external_id)               [items_external_id_key, migration 20260806022357]
--   item_concepts  -> (item_id, concept_id)       [primary key]
--   item_stats     -> (item_id)  DO NOTHING       -- never overwrite a calibrated beta
--
-- -----------------------------------------------------------------------------
-- WHY THIS WORLD IS AUTHORED DIFFERENTLY
-- -----------------------------------------------------------------------------
-- Every other world is a foreign language for a native English speaker: the learner
-- reads the instruction in their first language and produces in a second. English
-- inverts that. Nobody whose first language is English enters this world, so:
--
--   1. The instruction text is itself second-language input. Every `instruction`
--      below is one short imperative sentence, present tense, no idiom, no phrasal
--      verb, no relative clause. "Write the past simple form." — not "Supply the
--      appropriate preterite inflection of the verb given below."
--   2. The instruction is never harder than the item. An A2 article item does not
--      get a B1 rubric sentence in front of it.
--   3. The situations are the ones a person actually uses English for when it is
--      nobody in the room's first language: a landlord, a delivery, a manager, a
--      clinic, a team chat. Not tourism, and not any national setting.
--   4. Where a construction differs between US and UK usage, the item is dropped or
--      every defensible form is listed in `accept`. See DIALECT below.
--
-- -----------------------------------------------------------------------------
-- SOURCES AND LICENSING
-- -----------------------------------------------------------------------------
-- Every English string below is HAND-AUTHORED for this seed. Nothing was scraped,
-- downloaded or copied. Specifically NOT used: any CEFR word list, the AWL/GSL, any
-- corpus frequency list, any coursebook, any phrasal-verb dictionary, Tatoeba, any
-- public exam paper. There is therefore no third-party licence to propagate and
-- `items.license = 'proprietary'` on every row.
--
-- One category of external FACT is relied on and is not copyrightable: the CEFR
-- A2/B1 band labels as pedagogical convention. The Council of Europe publishes
-- descriptors, not vocabulary or grammar lists, so `concepts.tier` is an authored
-- judgement, exactly as `N5`/`N4` is in the Japanese seed.
--
-- -----------------------------------------------------------------------------
-- DIALECT. THE RULE THAT KILLED THE MOST ITEMS
-- -----------------------------------------------------------------------------
-- A FORGE item that marks a correct answer wrong is worse than no item, and English
-- is the world where that is easiest to do by accident. Anything below that has two
-- standard forms was either dropped or accepts both:
--   * dropped: have got / have gotten / got as a participle; travelling vs traveling
--     and every -l- doubling verb; learned/learnt, spelled/spelt, burned/burnt,
--     dreamed/dreamt; sneaked/snuck; dived/dove; proved/proven; sank/sunk;
--     shone/shined; fitted/fit; play the piano vs play piano; go to hospital vs go
--     to the hospital; at the weekend vs on the weekend; different from/to/than;
--     Tuesday 5 May vs May 5th; maths vs math.
--   * accepted in full: capitalisation answers with and without the final full stop;
--     both cases of a one-word answer; contracted and uncontracted forms where the
--     item is not about contraction.
-- Every irregular verb used below (buy/bought, teach/taught, write/wrote/written) is
-- identical in US and UK standard written English.
--
-- -----------------------------------------------------------------------------
-- COLD-START DIFFICULTY MAPPING  (items.cold_start_beta, logit scale)
-- -----------------------------------------------------------------------------
-- Identical formula to the Japanese seed, so the two worlds sit on one scale:
--
--   cold_start_beta = tier_base + form_step + ladder_step + closed_step   (clamped [-1.8, 1.6])
--
--   tier_base    A2 = -1.0    B1 = 0.0
--                One logit per CEFR step, mapped onto the same two-band span N5/N4
--                uses. An assumption, not a measurement — the 5% holdout slice exists
--                to correct it. Recalibrate from `item_stats.beta` once any item has
--                real holdout observations.
--
--   form_step    -0.3  very high frequency and fully regular
--                 0.0  default
--                +0.3  an irregular form, a rule with a lexical exception, or a
--                      comprehension question needing one inference step
--                +0.6  irregular AND multi-step (four capitals in one sentence), or a
--                      brief carrying three separate instructions
--                For English the frequency proxy is the verb or noun itself: `make`
--                and `study` take -0.3, `teach` takes +0.3, because the spelling rule
--                is the same in each case and only the exposure differs.
--
--   ladder_step  forge 0.0   recall +0.1 (reading load)   duel +0.2
--
--   closed_step  +0.45 for a 4-option closed item. Not a fudge factor: `expectedCorrect`
--                puts a 1/k guessing floor under a k-choice item, so a 4-option item
--                must sit at -logit((0.70 - 0.25)/0.75) = -0.405 rather than -0.847 to
--                hold expected success at 0.70. The +0.45 shift IS that difference.
--
-- `concepts.frequency_rank` is left NULL for the same reason it is NULL in the Japanese
-- seed: no licence-clean frequency list was used, and inventing ordinals to fill a column
-- named `frequency_rank` would put fabricated precision into the prior.
--
-- `item_stats` is primed with `beta = cold_start_beta` and `beta_n = 5`
-- (`elo.ts CONTENT_PRIOR_PSEUDO_COUNT`).
--
-- -----------------------------------------------------------------------------
-- RECALL IS TEXT-ONLY IN THIS SEED
-- -----------------------------------------------------------------------------
-- Audio playback is not built. Every RECALL item here is READING comprehension:
-- `media_path` is NULL, each prompt carries "modality":"text", and each uses
-- `kind: "brief"` rather than a playback shape, because there is nothing to play.
-- When audio lands, those items are new rows, not edits to these.
--
-- -----------------------------------------------------------------------------
-- PROMPT SHAPE
-- -----------------------------------------------------------------------------
-- Same contract as the Japanese seed, fixed by its two live consumers:
--   * judge-runner.ts `loadMatch` reads `snapshot.task` and requires a STRING.
--   * tasks.ts `choicesFromPrompt` reads `prompt.options` (>= 2) for the guessing floor.
-- `glyph` holds the word shown large on word-form items. English has no separate
-- reading, so `reading` is NULL throughout, and `strokeOrderPath` is NULL: it is never
-- synthesised, and there is nothing to synthesise for a Latin script.
-- =============================================================================


-- =============================================================================
-- 1. CONCEPTS — 31 rows. The stars of the en constellation.
--    tier_rank: 1 = A2, 2 = B1. Ascending = harder, so it sorts as a sequence.
-- =============================================================================

insert into public.concepts
  (world_slug, slug, kind, display_name, native_form, description, tier, tier_rank)
values
  -- --- script (English orthography) ---------------------------------------
  ('en', 'en-script-doubling', 'script', 'Doubling before -ed and -ing', 'stop / stopped',
   'One vowel, one final consonant, stress on the last syllable: the consonant doubles. plan / planning, begin / beginning. Verbs ending in -l are excluded from this world: British and American spelling disagree about them.', 'A2', 1),
  ('en', 'en-script-y-to-i', 'script', 'Final -y becomes -i', 'study / studied',
   'A consonant before the -y turns it to -i: study / studied, city / cities. A vowel before it does not: play / played.', 'A2', 1),
  ('en', 'en-script-silent-e', 'script', 'Dropping the silent -e', 'make / making',
   'The final -e disappears before -ing and -ed: make / making, hope / hoped. It stays before a consonant ending.', 'A2', 1),
  ('en', 'en-script-capitalisation', 'script', 'Capital letters', 'Monday, March, I',
   'English capitalises days, months, languages, nationalities and the pronoun I. Most languages capitalise none of these, so this is interference, not carelessness.', 'A2', 1),

  -- --- phonology -----------------------------------------------------------
  ('en', 'en-phonology-sound-not-letter', 'phonology', 'Sound, not spelling', 'an hour / a university',
   'A or an is chosen by the first SOUND of the next word, not the first letter. an hour has a silent h; a university starts with a y sound.', 'A2', 1),

  -- --- grammar -------------------------------------------------------------
  ('en', 'en-grammar-article-indefinite', 'grammar', 'a and an', 'a / an',
   'One of many, and first mention. English forces an article onto a singular countable noun even where the learner first language uses none.', 'A2', 1),
  ('en', 'en-grammar-article-definite', 'grammar', 'the', 'the',
   'Already mentioned, already known, or the only one there is. Second mention is the clearest case and the one to learn first.', 'A2', 1),
  ('en', 'en-grammar-article-zero', 'grammar', 'No article', 'zero article',
   'Plurals in general, uncountable nouns in general, most names of people, cities, countries and single mountains: no article at all. The hardest article to use, because it is invisible.', 'B1', 2),
  ('en', 'en-grammar-countability', 'grammar', 'Countable and uncountable', 'much / many',
   'Uncountable nouns take no plural -s, no a or an, and take much rather than many. Which nouns those are is not predictable from meaning, which is why it is learned noun by noun.', 'A2', 1),
  ('en', 'en-grammar-quantifiers', 'grammar', 'Quantifiers', 'some / any / much / many',
   'some in statements and offers, any in most questions and negatives, much with uncountables, many with plurals.', 'A2', 1),
  ('en', 'en-grammar-present-simple-continuous', 'grammar', 'Present simple and continuous', 'I work / I am working',
   'Simple for habits and permanent facts, continuous for right now and for temporary situations. State verbs such as know, want and belong stay simple.', 'A2', 1),
  ('en', 'en-grammar-past-simple', 'grammar', 'Past simple', 'worked / went',
   'A finished action at a finished time. The time expression usually decides the tense before the verb does.', 'A2', 1),
  ('en', 'en-grammar-irregular-past', 'grammar', 'Irregular verb forms', 'buy / bought / bought',
   'The three-form verbs. There is no rule; each is a separate fact, and the third form is the one learners skip.', 'A2', 1),
  ('en', 'en-grammar-present-perfect', 'grammar', 'Present perfect', 'have / has + past participle',
   'A past event with a present consequence, and unfinished time up to now. for a length, since a starting point.', 'B1', 2),
  ('en', 'en-grammar-future-forms', 'grammar', 'Talking about the future', 'will / going to / -ing',
   'will for a decision made now, going to for an intention already formed, present continuous for a fixed arrangement with another person.', 'B1', 2),
  ('en', 'en-grammar-modals-obligation', 'grammar', 'Obligation and permission', 'must / have to / should',
   'The trap is the negative: must not forbids, do not have to releases. They are opposites, not variants.', 'B1', 2),
  ('en', 'en-grammar-conditional-first', 'grammar', 'If for a real possibility', 'if + present, will',
   'Present tense after if even though the meaning is future. if it will rain is the error the rule exists to stop.', 'B1', 2),
  ('en', 'en-grammar-preposition-time', 'grammar', 'at, on, in for time', 'at 7 / on Monday / in July',
   'at for a clock time, on for a day or a date, in for a month, season or year. on Monday morning beats in the morning: the day wins.', 'A2', 1),
  ('en', 'en-grammar-preposition-place', 'grammar', 'at, on, in for place', 'at the door / on the table / in the box',
   'in for an enclosed space, on for a surface, at for a point you think of as a position rather than a volume.', 'A2', 1),
  ('en', 'en-grammar-preposition-dependent', 'grammar', 'Fixed prepositions', 'depend on, interested in',
   'The preposition belongs to the verb or adjective and carries no meaning of its own. It is vocabulary, not grammar, and it is where a first language leaks through hardest.', 'B1', 2),
  ('en', 'en-grammar-phrasal-verbs', 'grammar', 'Phrasal verbs', 'look after, run out of',
   'Verb plus particle, meaning something the two words do not mean apart. With a two-word phrasal verb the pronoun goes in the middle: turn it off, never turn off it.', 'B1', 2),
  ('en', 'en-grammar-questions', 'grammar', 'Question form', 'Does she live here?',
   'English builds a question with an auxiliary and inverted order. do and does carry the tense, so the main verb goes back to its base form.', 'A2', 1),
  ('en', 'en-grammar-comparatives', 'grammar', 'Comparing', 'cheaper than / more useful than',
   'Short adjectives take -er, longer ones take more, and a handful are irregular: good / better, bad / worse.', 'A2', 1),
  ('en', 'en-grammar-gerund-infinitive', 'grammar', '-ing or to after a verb', 'enjoy doing / decide to do',
   'The first verb decides. enjoy, finish and avoid take -ing; decide, want and need take to. There is no meaning rule to derive it from.', 'B1', 2),

  -- --- lexeme ---------------------------------------------------------------
  ('en', 'en-lexeme-time-expressions', 'lexeme', 'Time expressions', 'ago / for / since / yet',
   'The words that fix the tense: ago and last night force the past simple, since and so far pull the present perfect.', 'A2', 1),
  ('en', 'en-lexeme-uncountable-nouns', 'lexeme', 'Nouns that are uncountable in English', 'advice, luggage, news',
   'information, advice, furniture, luggage, news, money, work, homework. Most of them are countable in most other languages, so an advice and two informations are the errors this concept exists to remove.', 'A2', 1),
  ('en', 'en-lexeme-collocation-make-do', 'lexeme', 'make or do', 'make a decision / do the homework',
   'Many languages have one verb here. English splits it and the split is not logical: you make a decision, a mistake and a plan, but you do the homework, the shopping and your best.', 'B1', 2),

  -- --- pragmatics -----------------------------------------------------------
  ('en', 'en-pragmatics-register', 'pragmatics', 'Formal and informal', 'Could you / Give me',
   'Decided before the first word: who is reading this. Contractions, first names and short sentences are informal; the same message to a landlord is not. Mixing the two inside one message is the most visible error.', 'B1', 2),
  ('en', 'en-pragmatics-requests', 'pragmatics', 'Asking for something', 'Could you / Would you mind',
   'A direct imperative sounds like an order in English even with please on the end. The polite form is a question about ability or willingness.', 'B1', 2),
  ('en', 'en-pragmatics-email-conventions', 'pragmatics', 'Email shape', 'Subject / Dear / Best wishes',
   'A subject line that says the point, one opening, one reason, one ask, one sign-off. English business email is short, and length reads as trouble rather than as respect.', 'B1', 2),
  ('en', 'en-pragmatics-softening', 'pragmatics', 'Softening bad news', 'I am afraid / unfortunately',
   'English delivers a refusal or a problem behind a hedge. I am afraid I cannot, unfortunately, sorry for the late reply. Without it a true sentence still reads as rude.', 'B1', 2)
on conflict (world_slug, slug) do update set
  kind         = excluded.kind,
  display_name = excluded.display_name,
  native_form  = excluded.native_form,
  description  = excluded.description,
  tier         = excluded.tier,
  tier_rank    = excluded.tier_rank,
  is_active    = true;


-- -----------------------------------------------------------------------------
-- 1b. The forest. `concepts.parent_id` is both the mastery tree and the
--     constellation, so it is wired by slug (ids are identity-generated).
--     Re-running is a no-op: the same pairs resolve to the same ids.
-- -----------------------------------------------------------------------------

update public.concepts child
set parent_id = parent.id
from (values
  -- Articles hang off the indefinite article, because a/an is the first one a
  -- learner is forced to produce and zero article is the last one they trust.
  ('en-grammar-article-definite',          'en-grammar-article-indefinite'),
  ('en-grammar-article-zero',              'en-grammar-article-definite'),
  ('en-phonology-sound-not-letter',        'en-grammar-article-indefinite'),
  ('en-grammar-countability',              'en-grammar-article-indefinite'),
  ('en-lexeme-uncountable-nouns',          'en-grammar-countability'),
  ('en-grammar-quantifiers',               'en-grammar-countability'),

  -- Spelling rules are all consequences of adding -ed or -ing, so they hang off
  -- the two tenses that add them.
  ('en-script-doubling',                   'en-grammar-present-simple-continuous'),
  ('en-script-silent-e',                   'en-grammar-present-simple-continuous'),
  ('en-script-y-to-i',                     'en-grammar-past-simple'),
  ('en-grammar-irregular-past',            'en-grammar-past-simple'),
  ('en-grammar-present-perfect',           'en-grammar-irregular-past'),
  ('en-lexeme-time-expressions',           'en-grammar-past-simple'),
  ('en-grammar-future-forms',              'en-grammar-present-simple-continuous'),
  ('en-grammar-conditional-first',         'en-grammar-future-forms'),
  ('en-grammar-questions',                 'en-grammar-present-simple-continuous'),
  ('en-grammar-gerund-infinitive',         'en-grammar-present-simple-continuous'),

  ('en-grammar-preposition-place',         'en-grammar-preposition-time'),
  ('en-grammar-preposition-dependent',     'en-grammar-preposition-time'),
  ('en-grammar-phrasal-verbs',             'en-grammar-preposition-dependent'),
  ('en-lexeme-collocation-make-do',        'en-grammar-preposition-dependent'),

  ('en-pragmatics-requests',               'en-pragmatics-register'),
  ('en-pragmatics-softening',              'en-pragmatics-register'),
  ('en-pragmatics-email-conventions',      'en-pragmatics-register'),
  ('en-grammar-modals-obligation',         'en-pragmatics-requests')
) as edge(child_slug, parent_slug)
join public.concepts parent
  on parent.world_slug = 'en' and parent.slug = edge.parent_slug
where child.world_slug = 'en' and child.slug = edge.child_slug;


-- =============================================================================
-- 2. ITEMS — 35 rows: 15 FORGE, 15 DUEL, 5 RECALL.
--    jsonb is dollar-quoted ($j$…$j$) so no apostrophe needs escaping — which
--    matters more here than in the Japanese seed, where there were none.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2a. FORGE — the mechanical layer, where English is genuinely hard for a learner.
--     3 irregular forms · 3 spelling rules · 1 capitalisation · 4 article choices ·
--     2 countability · 2 preposition selections.
--
--     Every item here has exactly one defensible answer in both standard dialects.
--     DROPPED for ambiguity, and why:
--       * "Write the -ing form of travel."   travelling (UK) / traveling (US).
--       * "Write the past participle of get." got (UK) / gotten (US).
--       * "She plays ___ piano."             the piano (UK+US) / piano (US, common).
--       * "He goes to ___ school."           zero article (as a pupil) and the
--                                            (as a visitor) are both grammatical.
--       * "___ life in a big city is hard."  zero and the are both defensible.
--       * "We arrived ___ the station."      at is standard, in is defensible for
--                                            a large terminus.
-- -----------------------------------------------------------------------------

insert into public.items
  (external_id, world_slug, ladder_slug, kind, prompt, answer,
   rubric_version, constraint_text, time_limit_ms, cold_start_beta, source, license)
values

-- ---- irregular forms (free response) ----------------------------------------
('en-forge-past-buy', 'en', 'forge', 'verb_form',
 $j${"kind":"glyph","glyph":"buy","reading":null,"strokeOrderPath":null,
     "instruction":"Write the past simple form.",
     "task":"Write the past simple form of the verb: buy.",
     "input":{"label":"Past simple","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"bought","accept":["bought","Bought"],
     "note":"Irregular and identical in US and UK usage. buyed is the regularised error. The past simple and the past participle are the same word here, which is why this verb comes before write."}$j$::jsonb,
 'forge@1', 'PAST SIMPLE', 15000, -1.0, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-past-teach', 'en', 'forge', 'verb_form',
 $j${"kind":"glyph","glyph":"teach","reading":null,"strokeOrderPath":null,
     "instruction":"Write the past simple form.",
     "task":"Write the past simple form of the verb: teach.",
     "input":{"label":"Past simple","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"taught","accept":["taught","Taught"],
     "note":"Same -aught family as catch and buy, but far less frequent, so the form is guessed rather than known. teached and taughted are the two errors."}$j$::jsonb,
 'forge@1', 'PAST SIMPLE', 15000, -0.7, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-participle-write', 'en', 'forge', 'verb_form',
 $j${"kind":"glyph","glyph":"write","reading":null,"strokeOrderPath":null,
     "instruction":"Write the third form. This is the form after have.",
     "task":"Write the third form of the verb write — the form used after have. For example: I have ___ .",
     "input":{"label":"Third form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"written","accept":["written","Written"],
     "note":"Three-form verb: write / wrote / written. I have wrote is the error, and it is the most common one at B1 because the second form is learned first and then reused."}$j$::jsonb,
 'forge@1', 'THIRD FORM', 20000, 0.0, 'loxelingo-seed-en-v1', 'proprietary'),

-- ---- spelling rules (free response) -----------------------------------------
('en-forge-spelling-plan-ing', 'en', 'forge', 'spelling',
 $j${"kind":"glyph","glyph":"plan","reading":null,"strokeOrderPath":null,
     "instruction":"Write the -ing form.",
     "task":"Write the -ing form of the verb: plan.",
     "input":{"label":"-ing form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"planning","accept":["planning","Planning"],
     "note":"One vowel plus one final consonant with the stress on that syllable, so the n doubles. planing is a different word."}$j$::jsonb,
 'forge@1', '-ING FORM', 15000, -1.0, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-spelling-study-past', 'en', 'forge', 'spelling',
 $j${"kind":"glyph","glyph":"study","reading":null,"strokeOrderPath":null,
     "instruction":"Write the past simple form.",
     "task":"Write the past simple form of the verb: study.",
     "input":{"label":"Past simple","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"studied","accept":["studied","Studied"],
     "note":"A consonant before the -y, so it becomes -ied. Contrast play / played, where a vowel comes first. studyed is the error."}$j$::jsonb,
 'forge@1', 'PAST SIMPLE', 15000, -1.3, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-spelling-make-ing', 'en', 'forge', 'spelling',
 $j${"kind":"glyph","glyph":"make","reading":null,"strokeOrderPath":null,
     "instruction":"Write the -ing form.",
     "task":"Write the -ing form of the verb: make.",
     "input":{"label":"-ing form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"making","accept":["making","Making"],
     "note":"The silent -e goes before -ing. makeing is the error, and it survives longer than it should because it is never heard, only written."}$j$::jsonb,
 'forge@1', '-ING FORM', 15000, -1.3, 'loxelingo-seed-en-v1', 'proprietary'),

-- ---- capitalisation (free response) -----------------------------------------
('en-forge-capitals-friday', 'en', 'forge', 'capitalisation',
 $j${"kind":"brief","brief":"i am meeting sarah on friday in march.",
     "instruction":"Write this sentence again with capital letters where English needs them.",
     "task":"Write this sentence again with capital letters where English needs them: i am meeting sarah on friday in march.",
     "input":{"label":"Your sentence","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"I am meeting Sarah on Friday in March.",
     "accept":["I am meeting Sarah on Friday in March.","I am meeting Sarah on Friday in March"],
     "note":"Four capitals: the sentence start, the name, the day and the month. Days and months are lower case in Spanish, French, Italian, Portuguese, Polish, Russian and Turkish, so this is first-language interference and not carelessness. The final full stop is optional in the accepted forms because the item is about capitals."}$j$::jsonb,
 'forge@1', 'CAPITAL LETTERS', 25000, -0.4, 'loxelingo-seed-en-v1', 'proprietary'),

-- ---- article choice ---------------------------------------------------------
-- The first two are free response with the choice named in the instruction, which is
-- what makes them closed: with only a and an on the table, the definite article is
-- not a competing correct answer.
('en-forge-article-an-hour', 'en', 'forge', 'article_choice',
 $j${"kind":"brief","brief":"We waited for ___ hour.",
     "instruction":"Write a or an.",
     "task":"Write a or an: We waited for ___ hour.",
     "input":{"label":"a or an","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"an","accept":["an","An"],
     "note":"The h in hour is silent, so the word begins with a vowel sound. a hour is the error, and it comes from reading the letter instead of hearing the word."}$j$::jsonb,
 'forge@1', 'A OR AN', 15000, -0.7, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-article-a-university', 'en', 'forge', 'article_choice',
 $j${"kind":"brief","brief":"She works at ___ university.",
     "instruction":"Write a or an.",
     "task":"Write a or an: She works at ___ university.",
     "input":{"label":"a or an","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"a","accept":["a","A"],
     "note":"The letter is a vowel but the sound is not: university starts with a y sound. The mirror image of an hour, and the pair is why the rule is about sound."}$j$::jsonb,
 'forge@1', 'A OR AN', 15000, -0.7, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-article-second-mention', 'en', 'forge', 'article_choice',
 $j${"kind":"brief","brief":"I bought a coat and a scarf. ___ coat was too big.",
     "instruction":"Choose the word for the blank.",
     "task":"Choose the word for the blank: I bought a coat and a scarf. ___ coat was too big.",
     "options":["The","A","An","No word"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"The",
     "note":"Second mention. The coat is now the one already named, so it stops being one of many. A coat was too big would introduce a third coat that does not exist."}$j$::jsonb,
 'forge@1', 'CHOOSE THE WORD', 15000, -0.85, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-article-zero-everest', 'en', 'forge', 'article_choice',
 $j${"kind":"brief","brief":"___ Everest is the highest mountain in the world.",
     "instruction":"Choose the word for the blank.",
     "task":"Choose the word for the blank: ___ Everest is the highest mountain in the world.",
     "options":["No word","The","A","An"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"No word",
     "note":"A single mountain takes no article, even though the same sentence uses the twice elsewhere. Ranges do take one — the Alps, the Andes — which is why the rule is about one peak, not about mountains."}$j$::jsonb,
 'forge@1', 'CHOOSE THE WORD', 20000, 0.45, 'loxelingo-seed-en-v1', 'proprietary'),

-- ---- countable and uncountable ----------------------------------------------
('en-forge-uncountable-advice', 'en', 'forge', 'countability_choice',
 $j${"kind":"brief","brief":"She gave me ___ about the exam.",
     "instruction":"Choose the words for the blank.",
     "task":"Choose the words for the blank: She gave me ___ about the exam.",
     "options":["some advice","some advices","an advice","a few advice"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"some advice",
     "note":"advice is uncountable in English: no plural -s, no a or an, and a few needs a plural. To count it you need a piece of advice."}$j$::jsonb,
 'forge@1', 'CHOOSE THE WORDS', 20000, -0.25, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-much-luggage', 'en', 'forge', 'countability_choice',
 $j${"kind":"brief","brief":"How ___ luggage are you taking?",
     "instruction":"Choose the word for the blank.",
     "task":"Choose the word for the blank: How ___ luggage are you taking?",
     "options":["much","many","few","several"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"much",
     "note":"luggage is uncountable, so much. The verb are is not evidence for many: it agrees with you, not with luggage. How many bags would be the countable version of the same question."}$j$::jsonb,
 'forge@1', 'CHOOSE THE WORD', 20000, -0.25, 'loxelingo-seed-en-v1', 'proprietary'),

-- ---- preposition selection --------------------------------------------------
('en-forge-preposition-on-monday', 'en', 'forge', 'preposition_cloze',
 $j${"kind":"brief","brief":"The meeting is ___ Monday morning.",
     "instruction":"Write at, on or in.",
     "task":"Write at, on or in: The meeting is ___ Monday morning.",
     "input":{"label":"at, on or in","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"on","accept":["on","On"],
     "note":"in the morning, but on Monday morning: as soon as a day is named, the day wins and the preposition is on. This is the single most common time-preposition error at A2."}$j$::jsonb,
 'forge@1', 'AT, ON OR IN', 15000, -1.0, 'loxelingo-seed-en-v1', 'proprietary'),

('en-forge-preposition-depend-on', 'en', 'forge', 'preposition_cloze',
 $j${"kind":"brief","brief":"It depends ___ the weather.",
     "instruction":"Write one word in the blank.",
     "task":"Write one word in the blank: It depends ___ the weather.",
     "input":{"label":"One word","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"on","accept":["on","On","upon","Upon"],
     "note":"depend takes on and nothing else; depend of and depend from are direct imports from French, Spanish, Italian and German. depend upon is the same verb in a more formal register and is accepted."}$j$::jsonb,
 'forge@1', 'ONE WORD', 15000, 0.0, 'loxelingo-seed-en-v1', 'proprietary'),

-- -----------------------------------------------------------------------------
-- 2b. DUEL — a situation, a communicative goal, and a constraint. `answer` is NULL:
--     these are judged comparatively against duel@1, which weights task_completion
--     highest, so every constraint below is something a judge can check.
--
--     Character limits are set for English, not carried over from Japanese: a
--     40-character Japanese note is about seven English words, so the limits here
--     run 120–220 characters. Each is tight enough that the learner has to choose,
--     which is the whole point of a constraint.
--
--     The briefs are situations where English is the working language rather than
--     the local one: a landlord, a delivery, a manager, a clinic, a team chat.
-- -----------------------------------------------------------------------------

('en-duel-late-to-cinema', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You are 20 minutes late. Your friend is waiting outside the cinema. You are on the bus. Send one message.",
     "instruction":"Say where you are and when you will arrive.",
     "task":"You are 20 minutes late. Your friend is waiting outside the cinema. You are on the bus. Send one message. Say where you are and when you will arrive.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":120}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 120 CHARACTERS · SAY WHEN YOU WILL ARRIVE', 120000, -0.8,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-sick-email-manager', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You are ill and cannot work today. Write the email to your manager. Start with the subject line.",
     "instruction":"One subject line and two sentences. No more.",
     "task":"You are ill and cannot work today. Write the email to your manager. Start with the subject line. One subject line and two sentences. No more.",
     "input":{"label":"Your email","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · SUBJECT LINE FIRST · FORMAL', 120000, 0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-deadline-extension', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your report is due tomorrow. You need two more days. Write to your manager.",
     "instruction":"Ask, and give one reason. Do not apologise more than once.",
     "task":"Your report is due tomorrow. You need two more days. Write to your manager. Ask, and give one reason. Do not apologise more than once.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · ASK, DO NOT DEMAND · ONE REASON', 120000, 0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-neighbour-noise', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your neighbour plays loud music late at night. You have never met them. Write the note you put under their door.",
     "instruction":"Say what the problem is and what you want. Stay friendly.",
     "task":"Your neighbour plays loud music late at night. You have never met them. Write the note you put under their door. Say what the problem is and what you want. Stay friendly.",
     "input":{"label":"Your note","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · FRIENDLY · NOT ANGRY', 120000, 0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-flat-instructions', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A friend is staying in your flat this weekend. Write the note you leave on the table: the key, the heating, and the cat.",
     "instruction":"Three instructions. Say where each thing is.",
     "task":"A friend is staying in your flat this weekend. Write the note you leave on the table: the key, the heating, and the cat. Three instructions. Say where each thing is.",
     "input":{"label":"Your note","multiline":true,"countUnit":"character","countLimit":220}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 220 CHARACTERS · THREE INSTRUCTIONS · SAY WHERE', 120000, -0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-wrong-size-shoes', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You ordered shoes online. They arrived yesterday in the wrong size. Write to the shop.",
     "instruction":"Say what happened and what you want them to do.",
     "task":"You ordered shoes online. They arrived yesterday in the wrong size. Write to the shop. Say what happened and what you want them to do.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · SAY WHAT YOU WANT TO HAPPEN', 120000, -0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-two-flats', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Two flats. One is cheap and an hour from work. One is expensive and ten minutes away. Write to a friend and tell them which one you have chosen.",
     "instruction":"Compare the two. Give one reason for your decision.",
     "task":"Two flats. One is cheap and an hour from work. One is expensive and ten minutes away. Write to a friend and tell them which one you have chosen. Compare the two. Give one reason for your decision.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":220}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 220 CHARACTERS · COMPARE BOTH · ONE REASON', 120000, 0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-weekend-plans', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A colleague asks what you are doing this weekend. Reply.",
     "instruction":"Two plans. One is already arranged with another person. One is not.",
     "task":"A colleague asks what you are doing this weekend. Reply. Two plans. One is already arranged with another person. One is not.",
     "input":{"label":"Your reply","multiline":true,"countUnit":"character","countLimit":150}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 150 CHARACTERS · TWO PLANS · ONE ALREADY ARRANGED', 120000, -0.8,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-lost-bank-card', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You lost your bank card on the train last night. The phone line is closed. Write the message on the bank website.",
     "instruction":"Say when and where you lost it, and what you want the bank to do.",
     "task":"You lost your bank card on the train last night. The phone line is closed. Write the message on the bank website. Say when and where you lost it, and what you want the bank to do.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · WHEN AND WHERE', 120000, -0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-decline-dinner', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A colleague invites you to dinner on Saturday. You cannot go, and you do not want to say why. Reply.",
     "instruction":"Say no. Then offer another day.",
     "task":"A colleague invites you to dinner on Saturday. You cannot go, and you do not want to say why. Reply. Say no. Then offer another day.",
     "input":{"label":"Your reply","multiline":true,"countUnit":"character","countLimit":150}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 150 CHARACTERS · SAY NO · OFFER ANOTHER DAY', 120000, 0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-move-appointment', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You have an appointment at the clinic on Tuesday at 9:00. You need to move it to Thursday. Write to the clinic.",
     "instruction":"Give both days. Ask them to confirm.",
     "task":"You have an appointment at the clinic on Tuesday at 9:00. You need to move it to Thursday. Write to the clinic. Give both days. Ask them to confirm.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":180}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 180 CHARACTERS · BOTH DAYS · ASK TO CONFIRM', 120000, -0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-first-day-intro', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"It is your first day. Write the message you post in the team chat to introduce yourself.",
     "instruction":"Say what you do and one thing you like. Keep it light.",
     "task":"It is your first day. Write the message you post in the team chat to introduce yourself. Say what you do and one thing you like. Keep it light.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · NOT FORMAL', 120000, 0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-broken-heating', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"The heating in your flat stopped working three days ago. You already called once and nobody came. Write to the landlord.",
     "instruction":"Say how long it has been broken. Ask for a date.",
     "task":"The heating in your flat stopped working three days ago. You already called once and nobody came. Write to the landlord. Say how long it has been broken. Ask for a date.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":200}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 200 CHARACTERS · HOW LONG · ASK FOR A DATE', 120000, 0.5,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-picnic-rain', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You and a friend planned a picnic on Sunday. The forecast now says rain. Write the message.",
     "instruction":"Give one plan for rain and one for sun. Use one sentence with if.",
     "task":"You and a friend planned a picnic on Sunday. The forecast now says rain. Write the message. Give one plan for rain and one for sun. Use one sentence with if.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":180}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 180 CHARACTERS · ONE SENTENCE WITH IF', 120000, 0.2,
 'loxelingo-seed-en-v1', 'proprietary'),

('en-duel-homework-help', 'en', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You do not understand question 4 of the homework. It is due tomorrow. Write to a classmate you do not know well.",
     "instruction":"Ask one clear question. Say when you need the answer.",
     "task":"You do not understand question 4 of the homework. It is due tomorrow. Write to a classmate you do not know well. Ask one clear question. Say when you need the answer.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":180}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 180 CHARACTERS · ONE CLEAR QUESTION', 120000, -0.8,
 'loxelingo-seed-en-v1', 'proprietary'),

-- -----------------------------------------------------------------------------
-- 2c. RECALL — TEXT comprehension only. No audio exists, so `media_path` is NULL and
--     every prompt is marked "modality":"text". Four options each, so the guessing
--     floor is 0.25 and cold_start_beta carries the +0.45 closed_step.
--
--     Each question needs at least one inference step: the answer is never a span
--     the reader can copy out of the passage.
-- -----------------------------------------------------------------------------

('en-recall-parcel-card', 'en', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"WE TRIED TO DELIVER YOUR PARCEL\nNobody was at home at 10:40 on Tuesday.\nYour parcel is now at the Post Office on King Street.\nYou can pick it up from Wednesday morning. Please bring this card and a photo ID.\nWe keep parcels for 14 days.",
     "question":"Ana went to the Post Office on Tuesday evening with the card and her passport. Why did she come back without the parcel?",
     "brief":"WE TRIED TO DELIVER YOUR PARCEL\nNobody was at home at 10:40 on Tuesday.\nYour parcel is now at the Post Office on King Street.\nYou can pick it up from Wednesday morning. Please bring this card and a photo ID.\nWe keep parcels for 14 days.\n\nAna went to the Post Office on Tuesday evening with the card and her passport. Why did she come back without the parcel?",
     "instruction":"Read the card. Then answer the question. There is no audio.",
     "task":"Read the card and answer the question.\n\nWE TRIED TO DELIVER YOUR PARCEL\nNobody was at home at 10:40 on Tuesday.\nYour parcel is now at the Post Office on King Street.\nYou can pick it up from Wednesday morning. Please bring this card and a photo ID.\nWe keep parcels for 14 days.\n\nQuestion: Ana went to the Post Office on Tuesday evening with the card and her passport. Why did she come back without the parcel?",
     "options":["It was too early — the parcel was not ready until Wednesday","She did not have a photo ID","The 14 days had already finished","The parcel was at a different Post Office"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"It was too early — the parcel was not ready until Wednesday",
     "note":"One inference step: from Wednesday morning excludes Tuesday evening. The passport trap works only if the reader does not know a passport is a photo ID, and the 14 days trap works only if from is read as before."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.15, 'loxelingo-seed-en-v1', 'proprietary'),

('en-recall-workshop-moved', 'en', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"Hi everyone,\nThe Friday workshop has moved. It is now on Monday 14th, in the same room, at the same time.\nI have already booked the room, so you do not have to do anything.\nIf you cannot come on Monday, tell me before Thursday and I will send you the notes.\nBest,\nPriya",
     "question":"Monday does not work for you. What should you do?",
     "brief":"Hi everyone,\nThe Friday workshop has moved. It is now on Monday 14th, in the same room, at the same time.\nI have already booked the room, so you do not have to do anything.\nIf you cannot come on Monday, tell me before Thursday and I will send you the notes.\nBest,\nPriya\n\nMonday does not work for you. What should you do?",
     "instruction":"Read the email. Then answer the question. There is no audio.",
     "task":"Read the email and answer the question.\n\nHi everyone,\nThe Friday workshop has moved. It is now on Monday 14th, in the same room, at the same time.\nI have already booked the room, so you do not have to do anything.\nIf you cannot come on Monday, tell me before Thursday and I will send you the notes.\nBest,\nPriya\n\nQuestion: Monday does not work for you. What should you do?",
     "options":["Tell Priya before Thursday","Nothing — Priya sends the notes to everyone","Book a room for Friday","Come to the workshop on Friday as before"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"Tell Priya before Thursday",
     "note":"you do not have to do anything is about the room and is placed there to be mis-taken for the answer. The notes go only to the people who reply, which is the whole force of the if clause."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.55, 'loxelingo-seed-en-v1', 'proprietary'),

('en-recall-lift-notice', 'en', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"BUILDING NOTICE\nThe lift will be out of use from Monday 3rd to Wednesday 5th while it is repaired.\nResidents on floors 5 to 9 can use the service lift at the back of the building. Ask at reception for the code.\nThe stairs are open as usual.",
     "question":"Who needs to ask at reception?",
     "brief":"BUILDING NOTICE\nThe lift will be out of use from Monday 3rd to Wednesday 5th while it is repaired.\nResidents on floors 5 to 9 can use the service lift at the back of the building. Ask at reception for the code.\nThe stairs are open as usual.\n\nWho needs to ask at reception?",
     "instruction":"Read the notice. Then answer the question. There is no audio.",
     "task":"Read the notice and answer the question.\n\nBUILDING NOTICE\nThe lift will be out of use from Monday 3rd to Wednesday 5th while it is repaired.\nResidents on floors 5 to 9 can use the service lift at the back of the building. Ask at reception for the code.\nThe stairs are open as usual.\n\nQuestion: Who needs to ask at reception?",
     "options":["A resident on the 7th floor who wants the service lift","Every resident in the building","A resident on the 2nd floor","Nobody — the stairs are open"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"A resident on the 7th floor who wants the service lift",
     "note":"floors 5 to 9 has to be turned into a specific floor, which is the inference step. The 2nd floor is inside the building but outside the range, and the stairs sentence is a real alternative that answers a different question."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.15, 'loxelingo-seed-en-v1', 'proprietary'),

('en-recall-flatmate-messages', 'en', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"Sam: We have run out of coffee again.\nJo: I am going past the supermarket after work. Do you want me to get some?\nSam: Yes please. We need batteries too, but not the cheap ones — they do not last.\nJo: OK. Home around seven.",
     "question":"What will Jo buy?",
     "brief":"Sam: We have run out of coffee again.\nJo: I am going past the supermarket after work. Do you want me to get some?\nSam: Yes please. We need batteries too, but not the cheap ones — they do not last.\nJo: OK. Home around seven.\n\nWhat will Jo buy?",
     "instruction":"Read the messages. Then answer the question. There is no audio.",
     "task":"Read the messages and answer the question.\n\nSam: We have run out of coffee again.\nJo: I am going past the supermarket after work. Do you want me to get some?\nSam: Yes please. We need batteries too, but not the cheap ones — they do not last.\nJo: OK. Home around seven.\n\nQuestion: What will Jo buy?",
     "options":["Coffee, and batteries that are not the cheap ones","Coffee only","The cheap batteries only","Nothing until tomorrow"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"Coffee, and batteries that are not the cheap ones",
     "note":"run out of is the phrasal verb the first line turns on: it means there is none left, not that they went outside. some in the offer refers back to coffee, and the not clause narrows the second item rather than cancelling it."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.45, 'loxelingo-seed-en-v1', 'proprietary'),

('en-recall-evening-courses', 'en', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"EVENING ENGLISH COURSES — September to December\nCourse A meets twice a week. Fee: 180. It is for students who want to practise speaking.\nCourse B meets once a week. Fee: 110. It is for students who need help with writing.\nRegister before 25th August.",
     "question":"Marco works late most evenings. He wants to write better emails at work. Which course is right for him?",
     "brief":"EVENING ENGLISH COURSES — September to December\nCourse A meets twice a week. Fee: 180. It is for students who want to practise speaking.\nCourse B meets once a week. Fee: 110. It is for students who need help with writing.\nRegister before 25th August.\n\nMarco works late most evenings. He wants to write better emails at work. Which course is right for him?",
     "instruction":"Read the notice. Then answer the question. There is no audio.",
     "task":"Read the notice and answer the question.\n\nEVENING ENGLISH COURSES — September to December\nCourse A meets twice a week. Fee: 180. It is for students who want to practise speaking.\nCourse B meets once a week. Fee: 110. It is for students who need help with writing.\nRegister before 25th August.\n\nQuestion: Marco works late most evenings. He wants to write better emails at work. Which course is right for him?",
     "options":["Course B","Course A","Both courses","Neither course"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"Course B",
     "note":"Two steps, and they agree: writing points at B, and working late most evenings makes once a week the only realistic one. Course A is cheaper per meeting, which is the arithmetic distractor for a reader who compares only the numbers."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.85, 'loxelingo-seed-en-v1', 'proprietary')

on conflict (external_id) do update set
  world_slug      = excluded.world_slug,
  ladder_slug     = excluded.ladder_slug,
  kind            = excluded.kind,
  prompt          = excluded.prompt,
  answer          = excluded.answer,
  rubric_version  = excluded.rubric_version,
  constraint_text = excluded.constraint_text,
  time_limit_ms   = excluded.time_limit_ms,
  cold_start_beta = excluded.cold_start_beta,
  source          = excluded.source,
  license         = excluded.license,
  is_active       = true;


-- =============================================================================
-- 3. ITEM → CONCEPT MAPPING
--    Every item maps to at least one concept, and every concept receives at least
--    one item. weight 1.0 = what the item is *for*; lower weights = what it also
--    exercises. These weights are what user_concept_mastery attributes a result
--    across, so a secondary concept must not collect full credit for a result that
--    was really about something else.
-- =============================================================================

insert into public.item_concepts (item_id, concept_id, weight)
select i.id, c.id, m.weight::real
from (values
  -- FORGE · irregular forms
  ('en-forge-past-buy',              'en-grammar-irregular-past',           1.0),
  ('en-forge-past-buy',              'en-grammar-past-simple',              0.7),
  ('en-forge-past-teach',            'en-grammar-irregular-past',           1.0),
  ('en-forge-past-teach',            'en-grammar-past-simple',              0.7),
  ('en-forge-participle-write',      'en-grammar-irregular-past',           1.0),
  ('en-forge-participle-write',      'en-grammar-present-perfect',          0.8),

  -- FORGE · spelling
  ('en-forge-spelling-plan-ing',     'en-script-doubling',                  1.0),
  ('en-forge-spelling-plan-ing',     'en-grammar-present-simple-continuous', 0.5),
  ('en-forge-spelling-study-past',   'en-script-y-to-i',                    1.0),
  ('en-forge-spelling-study-past',   'en-grammar-past-simple',              0.6),
  ('en-forge-spelling-make-ing',     'en-script-silent-e',                  1.0),
  ('en-forge-spelling-make-ing',     'en-grammar-present-simple-continuous', 0.5),

  -- FORGE · capitalisation
  ('en-forge-capitals-friday',       'en-script-capitalisation',            1.0),
  ('en-forge-capitals-friday',       'en-grammar-preposition-time',         0.5),
  ('en-forge-capitals-friday',       'en-grammar-present-simple-continuous', 0.4),

  -- FORGE · articles
  ('en-forge-article-an-hour',       'en-phonology-sound-not-letter',       1.0),
  ('en-forge-article-an-hour',       'en-grammar-article-indefinite',       0.8),
  ('en-forge-article-a-university',  'en-phonology-sound-not-letter',       1.0),
  ('en-forge-article-a-university',  'en-grammar-article-indefinite',       0.8),
  ('en-forge-article-second-mention','en-grammar-article-definite',         1.0),
  ('en-forge-article-second-mention','en-grammar-article-indefinite',       0.7),
  ('en-forge-article-zero-everest',  'en-grammar-article-zero',             1.0),
  ('en-forge-article-zero-everest',  'en-grammar-article-definite',         0.6),

  -- FORGE · countability
  ('en-forge-uncountable-advice',    'en-lexeme-uncountable-nouns',         1.0),
  ('en-forge-uncountable-advice',    'en-grammar-countability',             0.8),
  ('en-forge-uncountable-advice',    'en-grammar-quantifiers',              0.6),
  ('en-forge-much-luggage',          'en-grammar-countability',             1.0),
  ('en-forge-much-luggage',          'en-grammar-quantifiers',              0.8),
  ('en-forge-much-luggage',          'en-lexeme-uncountable-nouns',         0.7),

  -- FORGE · prepositions
  ('en-forge-preposition-on-monday', 'en-grammar-preposition-time',         1.0),
  ('en-forge-preposition-on-monday', 'en-lexeme-time-expressions',          0.5),
  ('en-forge-preposition-depend-on', 'en-grammar-preposition-dependent',    1.0),

  -- DUEL
  ('en-duel-late-to-cinema',         'en-grammar-future-forms',             1.0),
  ('en-duel-late-to-cinema',         'en-pragmatics-softening',             0.7),
  ('en-duel-late-to-cinema',         'en-lexeme-time-expressions',          0.5),
  ('en-duel-sick-email-manager',     'en-pragmatics-email-conventions',     1.0),
  ('en-duel-sick-email-manager',     'en-pragmatics-register',              0.8),
  ('en-duel-sick-email-manager',     'en-grammar-modals-obligation',        0.4),
  ('en-duel-deadline-extension',     'en-pragmatics-requests',              1.0),
  ('en-duel-deadline-extension',     'en-pragmatics-softening',             0.7),
  ('en-duel-deadline-extension',     'en-grammar-modals-obligation',        0.6),
  ('en-duel-neighbour-noise',        'en-pragmatics-register',              1.0),
  ('en-duel-neighbour-noise',        'en-pragmatics-requests',              0.8),
  ('en-duel-neighbour-noise',        'en-grammar-present-simple-continuous', 0.5),
  ('en-duel-flat-instructions',      'en-grammar-preposition-place',        1.0),
  ('en-duel-flat-instructions',      'en-grammar-phrasal-verbs',            0.7),
  ('en-duel-flat-instructions',      'en-grammar-modals-obligation',        0.5),
  ('en-duel-wrong-size-shoes',       'en-grammar-past-simple',              1.0),
  ('en-duel-wrong-size-shoes',       'en-pragmatics-requests',              0.7),
  ('en-duel-wrong-size-shoes',       'en-grammar-article-definite',         0.5),
  ('en-duel-two-flats',              'en-grammar-comparatives',             1.0),
  ('en-duel-two-flats',              'en-lexeme-collocation-make-do',       0.6),
  ('en-duel-two-flats',              'en-pragmatics-register',              0.4),
  ('en-duel-weekend-plans',          'en-grammar-future-forms',             1.0),
  ('en-duel-weekend-plans',          'en-grammar-present-simple-continuous', 0.8),
  ('en-duel-lost-bank-card',         'en-grammar-past-simple',              1.0),
  ('en-duel-lost-bank-card',         'en-grammar-preposition-place',        0.7),
  ('en-duel-lost-bank-card',         'en-grammar-preposition-time',         0.6),
  ('en-duel-decline-dinner',         'en-pragmatics-softening',             1.0),
  ('en-duel-decline-dinner',         'en-grammar-future-forms',             0.6),
  ('en-duel-decline-dinner',         'en-pragmatics-register',              0.5),
  ('en-duel-move-appointment',       'en-pragmatics-requests',              1.0),
  ('en-duel-move-appointment',       'en-grammar-preposition-time',         0.8),
  ('en-duel-move-appointment',       'en-grammar-questions',                0.5),
  ('en-duel-first-day-intro',        'en-pragmatics-register',              1.0),
  ('en-duel-first-day-intro',        'en-grammar-gerund-infinitive',        0.6),
  ('en-duel-first-day-intro',        'en-grammar-present-simple-continuous', 0.5),
  ('en-duel-broken-heating',         'en-grammar-present-perfect',          1.0),
  ('en-duel-broken-heating',         'en-lexeme-time-expressions',          0.8),
  ('en-duel-broken-heating',         'en-grammar-questions',                0.5),
  ('en-duel-picnic-rain',            'en-grammar-conditional-first',        1.0),
  ('en-duel-picnic-rain',            'en-grammar-future-forms',             0.6),
  ('en-duel-homework-help',          'en-grammar-questions',                1.0),
  ('en-duel-homework-help',          'en-pragmatics-requests',              0.7),
  ('en-duel-homework-help',          'en-lexeme-collocation-make-do',       0.5),

  -- RECALL
  ('en-recall-parcel-card',          'en-grammar-preposition-time',         1.0),
  ('en-recall-parcel-card',          'en-grammar-phrasal-verbs',            0.7),
  ('en-recall-parcel-card',          'en-grammar-modals-obligation',        0.5),
  ('en-recall-workshop-moved',       'en-grammar-conditional-first',        1.0),
  ('en-recall-workshop-moved',       'en-grammar-modals-obligation',        0.8),
  ('en-recall-workshop-moved',       'en-grammar-present-perfect',          0.6),
  ('en-recall-workshop-moved',       'en-pragmatics-email-conventions',     0.4),
  ('en-recall-lift-notice',          'en-grammar-preposition-place',        1.0),
  ('en-recall-lift-notice',          'en-grammar-quantifiers',              0.5),
  ('en-recall-lift-notice',          'en-grammar-article-definite',         0.4),
  ('en-recall-flatmate-messages',    'en-grammar-phrasal-verbs',            1.0),
  ('en-recall-flatmate-messages',    'en-grammar-countability',             0.7),
  ('en-recall-flatmate-messages',    'en-grammar-future-forms',             0.6),
  ('en-recall-flatmate-messages',    'en-grammar-quantifiers',              0.5),
  ('en-recall-evening-courses',      'en-grammar-gerund-infinitive',        1.0),
  ('en-recall-evening-courses',      'en-grammar-comparatives',             0.8),
  ('en-recall-evening-courses',      'en-grammar-preposition-time',         0.5),
  ('en-recall-evening-courses',      'en-grammar-article-zero',             0.4)
) as m(item_key, concept_slug, weight)
join public.items    i on i.external_id = m.item_key
join public.concepts c on c.world_slug = 'en' and c.slug = m.concept_slug
on conflict (item_id, concept_id) do update set weight = excluded.weight;


-- =============================================================================
-- 4. PRIME item_stats FROM THE CONTENT PRIOR
--    beta := cold_start_beta, beta_n := 5 (elo.ts CONTENT_PRIOR_PSEUDO_COUNT), which is
--    what stops the first holdout observation from washing the prior out.
--    DO NOTHING, never DO UPDATE: re-running must not overwrite a beta that holdout
--    observations have since moved.
-- =============================================================================

insert into public.item_stats (item_id, beta, beta_n)
select i.id, coalesce(i.cold_start_beta, 0)::double precision, 5
from public.items i
where i.source = 'loxelingo-seed-en-v1'
on conflict (item_id) do nothing;


-- =============================================================================
-- 5. ASSERTIONS. The seed fails loudly rather than leaving the world half-playable.
-- =============================================================================

do $$
declare
  n_world      integer;
  n_concepts   integer;
  n_items      integer;
  n_duel       integer;
  n_forge      integer;
  n_recall     integer;
  n_mappings   integer;
  n_orphans    integer;
  n_starless   integer;
  n_beta_range integer;
  n_recall_media integer;
begin
  select count(*) into n_world from public.worlds where slug = 'en';
  if n_world = 0 then
    raise exception 'seed: the en world row is missing — migration 20260806064130_english_world did not run';
  end if;

  select count(*) into n_concepts from public.concepts where world_slug = 'en';
  select count(*) into n_items    from public.items    where source = 'loxelingo-seed-en-v1';
  select count(*) into n_duel     from public.items where source = 'loxelingo-seed-en-v1' and ladder_slug = 'duel';
  select count(*) into n_forge    from public.items where source = 'loxelingo-seed-en-v1' and ladder_slug = 'forge';
  select count(*) into n_recall   from public.items where source = 'loxelingo-seed-en-v1' and ladder_slug = 'recall';
  select count(*) into n_mappings from public.item_concepts ic
    join public.items i on i.id = ic.item_id where i.source = 'loxelingo-seed-en-v1';

  -- Every item maps to >= 1 concept.
  select count(*) into n_orphans
  from public.items i
  where i.source = 'loxelingo-seed-en-v1'
    and not exists (select 1 from public.item_concepts ic where ic.item_id = i.id);

  -- A concept with no items can never be mastered: a dead star in the constellation.
  select count(*) into n_starless
  from public.concepts c
  where c.world_slug = 'en'
    and not exists (select 1 from public.item_concepts ic where ic.concept_id = c.id);

  select count(*) into n_beta_range
  from public.items i
  where i.source = 'loxelingo-seed-en-v1'
    and (i.cold_start_beta is null or i.cold_start_beta < -1.8 or i.cold_start_beta > 1.6);

  -- RECALL is text-only in this seed. A media_path here would be a promise of audio
  -- that does not exist.
  select count(*) into n_recall_media
  from public.items i
  where i.source = 'loxelingo-seed-en-v1' and i.ladder_slug = 'recall' and i.media_path is not null;

  if n_orphans > 0 then
    raise exception 'seed: % en item(s) map to no concept', n_orphans;
  end if;
  if n_starless > 0 then
    raise exception 'seed: % en concept(s) have no item and can never be mastered', n_starless;
  end if;
  if n_beta_range > 0 then
    raise exception 'seed: % en item(s) have a cold_start_beta outside [-1.8, 1.6]', n_beta_range;
  end if;
  if n_recall_media > 0 then
    raise exception 'seed: % en RECALL item(s) carry a media_path but no audio exists', n_recall_media;
  end if;
  if n_duel <> 15 or n_forge <> 15 or n_recall <> 5 then
    raise exception 'seed: en ladder counts are %/duel %/forge %/recall, expected 15/15/5', n_duel, n_forge, n_recall;
  end if;

  raise notice 'LoxeLingo en seed: % concepts, % items (% duel, % forge, % recall), % item->concept mappings',
    n_concepts, n_items, n_duel, n_forge, n_recall, n_mappings;
end $$;
