-- =============================================================================
-- LoxeLingo — Japanese content seed (N5–N4). The first real playable content.
--
-- Picked up automatically by `npx supabase db reset` (config.toml [db.seed]).
-- Runs AFTER all migrations, as `postgres`, so RLS is not in the way.
--
-- IDEMPOTENT. Every insert conflicts on a natural key:
--   concepts       -> (world_slug, slug)          [concepts_slug_unique_per_world]
--   items          -> (external_id)               [items_external_id_key, migration 20260806022357]
--   item_concepts  -> (item_id, concept_id)       [primary key]
--   item_stats     -> (item_id)  DO NOTHING       -- never overwrite a calibrated beta
--
-- -----------------------------------------------------------------------------
-- SOURCES AND LICENSING
-- -----------------------------------------------------------------------------
-- Every Japanese string below is HAND-AUTHORED for this seed. Nothing was scraped,
-- downloaded, or copied from a dataset. Specifically NOT used: KANJIDIC, JMdict/EDICT,
-- Tatoeba, any JLPT wordlist dump, any frequency corpus. There is therefore no third-party
-- licence to propagate, and `items.license = 'proprietary'` on every row.
--
-- Two categories of external FACT are relied on, neither of which is copyrightable and
-- neither of which was bulk-copied:
--   * JLPT level bands (N5 / N4) as pedagogical convention. The JLPT publishes no official
--     vocabulary or kanji list, so `concepts.tier` is an authored judgement, not a transcription.
--   * The MEXT kyōiku-kanji school-grade assignment, used ONLY as a frequency proxy inside the
--     difficulty prior below (it is grade *bands*, applied by hand, not a copied table).
--
-- -----------------------------------------------------------------------------
-- COLD-START DIFFICULTY MAPPING  (items.cold_start_beta, logit scale)
-- -----------------------------------------------------------------------------
-- `beta` lives on the same logit scale as `user_ratings.theta`; a new learner starts at
-- theta = 0 (elo.ts `newLearnerRating`). `tasks.ts` targets P(correct) = 0.70, i.e. an ideal
-- free-response beta of `-logit(0.70) = -0.847`, with an acceptance band of beta ∈ [-1.10, 0].
-- The seed is aimed at that band on purpose: N5 items sit at or below it, N4 items climb out
-- of it, so the N5→N4 span is exactly what a beginner's first few hundred serves will traverse.
--
--   cold_start_beta = tier_base + form_step + ladder_step + closed_step   (clamped [-1.8, 1.6])
--
--   tier_base    N5 = -1.0    N4 = 0.0
--                One logit per JLPT step. An assumption, not a measurement — it is the thing
--                the 5% holdout slice exists to correct. Recalibrate from `item_stats.beta`
--                once any item has real holdout observations.
--
--   form_step    -0.3  very high frequency, fully regular
--                 0.0  default
--                +0.3  irregular reading (jukujikun), rendaku, a rarer onbin, or a
--                      comprehension question that needs one inference step
--                +0.6  irregular AND multi-step (e.g. 行く→行って), or a two-clause construction
--                For kanji items the -0.3/0/+0.3 rung is chosen with MEXT school grade as the
--                frequency proxy: grade 1–2 kanji trend to -0.3, grade 4+ to +0.3.
--
--   ladder_step  forge 0.0   recall +0.1 (reading load)   duel +0.2
--                Open production at a given tier is harder than recognition at the same tier.
--
--   closed_step  +0.45 for a 4-option closed item, 0 for free response.
--                NOT a fudge factor: `expectedCorrect` puts a 1/k guessing floor under a
--                k-choice item, so to hold expected success at 0.70 a 4-option item must sit at
--                `-logit((0.70 - 0.25)/0.75) = -0.405` rather than -0.847. The +0.45 shift IS
--                that difference, so a closed and an open item carrying the same
--                tier_base+form_step are equally hard *as served*.
--
-- `concepts.frequency_rank` is deliberately left NULL. No licence-clean corpus frequency list
-- was used, and inventing ordinals to fill a column named `frequency_rank` would put fabricated
-- precision straight into the cold-start prior. The frequency signal is carried by `form_step`
-- above, where it is visible as a judgement.
--
-- `item_stats` is primed with `beta = cold_start_beta` and `beta_n = 5`
-- (`elo.ts CONTENT_PRIOR_PSEUDO_COUNT`), which is what stops the first holdout observation from
-- washing the content prior out. Numerically identical to reading `cold_start_beta` directly,
-- because they are seeded equal.
--
-- -----------------------------------------------------------------------------
-- RECALL IS TEXT-ONLY IN THIS SEED
-- -----------------------------------------------------------------------------
-- Audio playback is not built. Every RECALL item here is READING comprehension: a short passage
-- or dialogue plus one question. `media_path` is NULL on all of them and each prompt carries
-- `"modality": "text"` so a client cannot mistake one for a clip. They use `kind: "brief"`
-- rather than the `PlaybackTask` shape in src/components/match/types.ts, precisely because
-- there is nothing to play. When audio lands, those items are new rows, not edits to these.
--
-- -----------------------------------------------------------------------------
-- PROMPT SHAPE
-- -----------------------------------------------------------------------------
-- `items.prompt` is copied verbatim into `matches.prompt_snapshot`, and two live consumers read
-- it, so the shape is fixed by them rather than invented here:
--   * judge-runner.ts `loadMatch` reads `snapshot.task` and requires a STRING — the full task as
--     the judge should see it. Every item below has one.
--   * tasks.ts `choicesFromPrompt` reads `prompt.options` (an array of >= 2) to get the option
--     count that drives the guessing floor. Closed items below carry exactly that.
-- The remaining top-level keys are the `PromptTask` / `InputSpec` fields from
-- src/components/match/types.ts (`kind`, `glyph`, `reading`, `instruction`, `brief`,
-- `strokeOrderPath`, `input`) so a future mapper is a projection, not a translation.
-- `strokeOrderPath` is null everywhere: it is never synthesised.
-- =============================================================================


-- =============================================================================
-- 1. CONCEPTS — 50 rows. The atoms of mastery, and the stars of the ja constellation.
--    tier_rank: 1 = N5, 2 = N4. Ascending = harder, so it sorts as a sequence.
-- =============================================================================

insert into public.concepts
  (world_slug, slug, kind, display_name, native_form, description, tier, tier_rank)
values
  -- --- script -------------------------------------------------------------
  ('ja', 'ja-script-hiragana', 'script', 'Hiragana', '平仮名',
   'The syllabary every reading answer is written in. Mastery here is a precondition for every other script concept.', 'N5', 1),
  ('ja', 'ja-script-katakana', 'script', 'Katakana', '片仮名',
   'Loanwords, onomatopoeia, emphasis. Read fluently, not decoded letter by letter.', 'N5', 1),
  ('ja', 'ja-script-youon', 'script', 'Contracted sounds', 'きゃ・しゅ・ちょ',
   'Small ゃゅょ. One mora, not two: しゅう is two mora, not three.', 'N5', 1),
  ('ja', 'ja-script-sokuon', 'script', 'Geminate consonant', 'っ',
   'The small tsu. Its own mora, and the difference between 来た and 買った.', 'N5', 1),
  ('ja', 'ja-script-onyomi-kunyomi', 'script', 'On''yomi and kun''yomi', '音読み・訓読み',
   'Which reading a kanji takes depends on the word it is in. Compounds usually take on''yomi; a kanji with okurigana usually takes kun''yomi.', 'N5', 1),
  ('ja', 'ja-script-kanji-numbers', 'script', 'Number kanji', '一二三四五六七八九十百千万',
   'Including the irregular counted readings: 一人 ひとり, 二十日 はつか.', 'N5', 1),
  ('ja', 'ja-script-kanji-time', 'script', 'Time and calendar kanji', '日月年時分半今週曜',
   'Dates, clock times, days of the week.', 'N5', 1),
  ('ja', 'ja-script-kanji-people', 'script', 'People and family kanji', '人男女子父母友',
   NULL, 'N5', 1),
  ('ja', 'ja-script-kanji-nature', 'script', 'Nature and element kanji', '山川天気雨火水木金土花',
   NULL, 'N5', 1),
  ('ja', 'ja-script-kanji-position', 'script', 'Position kanji', '上下中外前後右左',
   'The words directions and room descriptions are built from.', 'N5', 1),
  ('ja', 'ja-script-kanji-basic-verbs', 'script', 'Kanji in basic verbs', '行来見聞食飲言読書話',
   NULL, 'N5', 1),
  ('ja', 'ja-script-kanji-n4-common', 'script', 'Common N4 kanji', '借貸送待教習練病院旅',
   'The second band: everyday verbs and places that N5 leaves out.', 'N4', 2),

  -- --- phonology ----------------------------------------------------------
  ('ja', 'ja-phonology-rendaku', 'phonology', 'Rendaku', '連濁',
   'Sequential voicing in compounds: 手 + 紙 = てがみ, 花 + 火 = はなび. Not predictable enough to guess; learned word by word.', 'N4', 2),
  ('ja', 'ja-phonology-mora', 'phonology', 'Mora counting', '拍',
   'The unit Japanese rhythm and pitch are measured in. ん, っ and the second half of a long vowel each count as one: 学校 is four mora.', 'N5', 1),

  -- --- grammar ------------------------------------------------------------
  ('ja', 'ja-grammar-particle-wa-ga', 'grammar', 'は and が', 'は・が',
   'Topic versus subject. は sets what the sentence is about; が identifies which one. できる, ある and adjectives of feeling take が.', 'N5', 1),
  ('ja', 'ja-grammar-particle-wo', 'grammar', 'を', 'を',
   'The direct object of a transitive verb. Its absence is the clearest signal a verb is intransitive.', 'N5', 1),
  ('ja', 'ja-grammar-particle-ni-de', 'grammar', 'に and で', 'に・で',
   'に is a point — a time, a destination, a location of existence. で is the space an action happens in, or the means it happens by.', 'N5', 1),
  ('ja', 'ja-grammar-particle-no', 'grammar', 'の', 'の',
   'Possession and modification, and the nominaliser: 大きいの = the big one.', 'N5', 1),
  ('ja', 'ja-grammar-particle-kara-made', 'grammar', 'から and まで', 'から・まで',
   'Start and end points, in time and in space. まで is inclusive.', 'N5', 1),
  ('ja', 'ja-grammar-desu-masu', 'grammar', 'です and ます', 'です・ます',
   'The polite register. The default for anyone you are not close to, and the baseline every duel constraint measures register against.', 'N5', 1),
  ('ja', 'ja-grammar-verb-groups', 'grammar', 'Verb groups', '五段・一段・不規則',
   'Godan, ichidan, and the two irregulars する and 来る. Every conjugation rule branches on this.', 'N5', 1),
  ('ja', 'ja-grammar-plain-present', 'grammar', 'Plain form', '辞書形',
   'The dictionary form. Casual speech, and the base every clause-embedding pattern attaches to.', 'N5', 1),
  ('ja', 'ja-grammar-past-plain', 'grammar', 'Plain past', '〜た',
   'Same onbin rules as the て form, with た/だ instead of て/で.', 'N5', 1),
  ('ja', 'ja-grammar-negative-nai', 'grammar', 'Plain negative', '〜ない',
   'Godan stems shift to the あ row: 飲む → 飲まない. ある is irregular: ない.', 'N5', 1),
  ('ja', 'ja-grammar-te-form', 'grammar', 'て form', '〜て',
   'The connective. Sequence, manner, and the base of a dozen later patterns. The onbin rules are the actual content: く→いて, ぐ→いで, う/つ/る→って, む/ぶ/ぬ→んで, す→して.', 'N5', 1),
  ('ja', 'ja-grammar-te-iru', 'grammar', '〜ている', '〜ている',
   'Progressive for action verbs, resultant state for change-of-state verbs: 待っている = is waiting, 来ている = has come and is here.', 'N5', 1),
  ('ja', 'ja-grammar-te-kudasai', 'grammar', '〜てください', '〜てください',
   'A polite request. Still an instruction, so not usable upward to a superior without softening.', 'N5', 1),
  ('ja', 'ja-grammar-te-mo-ii', 'grammar', '〜てもいい and 〜てはいけない', '〜てもいい',
   'Asking for and refusing permission.', 'N5', 1),
  ('ja', 'ja-grammar-i-adjective', 'grammar', 'い-adjective conjugation', 'い形容詞',
   'The adjective itself carries tense: 高かった, 高くない. です never takes the past for it.', 'N5', 1),
  ('ja', 'ja-grammar-na-adjective', 'grammar', 'な-adjective', 'な形容詞',
   'Conjugates as a noun + copula: 静かだった, 静かじゃない, 静かな部屋.', 'N5', 1),
  ('ja', 'ja-grammar-counters', 'grammar', 'Counters', '〜つ・〜人・〜枚・〜本・〜冊',
   'Numbers do not attach to nouns bare. The counter is chosen by the shape or kind of the thing.', 'N5', 1),
  ('ja', 'ja-grammar-existence-aru-iru', 'grammar', 'ある and いる', 'ある・いる',
   'いる for animate, ある for inanimate. The location takes に.', 'N5', 1),
  ('ja', 'ja-grammar-tai', 'grammar', '〜たい', '〜たい',
   'Own desire only, and it conjugates as an い-adjective. Never used to assert someone else''s wants.', 'N5', 1),
  ('ja', 'ja-grammar-comparison', 'grammar', 'Comparison', '〜より〜のほうが',
   'より marks the standard, のほうが the preferred side, いちばん the top of a set.', 'N5', 1),
  ('ja', 'ja-grammar-te-shimau', 'grammar', '〜てしまった', '〜てしまった',
   'Completion, and — with an unintended result — regret. This is the form the plain past cannot do: 忘れた reports, 忘れてしまった admits.', 'N4', 2),
  ('ja', 'ja-grammar-potential', 'grammar', 'Potential form', '可能形',
   'Godan え row + る, ichidan られる. The object usually moves from を to が.', 'N4', 2),
  ('ja', 'ja-grammar-volitional', 'grammar', 'Volitional', '意向形',
   'Plain 〜おう/〜よう and polite 〜ましょう. Proposals and resolutions.', 'N4', 2),
  ('ja', 'ja-grammar-conditional-tara', 'grammar', '〜たら', '〜たら',
   'The past form plus ら. The everyday conditional, and the one that also does "when X happens".', 'N4', 2),
  ('ja', 'ja-grammar-nakereba-naranai', 'grammar', '〜なければならない', '〜なければならない',
   'Obligation. Contracts to 〜なきゃ in speech.', 'N4', 2),
  ('ja', 'ja-grammar-passive', 'grammar', 'Passive', '受身',
   'Godan あ row + れる, ichidan られる. Also the adversative passive: 弟にパソコンを壊された says it happened to you.', 'N4', 2),
  ('ja', 'ja-grammar-giving-receiving', 'grammar', 'あげる, くれる, もらう', '授受動詞',
   'Direction of the benefit, encoded in the verb. くれる only points at the speaker''s side; もらう makes the receiver the subject.', 'N4', 2),
  ('ja', 'ja-grammar-relative-clause', 'grammar', 'Noun-modifying clauses', '連体修飾',
   'A whole clause in plain form placed before the noun, with no relative pronoun: 赤いシャツを着ている人.', 'N4', 2),
  ('ja', 'ja-grammar-transitive-intransitive', 'grammar', 'Transitive and intransitive pairs', '自動詞・他動詞',
   '開ける/開く, 閉める/閉まる, つける/つく. Which one you pick decides whether anyone is being blamed.', 'N4', 2),
  ('ja', 'ja-grammar-node-kara', 'grammar', 'から and ので', 'から・ので',
   'Both give a reason. ので is softer and more objective, which is why it is the one that belongs in an apology to a manager.', 'N4', 2),

  -- --- pragmatics ---------------------------------------------------------
  ('ja', 'ja-pragmatics-register', 'pragmatics', 'Register', '文体',
   'Who you are writing to, decided before the first word. Mixing plain and polite in one message is the most common register error and the easiest to judge.', 'N4', 2),
  ('ja', 'ja-pragmatics-apology', 'pragmatics', 'Apology and softening', 'すみません・申し訳ありません',
   'Graded: ごめん / すみません / 申し訳ありません. And the softeners that precede a request: 恐れ入りますが, お手数ですが.', 'N4', 2),
  ('ja', 'ja-pragmatics-keigo-basics', 'pragmatics', 'Keigo basics', '敬語',
   'Polite prefixes お/ご, and the humble/honorific swaps a beginner actually needs: いただく, くださる, いらっしゃる.', 'N4', 2),
  ('ja', 'ja-pragmatics-set-phrases', 'pragmatics', 'Set phrases', 'よろしくお願いします',
   'Fixed expressions that are not composed word by word: よろしくお願いします, お疲れさまです, 失礼します.', 'N5', 1),

  -- --- lexeme -------------------------------------------------------------
  ('ja', 'ja-lexeme-time-expressions', 'lexeme', 'Time expressions', '今日・明日・毎朝',
   'Many take no particle at all: 毎朝コーヒーを飲みます, not 毎朝に.', 'N5', 1),
  ('ja', 'ja-lexeme-family-terms', 'lexeme', 'Family terms', '母・お母さん',
   'In-group versus out-group: your own mother is 母, someone else''s is お母さん. Getting this backwards is immediately audible.', 'N5', 1)
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
  ('ja-script-katakana',                 'ja-script-hiragana'),
  ('ja-script-youon',                    'ja-script-hiragana'),
  ('ja-script-sokuon',                   'ja-script-hiragana'),
  ('ja-phonology-mora',                  'ja-script-hiragana'),
  ('ja-script-onyomi-kunyomi',           'ja-script-hiragana'),
  ('ja-phonology-rendaku',               'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-numbers',            'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-time',               'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-people',             'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-nature',             'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-position',           'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-basic-verbs',        'ja-script-onyomi-kunyomi'),
  ('ja-script-kanji-n4-common',          'ja-script-kanji-basic-verbs'),

  ('ja-grammar-plain-present',           'ja-grammar-verb-groups'),
  ('ja-grammar-te-form',                 'ja-grammar-verb-groups'),
  ('ja-grammar-negative-nai',            'ja-grammar-verb-groups'),
  ('ja-grammar-potential',               'ja-grammar-verb-groups'),
  ('ja-grammar-volitional',              'ja-grammar-verb-groups'),
  ('ja-grammar-passive',                 'ja-grammar-verb-groups'),
  ('ja-grammar-past-plain',              'ja-grammar-te-form'),
  ('ja-grammar-te-iru',                  'ja-grammar-te-form'),
  ('ja-grammar-te-kudasai',              'ja-grammar-te-form'),
  ('ja-grammar-te-mo-ii',                'ja-grammar-te-form'),
  ('ja-grammar-te-shimau',               'ja-grammar-te-form'),
  ('ja-grammar-giving-receiving',        'ja-grammar-te-form'),
  ('ja-grammar-conditional-tara',        'ja-grammar-past-plain'),
  ('ja-grammar-nakereba-naranai',        'ja-grammar-negative-nai'),
  ('ja-grammar-relative-clause',         'ja-grammar-plain-present'),
  ('ja-grammar-node-kara',               'ja-grammar-plain-present'),
  ('ja-grammar-tai',                     'ja-grammar-i-adjective'),
  ('ja-grammar-transitive-intransitive', 'ja-grammar-particle-wo'),
  ('ja-grammar-existence-aru-iru',       'ja-grammar-particle-ni-de'),
  ('ja-grammar-comparison',              'ja-grammar-particle-wa-ga'),

  ('ja-pragmatics-apology',              'ja-pragmatics-register'),
  ('ja-pragmatics-keigo-basics',         'ja-pragmatics-register'),
  ('ja-pragmatics-set-phrases',          'ja-pragmatics-register'),
  ('ja-lexeme-family-terms',             'ja-pragmatics-register')
) as edge(child_slug, parent_slug)
join public.concepts parent
  on parent.world_slug = 'ja' and parent.slug = edge.parent_slug
where child.world_slug = 'ja' and child.slug = edge.child_slug;


-- =============================================================================
-- 2. ITEMS — 60 rows: 25 FORGE, 25 DUEL, 10 RECALL.
--    jsonb is dollar-quoted ($j$…$j$) so no Japanese or apostrophe needs escaping.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2a. FORGE — script and morphology under time pressure. Exact answers.
--     10 kanji readings · 10 conjugation drills · 5 particle selections.
-- -----------------------------------------------------------------------------

insert into public.items
  (external_id, world_slug, ladder_slug, kind, prompt, answer,
   rubric_version, constraint_text, time_limit_ms, cold_start_beta, source, license)
values

-- ---- kanji readings (free response, hiragana) -------------------------------
('ja-forge-kanji-taberu', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"食べる","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 食べる in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"たべる","accept":["たべる"],
     "note":"Kun-yomi with okurigana. 食 takes しょく only in compounds (食事, 食堂)."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 20000, -1.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-tenki', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"天気","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 天気 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"てんき","accept":["てんき"],
     "note":"Two-kanji compound, both on-yomi. No rendaku."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 20000, -1.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-gakkou', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"学校","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 学校 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"がっこう","accept":["がっこう"],
     "note":"Sokuon plus a long vowel: four mora, four kana. がこう and がっこ are both one mora short."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 20000, -1.0, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-kyou', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"今日","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 今日 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"きょう","accept":["きょう"],
     "note":"Jukujikun: the reading belongs to the pair, not to either kanji. こんじつ exists but is formal written Japanese and is not the answer wanted here."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-tegami', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"手紙","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 手紙 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"てがみ","accept":["てがみ"],
     "note":"Rendaku: 紙 かみ voices to がみ in the compound. てかみ is the error this item is for."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-hitori', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"一人","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 一人 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"ひとり","accept":["ひとり"],
     "note":"Irregular counted reading. いちにん is wrong for the ordinary word; 一人 and 二人 (ふたり) are memorised, and 三人 onward is regular にん."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-densha', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"電車","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 電車 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"でんしゃ","accept":["でんしゃ"],
     "note":"Contracted sound しゃ is one mora. でんしや is a kana error, not a reading error."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 20000, -1.0, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-hanabi', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"花火","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 花火 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"はなび","accept":["はなび"],
     "note":"Both kun-yomi, and rendaku: 火 ひ voices to び. はなひ and かじ are the two failure modes."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-renshuu', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"練習","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 練習 in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"れんしゅう","accept":["れんしゅう"],
     "note":"Five kana, four mora. The long vowel in しゅう is the part that gets dropped."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, -0.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-kanji-kariru', 'ja', 'forge', 'kanji_reading',
 $j${"kind":"glyph","glyph":"借りる","reading":null,"strokeOrderPath":null,
     "instruction":"Write the reading of this word in hiragana.",
     "task":"Write the reading of 借りる in hiragana.",
     "input":{"label":"Reading","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"かりる","accept":["かりる"],
     "note":"To borrow. Its pair 貸す かす means to lend; confusing the two is the usual error, not the reading."}$j$::jsonb,
 'forge@1', 'READING IN HIRAGANA', 25000, 0.0, 'loxelingo-seed-ja-v1', 'proprietary'),

-- ---- conjugation drills (free response) --------------------------------------
('ja-forge-conj-kaku-te', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"書く","reading":"かく","strokeOrderPath":null,
     "instruction":"Write this verb in て form.",
     "task":"Write the て form of 書く (かく).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"書いて","accept":["書いて","かいて"],
     "note":"Godan く → いて. 書きて is the un-contracted form and is not modern Japanese."}$j$::jsonb,
 'forge@1', 'IN て FORM', 20000, -1.0, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-oyogu-te', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"泳ぐ","reading":"およぐ","strokeOrderPath":null,
     "instruction":"Write this verb in て form.",
     "task":"Write the て form of 泳ぐ (およぐ).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"泳いで","accept":["泳いで","およいで"],
     "note":"Godan ぐ → いで, voiced. 泳いて is the error: the ぐ carries its voicing into the ending."}$j$::jsonb,
 'forge@1', 'IN て FORM', 20000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-iku-te', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"行く","reading":"いく","strokeOrderPath":null,
     "instruction":"Write this verb in て form.",
     "task":"Write the て form of 行く (いく).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"行って","accept":["行って","いって"],
     "note":"The one godan く verb that does not follow く → いて. 行いて is the regularised error."}$j$::jsonb,
 'forge@1', 'IN て FORM', 25000, -0.4, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-matsu-te', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"待つ","reading":"まつ","strokeOrderPath":null,
     "instruction":"Write this verb in て form.",
     "task":"Write the て form of 待つ (まつ).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"待って","accept":["待って","まって"],
     "note":"Godan つ → って. The sokuon is a whole mora; まて is a different word (the imperative)."}$j$::jsonb,
 'forge@1', 'IN て FORM', 20000, -1.0, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-kau-past', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"買う","reading":"かう","strokeOrderPath":null,
     "instruction":"Write this verb in the plain past.",
     "task":"Write the plain past form of 買う (かう).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"買った","accept":["買った","かった"],
     "note":"Godan う → った. Same onbin rule as the て form, with た."}$j$::jsonb,
 'forge@1', 'PLAIN PAST', 20000, -1.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-kuru-past', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"来る","reading":"くる","strokeOrderPath":null,
     "instruction":"Write this verb in the plain past.",
     "task":"Write the plain past form of 来る (くる).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"来た","accept":["来た","きた"],
     "note":"Irregular: the stem vowel changes, く → き. 来るた and こた are the two errors."}$j$::jsonb,
 'forge@1', 'PLAIN PAST', 20000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-miru-neg', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"見る","reading":"みる","strokeOrderPath":null,
     "instruction":"Write this verb in the plain negative.",
     "task":"Write the plain negative form of 見る (みる).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"見ない","accept":["見ない","みない"],
     "note":"Ichidan: drop る, add ない. 見らない treats it as godan."}$j$::jsonb,
 'forge@1', 'PLAIN NEGATIVE', 20000, -1.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-shizuka-past', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"静か","reading":"しずか","strokeOrderPath":null,
     "instruction":"Write this な-adjective in the plain past.",
     "task":"Write the plain past form of the な-adjective 静か (しずか), as it would end a sentence.",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"静かだった","accept":["静かだった","しずかだった"],
     "note":"な-adjectives conjugate through the copula, not like い-adjectives. 静かかった is the cross-over error."}$j$::jsonb,
 'forge@1', 'PLAIN PAST', 25000, -0.7, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-nomu-potential', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"飲む","reading":"のむ","strokeOrderPath":null,
     "instruction":"Write this verb in the plain potential.",
     "task":"Write the plain potential form of 飲む (のむ).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"飲める","accept":["飲める","のめる"],
     "note":"Godan: the stem moves to the え row and takes る. 飲まれる is the passive, not the potential."}$j$::jsonb,
 'forge@1', 'PLAIN POTENTIAL', 25000, -0.3, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-conj-hanasu-volitional', 'ja', 'forge', 'conjugation',
 $j${"kind":"glyph","glyph":"話す","reading":"はなす","strokeOrderPath":null,
     "instruction":"Write this verb in the plain volitional.",
     "task":"Write the plain volitional form of 話す (はなす).",
     "input":{"label":"Your form","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"exact","primary":"話そう","accept":["話そう","はなそう"],
     "note":"Godan: stem to the お row plus う. 話しよう applies the ichidan rule."}$j$::jsonb,
 'forge@1', 'PLAIN VOLITIONAL', 25000, 0.0, 'loxelingo-seed-ja-v1', 'proprietary'),

-- ---- particle selection (4 options: guessing floor 0.25) ---------------------
('ja-forge-particle-wa-student', 'ja', 'forge', 'particle_choice',
 $j${"kind":"brief","brief":"わたし＿＿がくせいです。",
     "instruction":"Choose the particle that fills the blank.",
     "task":"Choose the particle that fills the blank: わたし＿＿がくせいです。",
     "options":["は","が","を","に"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"は",
     "note":"Self-introduction: the speaker is the topic, not new information. が would answer the question which one of us is the student."}$j$::jsonb,
 'forge@1', 'CHOOSE THE PARTICLE', 15000, -0.85, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-particle-wo-coffee', 'ja', 'forge', 'particle_choice',
 $j${"kind":"brief","brief":"毎朝、コーヒー＿＿飲みます。",
     "instruction":"Choose the particle that fills the blank.",
     "task":"Choose the particle that fills the blank: 毎朝、コーヒー＿＿飲みます。",
     "options":["を","が","に","で"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"を",
     "note":"飲む is transitive, so its object takes を. Note also that 毎朝 takes no particle at all."}$j$::jsonb,
 'forge@1', 'CHOOSE THE PARTICLE', 15000, -0.85, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-particle-ni-seven', 'ja', 'forge', 'particle_choice',
 $j${"kind":"brief","brief":"毎日、七時＿＿おきます。",
     "instruction":"Choose the particle that fills the blank.",
     "task":"Choose the particle that fills the blank: 毎日、七時＿＿おきます。",
     "options":["に","で","を","へ"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"に",
     "note":"A clock time is a point, so に. で would make seven o''clock the means or the space the getting-up happened in."}$j$::jsonb,
 'forge@1', 'CHOOSE THE PARTICLE', 15000, -0.55, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-particle-de-library', 'ja', 'forge', 'particle_choice',
 $j${"kind":"brief","brief":"図書館＿＿本を読みます。",
     "instruction":"Choose the particle that fills the blank.",
     "task":"Choose the particle that fills the blank: 図書館＿＿本を読みます。",
     "options":["で","に","を","へ"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"で",
     "note":"The library is the space the reading happens in, so で. に would be right for 図書館にあります, where nothing is happening."}$j$::jsonb,
 'forge@1', 'CHOOSE THE PARTICLE', 15000, -0.55, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-forge-particle-ga-dekiru', 'ja', 'forge', 'particle_choice',
 $j${"kind":"brief","brief":"アンナさんは日本語＿＿できます。",
     "instruction":"Choose the particle that fills the blank.",
     "task":"Choose the particle that fills the blank: アンナさんは日本語＿＿できます。",
     "options":["が","を","に","へ"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"が",
     "note":"できる takes が, not を — the ability class of predicates marks its complement as a subject. 日本語をできます is the single most common error at this level."}$j$::jsonb,
 'forge@1', 'CHOOSE THE PARTICLE', 20000, 0.05, 'loxelingo-seed-ja-v1', 'proprietary'),

-- -----------------------------------------------------------------------------
-- 2b. DUEL — a situation, a communicative goal, and a constraint. `answer` is NULL:
--     these are judged comparatively against duel@1, which weights task_completion
--     highest, so every constraint below is something a judge can check.
-- -----------------------------------------------------------------------------

('ja-duel-package-note', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A neighbour's package was left at your door for a week before you noticed. Write the note you leave with it.",
     "instruction":"Write it the way you would actually write it.",
     "task":"A neighbour's package was left at your door for a week before you noticed. Write the note you leave with it. Write it the way you would actually write it.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 40 CHARACTERS · POLITE · 〜てしまった', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-late-to-station', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You are twenty minutes late and your friend is already waiting at the station. Send the message you would actually send from the train.",
     "instruction":"One message. Say where you are and when you will arrive.",
     "task":"You are twenty minutes late and your friend is already waiting at the station. Send the message you would actually send from the train. One message. Say where you are and when you will arrive.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":30}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · UNDER 30 CHARACTERS', 120000, -0.8,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-cleaner-key-note', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"The cleaning crew arrives at nine tomorrow morning. You leave at eight. Write the note for the door: where the key is, and what to do with it when they finish.",
     "instruction":"Two instructions, in the order they need to happen.",
     "task":"The cleaning crew arrives at nine tomorrow morning. You leave at eight. Write the note for the door: where the key is, and what to do with it when they finish. Two instructions, in the order they need to happen.",
     "input":{"label":"Your note","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 50 CHARACTERS · USE 〜てください', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-decline-food', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your host mother has just served you a dish with something in it you are allergic to. Decline it at the table.",
     "instruction":"She must not be left thinking she has done something wrong.",
     "task":"Your host mother has just served you a dish with something in it you are allergic to. Decline it at the table. She must not be left thinking she has done something wrong.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 40 CHARACTERS · POLITE', 120000, 0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-leave-class-early', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You have a hospital appointment during your last class. Ask your teacher, in the classroom, for permission to leave early.",
     "instruction":"Ask. Do not announce.",
     "task":"You have a hospital appointment during your last class. Ask your teacher, in the classroom, for permission to leave early. Ask, do not announce.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE · USE 〜てもいいですか', 120000, -0.8,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-borrow-notes', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You missed yesterday's class. Text a classmate you know well and ask to borrow their notes.",
     "instruction":"A request they can say no to, not an instruction.",
     "task":"You missed yesterday's class. Text a classmate you know well and ask to borrow their notes. It must read as a request they can say no to, not as an instruction.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · A REQUEST, NOT AN ORDER', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-thank-coworker', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A coworker stayed late last night to help you finish a report. Thank them at the office the next morning.",
     "instruction":"Name what they did. A bare thank-you does not complete this task.",
     "task":"A coworker stayed late last night to help you finish a report. Thank them at the office the next morning. Name what they did — a bare thank-you does not complete this task.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE · USE 〜てくれて OR 〜ていただいて', 120000, 0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-wrong-dish', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"The dish just put in front of you is not what you ordered. Tell the server.",
     "instruction":"Say what you ordered as well as what arrived.",
     "task":"The dish just put in front of you is not what you ordered. Tell the server. Say what you ordered as well as what arrived.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":35}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 35 CHARACTERS · POLITE', 120000, -0.8,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-describe-room', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Describe your room to someone who has never been in it, so that they could walk in and find two particular things.",
     "instruction":"Two things, each somewhere specific.",
     "task":"Describe your room to someone who has never been in it, so that they could walk in and find two particular things. Two things, each somewhere specific.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":60}}$j$::jsonb,
 NULL, 'duel@1', 'USE ある OR いる AND A POSITION WORD (上・下・前・後ろ)', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-missed-party', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your friend asks why you did not come to the party. You forgot. Say so.",
     "instruction":"Do not invent an excuse. The task is admitting it.",
     "task":"Your friend asks why you did not come to the party. You forgot. Say so — do not invent an excuse; the task is admitting it.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · USE 〜てしまった OR ので', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-recommend-restaurant', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"There are two restaurants by the station. Tell a friend which one to go to, and why.",
     "instruction":"Compare them. One reason is enough, but it has to be a comparison.",
     "task":"There are two restaurants by the station. Tell a friend which one to go to, and why. Compare them — one reason is enough, but it has to be a comparison.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'USE より AND のほうが', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-barking-dog', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"The dog next door barks all night and you cannot sleep. Write the first note you leave.",
     "instruction":"You want it to stop, and you still have to live next door to these people.",
     "task":"The dog next door barks all night and you cannot sleep. Write the first note you leave. You want it to stop, and you still have to live next door to these people.",
     "input":{"label":"Your note","multiline":true,"countUnit":"character","countLimit":60}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 60 CHARACTERS · POLITE', 120000, 0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-earthquake-doing', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"There was a small earthquake yesterday evening. Tell a friend what you were doing at the moment it started.",
     "instruction":"What was in progress, not what you did afterwards.",
     "task":"There was a small earthquake yesterday evening. Tell a friend what you were doing at the moment it started. What was in progress, not what you did afterwards.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":45}}$j$::jsonb,
 NULL, 'duel@1', 'USE 〜ていました', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-sick-day-message', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You have a fever and cannot go to your part-time job today. Send the message to your manager.",
     "instruction":"State the situation, the consequence, and the apology. In that order.",
     "task":"You have a fever and cannot go to your part-time job today. Send the message to your manager. State the situation, the consequence, and the apology, in that order.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":60}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE · GIVE THE REASON WITH ので', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-advice-study-japan', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A friend is deciding whether to spend a year studying in Japan. Give one concrete piece of advice.",
     "instruction":"Concrete. Something they could do on their first week.",
     "task":"A friend is deciding whether to spend a year studying in Japan. Give one concrete piece of advice — something they could actually do in their first week.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'USE 〜たら', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-exchange-profile', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Write the profile line for a Japanese language-exchange app: who you are, and what you want to practise.",
     "instruction":"It is read by strangers, so it is polite. It is a profile, so it is short.",
     "task":"Write the profile line for a Japanese language-exchange app: who you are, and what you want to practise. It is read by strangers, so it is polite; it is a profile, so it is short.",
     "input":{"label":"Your profile","multiline":true,"countUnit":"character","countLimit":60}}$j$::jsonb,
 NULL, 'duel@1', 'UNDER 60 CHARACTERS · POLITE · USE 〜たい', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-stolen-bicycle', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your bicycle was taken from outside your building. Report it at the police box.",
     "instruction":"What happened, and where. The bicycle is the topic, not the thief.",
     "task":"Your bicycle was taken from outside your building. Report it at the police box: what happened, and where. The bicycle is the topic, not the thief.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE · USE THE PASSIVE (〜られました)', 120000, 0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-decline-karaoke', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Friends are going to karaoke tonight. You have an exam tomorrow morning. Turn them down.",
     "instruction":"Give the obligation as the reason.",
     "task":"Friends are going to karaoke tonight. You have an exam tomorrow morning. Turn them down, giving the obligation as the reason.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · USE 〜なければならない OR 〜なきゃ', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-propose-friday', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You want to go to the new ramen place with a friend on Friday. Propose it.",
     "instruction":"A proposal, so it leaves room for them to decline.",
     "task":"You want to go to the new ramen place with a friend on Friday. Propose it — a proposal, so it leaves room for them to decline.",
     "input":{"label":"Your message","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'USE THE VOLITIONAL (〜ましょう OR 〜よう)', 120000, -0.1,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-directions-konbini', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"A tourist at the station asks how to reach the convenience store: out through the ticket gate, right, past the bank, on the corner. Tell them.",
     "instruction":"One connected set of directions, not four separate sentences.",
     "task":"A tourist at the station asks how to reach the convenience store: out through the ticket gate, right, past the bank, on the corner. Tell them, as one connected set of directions rather than four separate sentences.",
     "input":{"label":"Your directions","multiline":true,"countUnit":"character","countLimit":70}}$j$::jsonb,
 NULL, 'duel@1', 'ONE SEQUENCE: 〜て、〜てください', 120000, -0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-describe-friend', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your friend is meeting you in a crowded cafe. Describe them so that a stranger could pick them out.",
     "instruction":"What they look like right now, not what they are like as a person.",
     "task":"Your friend is meeting you in a crowded cafe. Describe them so that a stranger could pick them out — what they look like right now, not what they are like as a person.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":50}}$j$::jsonb,
 NULL, 'duel@1', 'USE A NOUN-MODIFYING CLAUSE (e.g. 〜ている人)', 120000, 0.2,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-broken-laptop', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your younger brother broke your laptop. Tell a friend what happened.",
     "instruction":"Make it clear this was done to you.",
     "task":"Your younger brother broke your laptop. Tell a friend what happened, and make it clear this was done to you.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":45}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · IT HAPPENED TO YOU (〜られた)', 120000, 0.8,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-duplicate-gift', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Someone has just given you a gift you already own. React, in the moment, with them watching.",
     "instruction":"You are not obliged to lie, but you are obliged to be gracious.",
     "task":"Someone has just given you a gift you already own. React, in the moment, with them watching. You are not obliged to lie, but you are obliged to be gracious.",
     "input":{"label":"What you say","multiline":true,"countUnit":"character","countLimit":45}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE · USE もらう OR いただく', 120000, 0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-milk-note', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"You finished the last of the milk. Write the note for the fridge door for your flatmate.",
     "instruction":"Say what happened and what you will do about it.",
     "task":"You finished the last of the milk. Write the note for the fridge door for your flatmate: what happened, and what you will do about it.",
     "input":{"label":"Your note","multiline":true,"countUnit":"character","countLimit":40}}$j$::jsonb,
 NULL, 'duel@1', 'PLAIN FORM · UNDER 40 CHARACTERS · APOLOGISE AND SAY WHAT YOU WILL DO', 120000, -0.5,
 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-duel-weekend-report', 'ja', 'duel', 'brief',
 $j${"kind":"brief",
     "brief":"Your teacher asks what you did at the weekend. Answer.",
     "instruction":"Exactly two sentences. The second one has to add something the first did not.",
     "task":"Your teacher asks what you did at the weekend. Answer in exactly two sentences, where the second adds something the first did not.",
     "input":{"label":"Your answer","multiline":true,"countUnit":"character","countLimit":60}}$j$::jsonb,
 NULL, 'duel@1', 'POLITE PAST · EXACTLY TWO SENTENCES', 120000, -0.8,
 'loxelingo-seed-ja-v1', 'proprietary'),

-- -----------------------------------------------------------------------------
-- 2c. RECALL — TEXT comprehension only. No audio exists, so `media_path` is NULL and
--     every prompt is marked "modality":"text". Four options each, so the guessing
--     floor is 0.25 and cold_start_beta carries the +0.45 closed_step.
-- -----------------------------------------------------------------------------

('ja-recall-shop-shirt', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"店員：いらっしゃいませ。\n客：このシャツ、もう少し大きいのはありますか。\n店員：すみません、その色はMサイズだけなんです。青ならLもありますよ。\n客：じゃあ、青のLをください。",
     "question":"客は何を買いましたか。",
     "brief":"店員：いらっしゃいませ。\n客：このシャツ、もう少し大きいのはありますか。\n店員：すみません、その色はMサイズだけなんです。青ならLもありますよ。\n客：じゃあ、青のLをください。\n\n客は何を買いましたか。",
     "instruction":"Read the dialogue and answer the question. Text only — this item has no audio.",
     "task":"Read the dialogue and answer the question.\n\n店員：いらっしゃいませ。\n客：このシャツ、もう少し大きいのはありますか。\n店員：すみません、その色はMサイズだけなんです。青ならLもありますよ。\n客：じゃあ、青のLをください。\n\nQuestion: 客は何を買いましたか。",
     "options":["青のLサイズ","青のMサイズ","はじめの色のLサイズ","はじめの色のMサイズ"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"青のLサイズ",
     "note":"The L only exists in blue, so wanting a larger size forces the colour change. The trap is answering with the size alone."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.45, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-library-notice', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"お知らせ\n七月十日（水）は、そうじのため、図書館は午後三時に閉まります。\n本を返す人は、入り口の横のボックスに入れてください。",
     "question":"七月十日の午後四時に本を返したい人は、どうすればいいですか。",
     "brief":"お知らせ\n七月十日（水）は、そうじのため、図書館は午後三時に閉まります。\n本を返す人は、入り口の横のボックスに入れてください。\n\n七月十日の午後四時に本を返したい人は、どうすればいいですか。",
     "instruction":"Read the notice and answer the question. Text only — this item has no audio.",
     "task":"Read the notice and answer the question.\n\nお知らせ\n七月十日（水）は、そうじのため、図書館は午後三時に閉まります。\n本を返す人は、入り口の横のボックスに入れてください。\n\nQuestion: 七月十日の午後四時に本を返したい人は、どうすればいいですか。",
     "options":["入り口の横のボックスに入れる","午後三時までに図書館の中で返す","次の日まで待つ","そうじの人にわたす"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"入り口の横のボックスに入れる",
     "note":"One inference step: four o''clock is after closing, so the box is the only route. 閉まります is intransitive — nobody is being told to close it."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.15, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-meeting-moved', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"田中さんへ\n明日の会議ですが、部長が出張になってしまったので、来週の火曜日に変わりました。\n場所は同じ会議室です。よろしくお願いします。\n山田",
     "question":"会議はどうなりましたか。",
     "brief":"田中さんへ\n明日の会議ですが、部長が出張になってしまったので、来週の火曜日に変わりました。\n場所は同じ会議室です。よろしくお願いします。\n山田\n\n会議はどうなりましたか。",
     "instruction":"Read the message and answer the question. Text only — this item has no audio.",
     "task":"Read the message and answer the question.\n\n田中さんへ\n明日の会議ですが、部長が出張になってしまったので、来週の火曜日に変わりました。\n場所は同じ会議室です。よろしくお願いします。\n山田\n\nQuestion: 会議はどうなりましたか。",
     "options":["来週の火曜日になった","中止になった","場所が変わった","明日のままで、部長だけ来ない"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"来週の火曜日になった",
     "note":"場所は同じ is there precisely to be mis-selected. ので gives the reason; 〜てしまった marks the trip as the thing that went wrong."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.55, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-rainy-day', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"きのうは朝から雨でした。だから、公園へ行くのをやめて、家で映画を見ました。\n今日は晴れているので、これから自転車で出かけます。",
     "question":"きのう、この人は何をしましたか。",
     "brief":"きのうは朝から雨でした。だから、公園へ行くのをやめて、家で映画を見ました。\n今日は晴れているので、これから自転車で出かけます。\n\nきのう、この人は何をしましたか。",
     "instruction":"Read the passage and answer the question. Text only — this item has no audio.",
     "task":"Read the passage and answer the question.\n\nきのうは朝から雨でした。だから、公園へ行くのをやめて、家で映画を見ました。\n今日は晴れているので、これから自転車で出かけます。\n\nQuestion: きのう、この人は何をしましたか。",
     "options":["家で映画を見た","公園へ行った","自転車で出かけた","何もしなかった"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"家で映画を見た",
     "note":"Two days in one passage. 自転車で出かけます is today and still in the future; the tense is the whole question."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.75, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-lunch-set', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"このお店では、午後六時までなら、ランチセットが五百円で食べられます。\n六時からは、ふつうのメニューだけになります。飲み物は別料金です。",
     "question":"午後五時半に来た人について、正しいものはどれですか。",
     "brief":"このお店では、午後六時までなら、ランチセットが五百円で食べられます。\n六時からは、ふつうのメニューだけになります。飲み物は別料金です。\n\n午後五時半に来た人について、正しいものはどれですか。",
     "instruction":"Read the notice and answer the question. Text only — this item has no audio.",
     "task":"Read the notice and answer the question.\n\nこのお店では、午後六時までなら、ランチセットが五百円で食べられます。\n六時からは、ふつうのメニューだけになります。飲み物は別料金です。\n\nQuestion: 午後五時半に来た人について、正しいものはどれですか。",
     "options":["五百円でランチセットが食べられる","ふつうのメニューだけになる","五百円で飲み物もついてくる","ランチセットは食べられない"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"五百円でランチセットが食べられる",
     "note":"Two traps: 六時まで is inclusive of 5:30, and 飲み物は別料金 rules out the drink. The potential 食べられます is the target form."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, -0.15, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-lost-umbrella', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"A：あれ、かさは？\nB：電車に忘れてきちゃった。\nA：え、また？　じゃあ、これ使って。ぼくは走るから。",
     "question":"Bさんは、どうしてかさを持っていないのですか。",
     "brief":"A：あれ、かさは？\nB：電車に忘れてきちゃった。\nA：え、また？　じゃあ、これ使って。ぼくは走るから。\n\nBさんは、どうしてかさを持っていないのですか。",
     "instruction":"Read the dialogue and answer the question. Text only — this item has no audio.",
     "task":"Read the dialogue and answer the question.\n\nA：あれ、かさは？\nB：電車に忘れてきちゃった。\nA：え、また？　じゃあ、これ使って。ぼくは走るから。\n\nQuestion: Bさんは、どうしてかさを持っていないのですか。",
     "options":["電車に忘れたから","Aさんにあげたから","家に置いてきたから","こわれてしまったから"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"電車に忘れたから",
     "note":"Casual contraction: 忘れてきちゃった = 忘れてきてしまった. A then hands B an umbrella, which is the reverse of the second option."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.25, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-room-booking', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"教室の予約について\n一回に使えるのは二時間までです。三人以上でお申し込みください。\n使ったあとは、机といすを元の場所にもどしてください。",
     "question":"二人で三時間、予約できますか。",
     "brief":"教室の予約について\n一回に使えるのは二時間までです。三人以上でお申し込みください。\n使ったあとは、机といすを元の場所にもどしてください。\n\n二人で三時間、予約できますか。",
     "instruction":"Read the notice and answer the question. Text only — this item has no audio.",
     "task":"Read the notice and answer the question.\n\n教室の予約について\n一回に使えるのは二時間までです。三人以上でお申し込みください。\n使ったあとは、机といすを元の場所にもどしてください。\n\nQuestion: 二人で三時間、予約できますか。",
     "options":["できない。人数も時間もきまりに合わないから","できる。二人でも三時間なら大丈夫だから","できない。人数だけがきまりに合わないから","できない。時間だけがきまりに合わないから"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"できない。人数も時間もきまりに合わないから",
     "note":"Both rules are broken, so the two half-right options are the discriminators. 三人以上 includes three; 二時間まで excludes three hours."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 90000, 0.55, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-reading-menu', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"去年、日本に来たときは、メニューが全然読めませんでした。\n毎日少しずつ漢字を覚えたら、今は半分ぐらい読めるようになりました。",
     "question":"今、この人はメニューをどのくらい読めますか。",
     "brief":"去年、日本に来たときは、メニューが全然読めませんでした。\n毎日少しずつ漢字を覚えたら、今は半分ぐらい読めるようになりました。\n\n今、この人はメニューをどのくらい読めますか。",
     "instruction":"Read the passage and answer the question. Text only — this item has no audio.",
     "task":"Read the passage and answer the question.\n\n去年、日本に来たときは、メニューが全然読めませんでした。\n毎日少しずつ漢字を覚えたら、今は半分ぐらい読めるようになりました。\n\nQuestion: 今、この人はメニューをどのくらい読めますか。",
     "options":["半分ぐらい","全然読めない","全部読める","去年と同じくらい"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"半分ぐらい",
     "note":"全然読めませんでした is last year. The question asks about 今, and 〜ようになりました marks the change."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.55, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-sweater-gift', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"誕生日に、母がセーターを送ってくれました。\n少し大きかったので、妹にあげました。妹はとても喜んでいました。",
     "question":"今、セーターは誰が持っていますか。",
     "brief":"誕生日に、母がセーターを送ってくれました。\n少し大きかったので、妹にあげました。妹はとても喜んでいました。\n\n今、セーターは誰が持っていますか。",
     "instruction":"Read the passage and answer the question. Text only — this item has no audio.",
     "task":"Read the passage and answer the question.\n\n誕生日に、母がセーターを送ってくれました。\n少し大きかったので、妹にあげました。妹はとても喜んでいました。\n\nQuestion: 今、セーターは誰が持っていますか。",
     "options":["妹","この人","母","お店"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"妹",
     "note":"Two transfers in two sentences, each marked by the verb: くれる points inward to the speaker, あげる points outward to the sister."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.25, 'loxelingo-seed-ja-v1', 'proprietary'),

('ja-recall-bus-ticket', 'ja', 'recall', 'reading_comprehension',
 $j${"kind":"brief","modality":"text",
     "passage":"このバスは、六番のりばから出ます。\n切符は、乗る前に自動販売機で買わなければなりません。\nバスの中では買えませんので、気をつけてください。",
     "question":"切符はどこで買いますか。",
     "brief":"このバスは、六番のりばから出ます。\n切符は、乗る前に自動販売機で買わなければなりません。\nバスの中では買えませんので、気をつけてください。\n\n切符はどこで買いますか。",
     "instruction":"Read the notice and answer the question. Text only — this item has no audio.",
     "task":"Read the notice and answer the question.\n\nこのバスは、六番のりばから出ます。\n切符は、乗る前に自動販売機で買わなければなりません。\nバスの中では買えませんので、気をつけてください。\n\nQuestion: 切符はどこで買いますか。",
     "options":["乗る前に、自動販売機で","バスの中で、運転手から","六番のりばの係の人から","バスをおりたあとで"],
     "input":{"label":"Your answer","multiline":false,"countUnit":null,"countLimit":null}}$j$::jsonb,
 $j${"mode":"choice","correct":"乗る前に、自動販売機で",
     "note":"The negative potential 買えません plus ので closes off the in-bus option explicitly. で marks the means, に would not."}$j$::jsonb,
 'recall@1', 'READ AND ANSWER', 75000, 0.55, 'loxelingo-seed-ja-v1', 'proprietary')

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
--    Every item maps to at least one concept; weight 1.0 = what the item is *for*,
--    lower weights = what it also exercises. The weights are what
--    user_concept_mastery attributes a result across, so a secondary concept must
--    not collect full credit for a result that was really about something else.
-- =============================================================================

insert into public.item_concepts (item_id, concept_id, weight)
select i.id, c.id, m.weight::real
from (values
  -- FORGE · kanji readings
  ('ja-forge-kanji-taberu',   'ja-script-kanji-basic-verbs', 1.0),
  ('ja-forge-kanji-taberu',   'ja-script-onyomi-kunyomi',    0.7),
  ('ja-forge-kanji-taberu',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-tenki',    'ja-script-kanji-nature',      1.0),
  ('ja-forge-kanji-tenki',    'ja-script-onyomi-kunyomi',    0.7),
  ('ja-forge-kanji-tenki',    'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-gakkou',   'ja-script-sokuon',            1.0),
  ('ja-forge-kanji-gakkou',   'ja-phonology-mora',           0.8),
  ('ja-forge-kanji-gakkou',   'ja-script-onyomi-kunyomi',    0.6),
  ('ja-forge-kanji-gakkou',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-kyou',     'ja-script-kanji-time',        1.0),
  ('ja-forge-kanji-kyou',     'ja-lexeme-time-expressions',  0.7),
  ('ja-forge-kanji-kyou',     'ja-script-youon',             0.6),
  ('ja-forge-kanji-kyou',     'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-tegami',   'ja-phonology-rendaku',        1.0),
  ('ja-forge-kanji-tegami',   'ja-script-onyomi-kunyomi',    0.6),
  ('ja-forge-kanji-tegami',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-hitori',   'ja-script-kanji-numbers',     1.0),
  ('ja-forge-kanji-hitori',   'ja-script-kanji-people',      0.8),
  ('ja-forge-kanji-hitori',   'ja-grammar-counters',         0.6),
  ('ja-forge-kanji-hitori',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-densha',   'ja-script-youon',             1.0),
  ('ja-forge-kanji-densha',   'ja-script-onyomi-kunyomi',    0.7),
  ('ja-forge-kanji-densha',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-hanabi',   'ja-phonology-rendaku',        1.0),
  ('ja-forge-kanji-hanabi',   'ja-script-kanji-nature',      0.8),
  ('ja-forge-kanji-hanabi',   'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-renshuu',  'ja-script-kanji-n4-common',   1.0),
  ('ja-forge-kanji-renshuu',  'ja-script-youon',             0.6),
  ('ja-forge-kanji-renshuu',  'ja-phonology-mora',           0.6),
  ('ja-forge-kanji-renshuu',  'ja-script-hiragana',          0.4),
  ('ja-forge-kanji-kariru',   'ja-script-kanji-n4-common',   1.0),
  ('ja-forge-kanji-kariru',   'ja-script-onyomi-kunyomi',    0.6),
  ('ja-forge-kanji-kariru',   'ja-script-hiragana',          0.4),

  -- FORGE · conjugation
  ('ja-forge-conj-kaku-te',           'ja-grammar-te-form',        1.0),
  ('ja-forge-conj-kaku-te',           'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-kaku-te',           'ja-script-kanji-basic-verbs', 0.4),
  ('ja-forge-conj-oyogu-te',          'ja-grammar-te-form',        1.0),
  ('ja-forge-conj-oyogu-te',          'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-iku-te',            'ja-grammar-te-form',        1.0),
  ('ja-forge-conj-iku-te',            'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-iku-te',            'ja-script-sokuon',          0.5),
  ('ja-forge-conj-iku-te',            'ja-script-kanji-basic-verbs', 0.4),
  ('ja-forge-conj-matsu-te',          'ja-grammar-te-form',        1.0),
  ('ja-forge-conj-matsu-te',          'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-matsu-te',          'ja-script-sokuon',          0.5),
  ('ja-forge-conj-kau-past',          'ja-grammar-past-plain',     1.0),
  ('ja-forge-conj-kau-past',          'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-kau-past',          'ja-script-sokuon',          0.5),
  ('ja-forge-conj-kuru-past',         'ja-grammar-past-plain',     1.0),
  ('ja-forge-conj-kuru-past',         'ja-grammar-verb-groups',    0.9),
  ('ja-forge-conj-kuru-past',         'ja-script-kanji-basic-verbs', 0.4),
  ('ja-forge-conj-miru-neg',          'ja-grammar-negative-nai',   1.0),
  ('ja-forge-conj-miru-neg',          'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-miru-neg',          'ja-script-kanji-basic-verbs', 0.4),
  ('ja-forge-conj-shizuka-past',      'ja-grammar-na-adjective',   1.0),
  ('ja-forge-conj-shizuka-past',      'ja-grammar-past-plain',     0.7),
  ('ja-forge-conj-nomu-potential',    'ja-grammar-potential',      1.0),
  ('ja-forge-conj-nomu-potential',    'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-nomu-potential',    'ja-script-kanji-basic-verbs', 0.4),
  ('ja-forge-conj-hanasu-volitional', 'ja-grammar-volitional',     1.0),
  ('ja-forge-conj-hanasu-volitional', 'ja-grammar-verb-groups',    0.8),
  ('ja-forge-conj-hanasu-volitional', 'ja-script-kanji-basic-verbs', 0.4),

  -- FORGE · particles
  ('ja-forge-particle-wa-student',  'ja-grammar-particle-wa-ga', 1.0),
  ('ja-forge-particle-wa-student',  'ja-grammar-desu-masu',      0.5),
  ('ja-forge-particle-wo-coffee',   'ja-grammar-particle-wo',    1.0),
  ('ja-forge-particle-wo-coffee',   'ja-lexeme-time-expressions', 0.6),
  ('ja-forge-particle-wo-coffee',   'ja-script-katakana',        0.4),
  ('ja-forge-particle-ni-seven',    'ja-grammar-particle-ni-de', 1.0),
  ('ja-forge-particle-ni-seven',    'ja-lexeme-time-expressions', 0.6),
  ('ja-forge-particle-ni-seven',    'ja-script-kanji-time',      0.4),
  ('ja-forge-particle-de-library',  'ja-grammar-particle-ni-de', 1.0),
  ('ja-forge-particle-de-library',  'ja-grammar-particle-wo',    0.5),
  ('ja-forge-particle-ga-dekiru',   'ja-grammar-particle-wa-ga', 1.0),
  ('ja-forge-particle-ga-dekiru',   'ja-grammar-potential',      0.7),
  ('ja-forge-particle-ga-dekiru',   'ja-script-katakana',        0.4),

  -- DUEL
  ('ja-duel-package-note',        'ja-grammar-te-shimau',       1.0),
  ('ja-duel-package-note',        'ja-pragmatics-apology',      1.0),
  ('ja-duel-package-note',        'ja-pragmatics-register',     0.6),
  ('ja-duel-package-note',        'ja-grammar-desu-masu',       0.5),
  ('ja-duel-late-to-station',     'ja-pragmatics-register',     1.0),
  ('ja-duel-late-to-station',     'ja-pragmatics-apology',      0.8),
  ('ja-duel-late-to-station',     'ja-grammar-plain-present',   0.6),
  ('ja-duel-late-to-station',     'ja-lexeme-time-expressions', 0.5),
  ('ja-duel-cleaner-key-note',    'ja-grammar-te-kudasai',      1.0),
  ('ja-duel-cleaner-key-note',    'ja-grammar-te-form',         0.7),
  ('ja-duel-cleaner-key-note',    'ja-grammar-particle-ni-de',  0.6),
  ('ja-duel-cleaner-key-note',    'ja-grammar-existence-aru-iru', 0.5),
  ('ja-duel-decline-food',        'ja-pragmatics-register',     1.0),
  ('ja-duel-decline-food',        'ja-pragmatics-apology',      0.8),
  ('ja-duel-decline-food',        'ja-grammar-negative-nai',    0.6),
  ('ja-duel-decline-food',        'ja-lexeme-family-terms',     0.4),
  ('ja-duel-leave-class-early',   'ja-grammar-te-mo-ii',        1.0),
  ('ja-duel-leave-class-early',   'ja-pragmatics-register',     0.7),
  ('ja-duel-leave-class-early',   'ja-grammar-desu-masu',       0.5),
  ('ja-duel-borrow-notes',        'ja-pragmatics-register',     1.0),
  ('ja-duel-borrow-notes',        'ja-grammar-giving-receiving', 0.8),
  ('ja-duel-borrow-notes',        'ja-grammar-te-form',         0.5),
  ('ja-duel-thank-coworker',      'ja-grammar-giving-receiving', 1.0),
  ('ja-duel-thank-coworker',      'ja-pragmatics-keigo-basics', 0.8),
  ('ja-duel-thank-coworker',      'ja-grammar-te-form',         0.6),
  ('ja-duel-wrong-dish',          'ja-pragmatics-register',     1.0),
  ('ja-duel-wrong-dish',          'ja-grammar-desu-masu',       0.7),
  ('ja-duel-wrong-dish',          'ja-grammar-particle-wa-ga',  0.6),
  ('ja-duel-wrong-dish',          'ja-pragmatics-apology',      0.5),
  ('ja-duel-describe-room',       'ja-grammar-existence-aru-iru', 1.0),
  ('ja-duel-describe-room',       'ja-script-kanji-position',   0.8),
  ('ja-duel-describe-room',       'ja-grammar-particle-ni-de',  0.7),
  ('ja-duel-describe-room',       'ja-grammar-i-adjective',     0.4),
  ('ja-duel-missed-party',        'ja-grammar-te-shimau',       1.0),
  ('ja-duel-missed-party',        'ja-grammar-node-kara',       0.8),
  ('ja-duel-missed-party',        'ja-pragmatics-register',     0.5),
  ('ja-duel-recommend-restaurant', 'ja-grammar-comparison',     1.0),
  ('ja-duel-recommend-restaurant', 'ja-grammar-i-adjective',    0.7),
  ('ja-duel-recommend-restaurant', 'ja-grammar-particle-wa-ga', 0.5),
  ('ja-duel-barking-dog',         'ja-pragmatics-register',     1.0),
  ('ja-duel-barking-dog',         'ja-pragmatics-apology',      0.8),
  ('ja-duel-barking-dog',         'ja-pragmatics-keigo-basics', 0.6),
  ('ja-duel-barking-dog',         'ja-grammar-na-adjective',    0.4),
  ('ja-duel-earthquake-doing',    'ja-grammar-te-iru',          1.0),
  ('ja-duel-earthquake-doing',    'ja-grammar-past-plain',      0.6),
  ('ja-duel-earthquake-doing',    'ja-lexeme-time-expressions', 0.5),
  ('ja-duel-sick-day-message',    'ja-grammar-node-kara',       1.0),
  ('ja-duel-sick-day-message',    'ja-pragmatics-register',     0.8),
  ('ja-duel-sick-day-message',    'ja-pragmatics-set-phrases',  0.6),
  ('ja-duel-sick-day-message',    'ja-grammar-desu-masu',       0.5),
  ('ja-duel-advice-study-japan',  'ja-grammar-conditional-tara', 1.0),
  ('ja-duel-advice-study-japan',  'ja-grammar-plain-present',   0.5),
  ('ja-duel-advice-study-japan',  'ja-pragmatics-register',     0.4),
  ('ja-duel-exchange-profile',    'ja-grammar-tai',             1.0),
  ('ja-duel-exchange-profile',    'ja-pragmatics-set-phrases',  0.7),
  ('ja-duel-exchange-profile',    'ja-grammar-desu-masu',       0.6),
  ('ja-duel-stolen-bicycle',      'ja-grammar-passive',         1.0),
  ('ja-duel-stolen-bicycle',      'ja-grammar-particle-ni-de',  0.6),
  ('ja-duel-stolen-bicycle',      'ja-grammar-past-plain',      0.5),
  ('ja-duel-stolen-bicycle',      'ja-grammar-desu-masu',       0.5),
  ('ja-duel-decline-karaoke',     'ja-grammar-nakereba-naranai', 1.0),
  ('ja-duel-decline-karaoke',     'ja-grammar-negative-nai',    0.6),
  ('ja-duel-decline-karaoke',     'ja-pragmatics-register',     0.5),
  ('ja-duel-propose-friday',      'ja-grammar-volitional',      1.0),
  ('ja-duel-propose-friday',      'ja-lexeme-time-expressions', 0.5),
  ('ja-duel-propose-friday',      'ja-grammar-particle-ni-de',  0.4),
  ('ja-duel-directions-konbini',  'ja-grammar-te-form',         1.0),
  ('ja-duel-directions-konbini',  'ja-grammar-te-kudasai',      0.8),
  ('ja-duel-directions-konbini',  'ja-script-kanji-position',   0.6),
  ('ja-duel-directions-konbini',  'ja-grammar-particle-kara-made', 0.5),
  ('ja-duel-describe-friend',     'ja-grammar-relative-clause', 1.0),
  ('ja-duel-describe-friend',     'ja-grammar-te-iru',          0.7),
  ('ja-duel-describe-friend',     'ja-grammar-i-adjective',     0.5),
  ('ja-duel-broken-laptop',       'ja-grammar-passive',         1.0),
  ('ja-duel-broken-laptop',       'ja-lexeme-family-terms',     0.7),
  ('ja-duel-broken-laptop',       'ja-grammar-past-plain',      0.6),
  ('ja-duel-broken-laptop',       'ja-pragmatics-register',     0.5),
  ('ja-duel-duplicate-gift',      'ja-grammar-giving-receiving', 1.0),
  ('ja-duel-duplicate-gift',      'ja-pragmatics-keigo-basics', 0.8),
  ('ja-duel-duplicate-gift',      'ja-pragmatics-register',     0.6),
  ('ja-duel-milk-note',           'ja-pragmatics-apology',      1.0),
  ('ja-duel-milk-note',           'ja-grammar-volitional',      0.6),
  ('ja-duel-milk-note',           'ja-pragmatics-register',     0.6),
  ('ja-duel-milk-note',           'ja-grammar-te-shimau',       0.5),
  ('ja-duel-weekend-report',      'ja-grammar-past-plain',      1.0),
  ('ja-duel-weekend-report',      'ja-grammar-desu-masu',       0.8),
  ('ja-duel-weekend-report',      'ja-lexeme-time-expressions', 0.5),

  -- RECALL
  ('ja-recall-shop-shirt',      'ja-grammar-particle-no',      1.0),
  ('ja-recall-shop-shirt',      'ja-grammar-i-adjective',      0.7),
  ('ja-recall-shop-shirt',      'ja-script-katakana',          0.6),
  ('ja-recall-shop-shirt',      'ja-pragmatics-set-phrases',   0.4),
  ('ja-recall-library-notice',  'ja-grammar-transitive-intransitive', 1.0),
  ('ja-recall-library-notice',  'ja-grammar-te-kudasai',       0.7),
  ('ja-recall-library-notice',  'ja-script-kanji-time',        0.6),
  ('ja-recall-library-notice',  'ja-grammar-particle-no',      0.5),
  ('ja-recall-meeting-moved',   'ja-grammar-te-shimau',        1.0),
  ('ja-recall-meeting-moved',   'ja-grammar-node-kara',        0.8),
  ('ja-recall-meeting-moved',   'ja-pragmatics-set-phrases',   0.6),
  ('ja-recall-meeting-moved',   'ja-lexeme-time-expressions',  0.5),
  ('ja-recall-rainy-day',       'ja-grammar-past-plain',       1.0),
  ('ja-recall-rainy-day',       'ja-grammar-node-kara',        0.7),
  ('ja-recall-rainy-day',       'ja-script-kanji-nature',      0.6),
  ('ja-recall-rainy-day',       'ja-grammar-te-iru',           0.5),
  ('ja-recall-lunch-set',       'ja-grammar-potential',        1.0),
  ('ja-recall-lunch-set',       'ja-grammar-particle-kara-made', 0.8),
  ('ja-recall-lunch-set',       'ja-grammar-counters',         0.5),
  ('ja-recall-lunch-set',       'ja-script-katakana',          0.4),
  ('ja-recall-lost-umbrella',   'ja-grammar-te-shimau',        1.0),
  ('ja-recall-lost-umbrella',   'ja-pragmatics-register',      0.7),
  ('ja-recall-lost-umbrella',   'ja-grammar-te-form',          0.5),
  ('ja-recall-room-booking',    'ja-grammar-counters',         1.0),
  ('ja-recall-room-booking',    'ja-grammar-particle-kara-made', 0.7),
  ('ja-recall-room-booking',    'ja-grammar-te-kudasai',       0.6),
  ('ja-recall-room-booking',    'ja-grammar-potential',        0.5),
  ('ja-recall-reading-menu',    'ja-grammar-potential',        1.0),
  ('ja-recall-reading-menu',    'ja-grammar-conditional-tara', 0.8),
  ('ja-recall-reading-menu',    'ja-script-katakana',          0.4),
  ('ja-recall-sweater-gift',    'ja-grammar-giving-receiving', 1.0),
  ('ja-recall-sweater-gift',    'ja-lexeme-family-terms',      0.8),
  ('ja-recall-sweater-gift',    'ja-grammar-te-iru',           0.5),
  ('ja-recall-bus-ticket',      'ja-grammar-nakereba-naranai', 1.0),
  ('ja-recall-bus-ticket',      'ja-grammar-particle-ni-de',   0.7),
  ('ja-recall-bus-ticket',      'ja-grammar-transitive-intransitive', 0.6),
  ('ja-recall-bus-ticket',      'ja-grammar-counters',         0.5)
) as m(item_key, concept_slug, weight)
join public.items    i on i.external_id = m.item_key
join public.concepts c on c.world_slug = 'ja' and c.slug = m.concept_slug
on conflict (item_id, concept_id) do update set weight = excluded.weight;


-- =============================================================================
-- 4. PRIME item_stats FROM THE CONTENT PRIOR
--    beta := cold_start_beta, beta_n := 5 (elo.ts CONTENT_PRIOR_PSEUDO_COUNT), which is
--    what stops the first holdout observation from washing the prior out.
--    DO NOTHING, never DO UPDATE: re-running the seed must not overwrite a beta that
--    holdout observations have since moved. Retuning a prior is a deliberate act.
-- =============================================================================

insert into public.item_stats (item_id, beta, beta_n)
select i.id, coalesce(i.cold_start_beta, 0)::double precision, 5
from public.items i
where i.source = 'loxelingo-seed-ja-v1'
on conflict (item_id) do nothing;


-- =============================================================================
-- 5. ASSERTIONS. The seed fails loudly rather than leaving the app half-playable.
--    scripts/content/verify-seed.sql runs the same checks with readable output.
-- =============================================================================

do $$
declare
  n_concepts   integer;
  n_items      integer;
  n_mappings   integer;
  n_orphans    integer;
  n_starless   integer;
  n_beta_range integer;
begin
  select count(*) into n_concepts from public.concepts where world_slug = 'ja';
  select count(*) into n_items    from public.items    where source = 'loxelingo-seed-ja-v1';
  select count(*) into n_mappings from public.item_concepts ic
    join public.items i on i.id = ic.item_id where i.source = 'loxelingo-seed-ja-v1';

  -- Every item maps to >= 1 concept. The content-pipeline invariant named in the
  -- static-config migration; nothing in the schema enforces it, so it is enforced here.
  select count(*) into n_orphans
  from public.items i
  where i.source = 'loxelingo-seed-ja-v1'
    and not exists (select 1 from public.item_concepts ic where ic.item_id = i.id);

  -- A concept with no items can never be mastered: a dead star in the constellation.
  select count(*) into n_starless
  from public.concepts c
  where c.world_slug = 'ja'
    and not exists (select 1 from public.item_concepts ic where ic.concept_id = c.id);

  -- The prior must stay on a scale theta can reach. Outside [-1.8, 1.6] the item is
  -- either unservable to a beginner or free.
  select count(*) into n_beta_range
  from public.items i
  where i.source = 'loxelingo-seed-ja-v1'
    and (i.cold_start_beta is null or i.cold_start_beta < -1.8 or i.cold_start_beta > 1.6);

  if n_orphans > 0 then
    raise exception 'seed: % item(s) map to no concept', n_orphans;
  end if;
  if n_starless > 0 then
    raise exception 'seed: % ja concept(s) have no item and can never be mastered', n_starless;
  end if;
  if n_beta_range > 0 then
    raise exception 'seed: % item(s) have a cold_start_beta outside [-1.8, 1.6]', n_beta_range;
  end if;

  raise notice 'LoxeLingo ja seed: % concepts, % items, % item->concept mappings',
    n_concepts, n_items, n_mappings;
end $$;


-- =============================================================================
-- 6. BOT PERFORMANCE POOL — appended section, owned by supabase/seeds/bot-performances.sql
--
-- Nothing above this line changes. The bot pool that makes a duel match startable on a fresh
-- database (5 roster bots x 25 ja duel items = 125 stored performances) lives in
--   supabase/seeds/bot-performances.sql
-- and is loaded by `npx supabase db reset` through config.toml:
--   [db.seed] sql_paths = ["./seed.sql", "./seeds/*.sql"]
--
-- It is a separate file rather than an inline section because it depends on THIS file having
-- already run (it resolves every item by `items.external_id`), and because a psql `\ir`
-- include here is a syntax error: the Supabase CLI executes seed files over a plain SQL
-- connection and does not interpret psql meta-commands.
-- =============================================================================


-- =============================================================================
-- 7. ENGLISH WORLD CONTENT — appended section, owned by supabase/seeds/english-content.sql
--
-- Nothing above this line changes. The English world (`worlds.slug = 'en'`, added by
-- migration 20260806064130_english_world) ships with 31 concepts and 35 items:
--   15 DUEL briefs · 15 FORGE items · 5 RECALL reading items
-- They live in
--   supabase/seeds/english-content.sql
-- and are loaded by `npx supabase db reset` through the same config.toml entry section 6
-- documents:
--   [db.seed] sql_paths = ["./seed.sql", "./seeds/*.sql"]
--
-- A separate file rather than an inline section, for one reason beyond size: English is the
-- only world here that is not a foreign language for a native English speaker. Every learner
-- in it is a non-native speaker, so its task instructions are themselves second-language
-- input and are authored under a rule the six other worlds do not need — one short imperative
-- sentence, no idiom, never harder than the item it introduces. Keeping that content in its
-- own file keeps that rule reviewable in one place instead of diffused through this one.
--
-- The file is self-contained: it depends only on the migrations (the `en` world row, the
-- ladders, `items.external_id`) and on nothing this file creates, so the glob may load it in
-- either order relative to section 6.
-- =============================================================================
