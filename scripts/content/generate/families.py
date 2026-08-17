"""
families: the divergence catalogue.

Every family names one place where a learner's instinct and a model's instinct come apart. The
design rule comes from `docs/research/06-model-prior.md`: an item teaches only where the model's
most likely answer is wrong. `ja-forge-conj-shizuka-past` is the one item in the seeded bank that
behaves, and it behaves because 静かかった is what the model reaches for first. Each family below
is an attempt to reproduce that condition at scale.

`lure` is the load-bearing field. It is the wrong answer the family expects a model to produce,
and stage 3 refuses any item whose lure is missing, equal to the answer, or accepted by the answer
key. Stage 4, which measures p0, gets it in `answer.note`.

`kind` reuses the taxonomy already in `public.items` wherever one fits. Three kinds are new and
all three are Spanish, where the bank currently has no forge items at all: `copula_choice`,
`gender_agreement`, `accent_mark`. Nothing in `src/` switches on `items.kind` (the renderer
switches on `prompt.kind`, which stays `brief` or `glyph`), so a new value is a taxonomy addition
rather than a rendering change.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Family:
    key: str
    world: str
    kind: str
    prompt_kind: str  # 'glyph' or 'brief'
    mode: str  # 'exact' or 'choice'
    levels: tuple[str, ...]
    target_count: int
    divergence: str
    guidance: str
    exemplar: dict
    seed_pool: str  # 'vocab' or 'sentence'
    seed_role: str  # 'target' or 'context'
    input_label: str
    constraint_text: str
    time_limit_ms: int
    option_count: int = 4
    cold_start_beta: float = -0.5
    # A rewrite family shows the whole sentence and asks for it back changed, so it has no blank
    # and its answer legitimately contains the material.
    needs_blank: bool = True
    leak_check: bool = True
    notes: str = field(default="")


# ── Japanese ────────────────────────────────────────────────────────────────────────────────

JA_FAMILIES = [
    Family(
        key="naadj-crossover",
        world="ja",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("N5", "N4"),
        target_count=240,
        divergence="i-adjective inflection applied to a na-adjective",
        guidance=(
            "Pick a na-adjective (形容動詞 / 形状詞) at N5 or N4: 静か, 元気, 便利, 有名, 親切, 大切, "
            "簡単, 大丈夫, 嫌い, 好き, 上手, 下手, きれい, 賑やか, 丈夫, 暇, 立派, 安全, 不便, 残念. "
            "Ask for the plain past, the plain negative, the te-form or the adverbial form. "
            "The answer takes the copula (だった / じゃない / で / に). The lure is the i-adjective "
            "form (かった / くない / くて / く), which is what a model reaches for because the word "
            "ends in a kana that looks like an i-adjective stem. きれい and 嫌い are the sharpest "
            "cases: they end in い and are still na-adjectives."
        ),
        exemplar={
            "seed": "静か",
            "subject": "静か",
            "task": "Write the plain past form of 静か (しずか).",
            "surface": "静か",
            "reading": "しずか",
            "instruction": "Write this word in the plain past.",
            "mode": "exact",
            "primary": "静かだった",
            "accept": ["静かだった", "しずかだった"],
            "lure": "静かかった",
            "note": "静か is a na-adjective, so the past is carried by the copula: だった. 静かかった applies i-adjective inflection to a word that does not take it.",
            "rationale": "na-adjective inflected as an i-adjective",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your form",
        constraint_text="PLAIN PAST",
        time_limit_ms=25000,
        cold_start_beta=-0.3,
    ),
    Family(
        key="godan-lookalike",
        world="ja",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("N5", "N4"),
        target_count=240,
        divergence="a godan verb whose ending looks ichidan",
        guidance=(
            "Pick a godan (五段) verb ending in -いる or -える, which is the shape of an ichidan verb: "
            "帰る, 入る, 走る, 切る, 知る, 要る, 限る, 減る, 滑る, 蹴る, 混じる, 参る, 握る, practise "
            "with N5/N4 members only. Ask for the te-form, the plain negative, the masu-stem, the "
            "plain past or the potential. The answer follows the godan rule (帰って, 帰らない, 帰ります). "
            "The lure is the ichidan form (帰て, 帰ない, 帰ます), which is what the ending invites. "
            "Never use a real ichidan verb here."
        ),
        exemplar={
            "seed": "帰る",
            "subject": "帰る",
            "task": "Write the te-form of 帰る (かえる).",
            "surface": "帰る",
            "reading": "かえる",
            "instruction": "Write this verb in the te-form.",
            "mode": "exact",
            "primary": "帰って",
            "accept": ["帰って", "かえって"],
            "lure": "帰て",
            "note": "帰る ends in -える and is still godan, so the te-form is 帰って. 帰て is the ichidan rule applied to a verb whose ending only looks ichidan.",
            "rationale": "godan verb with an ichidan-shaped ending",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your form",
        constraint_text="TE-FORM",
        time_limit_ms=25000,
        cold_start_beta=-0.3,
    ),
    Family(
        key="te-voicing",
        world="ja",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("N5", "N4"),
        target_count=200,
        divergence="one dakuten separates the answer from the near miss",
        guidance=(
            "Pick an N5 or N4 godan verb and ask for the te-form or the plain past. The families "
            "that voice are ぐ (泳ぐ to 泳いで), ぬ ぶ む (読む to 読んで), and the ones that do not are "
            "く (書く to 書いて), つ る う (待つ to 待って), す (話す to 話して). The lure is the "
            "same string with the voicing swapped: 泳いて for 泳いで, 読んて for 読んで, 書いで for 書いて. "
            "Say in the note which ending drives the voicing."
        ),
        exemplar={
            "seed": "泳ぐ",
            "subject": "泳ぐ",
            "task": "Write the te-form of 泳ぐ (およぐ).",
            "surface": "泳ぐ",
            "reading": "およぐ",
            "instruction": "Write this verb in the te-form.",
            "mode": "exact",
            "primary": "泳いで",
            "accept": ["泳いで", "およいで"],
            "lure": "泳いて",
            "note": "ぐ verbs carry the voicing into the te-form: 泳いで. く verbs do not, which is why 書く gives 書いて. The two differ by one dakuten.",
            "rationale": "voiced and voiceless te-forms separated by one mark",
        },
        seed_pool="vocab",
        seed_role="target",
        input_label="Your form",
        constraint_text="TE-FORM",
        time_limit_ms=25000,
        cold_start_beta=-0.4,
    ),
    Family(
        key="particle-context",
        world="ja",
        kind="particle_choice",
        prompt_kind="brief",
        mode="choice",
        levels=("N5", "N4"),
        target_count=300,
        divergence="the frequent particle is the wrong one in this sentence",
        guidance=(
            "Write one short N5/N4 sentence with a blank and four particle options. The point is a "
            "context where the statistically frequent particle is wrong: が rather than を after "
            "好き, 上手, できる, わかる, ほしい; に rather than で for existence against action in the "
            "same place noun; は rather than が in a contrast; までに rather than まで for a deadline; "
            "に rather than へ where a destination is also an arrival time. Make the lure one of the "
            "four options and name it in the note. Every option must be a single particle and every "
            "option other than the answer must be clearly wrong in this sentence."
        ),
        exemplar={
            "seed": "図書館",
            "subject": "de-library",
            "task": "Choose the particle that fills the blank: 図書館＿＿本を読みます。",
            "surface": "図書館＿＿本を読みます。",
            "reading": "",
            "instruction": "Choose the particle that fills the blank.",
            "mode": "choice",
            "correct": "で",
            "options": ["で", "に", "を", "へ"],
            "lure": "に",
            "note": "The library is the space the reading happens in, so で. に would be right for 図書館にあります, where nothing is happening.",
            "rationale": "location particle chosen by what happens there rather than by the noun",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your answer",
        constraint_text="CHOOSE THE PARTICLE",
        time_limit_ms=15000,
        cold_start_beta=-0.55,
    ),
    Family(
        key="irregular-verb",
        world="ja",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("N5", "N4"),
        target_count=120,
        divergence="an irregular form where the regular one is well formed and wrong",
        guidance=(
            "Pick one of the truly irregular N5/N4 items: 来る, する, 行く, ある, いい/良い, ない, "
            "だ, and the する compounds (勉強する, 電話する). Ask for a form where the regular rule "
            "produces something plausible: 行って rather than 行いて, 来ない rather than 来らない, "
            "よくない rather than いくない, ない rather than あらない, 来られる rather than 来れる in "
            "the plain potential. The lure is the regularised form."
        ),
        exemplar={
            "seed": "いい",
            "subject": "ii-negative",
            "task": "Write the plain negative form of いい (good).",
            "surface": "いい",
            "reading": "いい",
            "instruction": "Write this adjective in the plain negative.",
            "mode": "exact",
            "primary": "よくない",
            "accept": ["よくない", "良くない"],
            "lure": "いくない",
            "note": "いい reverts to its older stem よ before any inflection, so the negative is よくない. いくない applies the ordinary i-adjective rule to the surface form.",
            "rationale": "irregular stem where the regular rule is well formed",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your form",
        constraint_text="PLAIN NEGATIVE",
        time_limit_ms=25000,
        cold_start_beta=-0.2,
    ),
    Family(
        key="transitivity-pair",
        world="ja",
        kind="verb_form",
        prompt_kind="brief",
        mode="choice",
        levels=("N4",),
        target_count=60,
        divergence="the transitive and intransitive members of a pair look interchangeable",
        guidance=(
            "Use an N4 transitive and intransitive pair: 開く/開ける, 閉まる/閉める, 始まる/始める, "
            "つく/つける, 出る/出す, 入る/入れる, 落ちる/落とす, 決まる/決める, 集まる/集める. Write one "
            "short sentence whose particle marking (が against を) forces one member, and offer the "
            "four forms as options. The lure is the other member of the pair in the same tense."
        ),
        exemplar={
            "seed": "電気",
            "subject": "denki-tsuku",
            "task": "Choose the verb for the blank: 電気が＿＿。",
            "surface": "電気が＿＿。",
            "reading": "",
            "instruction": "Choose the verb for the blank.",
            "mode": "choice",
            "correct": "つきます",
            "options": ["つきます", "つけます", "あきます", "あけます"],
            "lure": "つけます",
            "note": "が marks the light as the thing that does the turning on by itself, so the intransitive つきます. つけます needs 電気を and a person doing it.",
            "rationale": "transitivity forced by the particle rather than by the meaning",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your answer",
        constraint_text="CHOOSE THE VERB",
        time_limit_ms=20000,
        cold_start_beta=-0.45,
    ),
    Family(
        key="rendaku-blocked",
        world="ja",
        kind="kanji_reading",
        prompt_kind="glyph",
        mode="exact",
        levels=("N5", "N4"),
        target_count=40,
        divergence="rendaku is blocked by a voiced obstruent later in the second element",
        guidance=(
            "Pick an N5/N4 compound where the second element would ordinarily voice but does not, "
            "because it already contains a voiced obstruent (Lyman's Law): 山風 やまかぜ, 春風 はるかぜ, "
            "大蛇, 紙屑. Contrast it in the note with a compound where voicing does happen (手紙 てがみ). "
            "The lure is the voiced reading. Keep the compound to two kanji and inside N5/N4 "
            "vocabulary. This family is the weakest of the Japanese set because a reading is a "
            "lookup rather than a rule, and it is included only because the blocking condition is a "
            "rule a player can state."
        ),
        exemplar={
            "seed": "山風",
            "subject": "yamakaze",
            "task": "Write the reading of 山風 in hiragana.",
            "surface": "山風",
            "reading": "",
            "instruction": "Write the reading of this word in hiragana.",
            "mode": "exact",
            "primary": "やまかぜ",
            "accept": ["やまかぜ"],
            "lure": "やまがぜ",
            "note": "Rendaku would give がぜ, but 風 かぜ already carries a voiced obstruent in ぜ, and a morpheme takes at most one. 手紙 てがみ voices because かみ has none.",
            "rationale": "rendaku blocked by Lyman's Law",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Reading",
        constraint_text="READING IN HIRAGANA",
        time_limit_ms=20000,
        cold_start_beta=-0.8,
        notes="expected to die at the p0 filter; a reading cannot be taught without saying it",
    ),
]

# ── English ─────────────────────────────────────────────────────────────────────────────────

EN_FAMILIES = [
    Family(
        key="article-sound",
        world="en",
        kind="article_choice",
        prompt_kind="brief",
        mode="exact",
        levels=("A1", "A2", "B1"),
        target_count=150,
        divergence="a or an chosen by the letter rather than by the sound",
        guidance=(
            "Write a short A1-B1 sentence with a blank before a word whose first letter and first "
            "sound disagree: an hour, an honest, an heir, a university, a European, a one-way, a "
            "uniform, an MBA, an SMS, an FBI agent, a UFO, an X-ray, an NHS nurse, a euro. Initialisms "
            "are the sharpest cases because the sound is the letter name. The lure is the article "
            "the spelling suggests."
        ),
        exemplar={
            "seed": "hour",
            "subject": "an-hour",
            "task": "Write a or an: We waited for ___ hour.",
            "surface": "We waited for ___ hour.",
            "reading": "",
            "instruction": "Write a or an.",
            "mode": "exact",
            "primary": "an",
            "accept": ["an", "An"],
            "lure": "a",
            "note": "hour starts with a vowel sound because the h is silent, so an. The rule is about the sound and not about the letter.",
            "rationale": "article chosen by sound against a consonant letter",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="a or an",
        constraint_text="A OR AN",
        time_limit_ms=15000,
        cold_start_beta=-0.7,
    ),
    Family(
        key="preposition-verb",
        world="en",
        kind="preposition_cloze",
        prompt_kind="brief",
        mode="exact",
        levels=("A2", "B1"),
        target_count=200,
        divergence="the verb takes a preposition the learner's first language does not predict",
        guidance=(
            "Write a short A2-B1 sentence with a blank after a verb or adjective whose preposition "
            "is fixed and is not the one a Romance or Germanic first language supplies: depend on, "
            "married to, interested in, good at, arrive at a building, arrive in a city, listen to, "
            "wait for, ask for, look after, consist of, similar to, afraid of, responsible for. "
            "The lure is the transferred preposition (depend of, married with, good in, afraid from). "
            "Accept register variants such as upon where they are correct."
        ),
        exemplar={
            "seed": "married",
            "subject": "married-to",
            "task": "Write one word in the blank: She is married ___ a doctor.",
            "surface": "She is married ___ a doctor.",
            "reading": "",
            "instruction": "Write one word in the blank.",
            "mode": "exact",
            "primary": "to",
            "accept": ["to", "To"],
            "lure": "with",
            "note": "married takes to. married with is a direct import from Spanish casado con and German verheiratet mit, and it is the most common error at A2.",
            "rationale": "fixed preposition against first-language transfer",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="One word",
        constraint_text="ONE WORD",
        time_limit_ms=15000,
        cold_start_beta=-0.2,
    ),
    Family(
        key="countability-context",
        world="en",
        kind="countability_choice",
        prompt_kind="brief",
        mode="choice",
        levels=("A2", "B1"),
        target_count=150,
        divergence="a noun that counts in one sense and not in another",
        guidance=(
            "Write a short A2-B1 sentence whose context decides whether the noun is countable: two "
            "coffees against not much coffee, a paper against some paper, a hair against long hair, "
            "an experience against much experience, a glass against some glass, times against time, "
            "works against work. Offer four determiners or forms and make the lure the reading of the "
            "noun that is correct in the other sense. Every option other than the answer must be "
            "wrong in this sentence and not merely less natural."
        ),
        exemplar={
            "seed": "paper",
            "subject": "a-paper",
            "task": "Choose the word for the blank: He published ___ paper on climate models.",
            "surface": "He published ___ paper on climate models.",
            "reading": "",
            "instruction": "Choose the word for the blank.",
            "mode": "choice",
            "correct": "a",
            "options": ["a", "some", "much", "any"],
            "lure": "some",
            "note": "paper in the sense of an article is countable, so a. some paper would be the material, which is not what gets published.",
            "rationale": "countability decided by the sense the sentence forces",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your answer",
        constraint_text="CHOOSE THE WORD",
        time_limit_ms=20000,
        cold_start_beta=-0.25,
    ),
    Family(
        key="irregular-participle",
        world="en",
        kind="verb_form",
        prompt_kind="glyph",
        mode="exact",
        levels=("A2", "B1"),
        target_count=150,
        divergence="the past form standing in for the participle",
        guidance=(
            "Pick an A2-B1 irregular verb whose second and third forms differ and ask for the form "
            "after have: write, go, do, see, take, give, know, speak, break, choose, drive, eat, "
            "fall, forget, hide, ride, rise, steal, wear, begin, drink, ring, sing, swim, fly. The "
            "lure is the past form (I have wrote, I have went, I have drank). Also usable in the "
            "other direction: come, run, become, and the verbs whose three forms are identical "
            "(cut, put, cost, hit), where the lure is an invented -en form."
        ),
        exemplar={
            "seed": "fly",
            "subject": "flown",
            "task": "Write the third form of the verb fly, the form used after have. For example: I have ___ .",
            "surface": "fly",
            "reading": "",
            "instruction": "Write the third form. This is the form after have.",
            "mode": "exact",
            "primary": "flown",
            "accept": ["flown", "Flown"],
            "lure": "flew",
            "note": "Three-form verb: fly / flew / flown. I have flew reuses the second form, which is the error that survives longest because the second form is learned first.",
            "rationale": "past form standing in for the participle",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Third form",
        constraint_text="THIRD FORM",
        time_limit_ms=20000,
        cold_start_beta=0.0,
    ),
    Family(
        key="stress-doubling",
        world="en",
        kind="spelling",
        prompt_kind="glyph",
        mode="exact",
        levels=("A2", "B1"),
        target_count=130,
        divergence="the consonant doubling rule stated without its stress condition",
        guidance=(
            "Ask for the -ing or -ed form of a two-syllable verb where the doubling rule turns on "
            "which syllable is stressed. Doubling happens under final stress: prefer to preferring, "
            "occur to occurring, begin to beginning, permit to permitted, refer to referred. Doubling "
            "does not happen when the stress is earlier: offer to offering, benefit to benefited, "
            "visit to visiting, happen to happening, target to targeted, open to opening, listen to "
            "listening, enter to entering. The lure is the form the over-general rule produces. Use "
            "American spelling and say so in the note when British usage differs (travelling)."
        ),
        exemplar={
            "seed": "offer",
            "subject": "offering",
            "task": "Write the -ing form of the verb: offer.",
            "surface": "offer",
            "reading": "",
            "instruction": "Write the -ing form.",
            "mode": "exact",
            "primary": "offering",
            "accept": ["offering", "Offering"],
            "lure": "offerring",
            "note": "Doubling needs the stress on the final syllable. offer is stressed on the first, so nothing doubles: offering. prefer is stressed on the second, which is why it gives preferring.",
            "rationale": "counter-example to the doubling rule stated without stress",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="-ing form",
        constraint_text="-ING FORM",
        time_limit_ms=15000,
        cold_start_beta=-1.0,
    ),
    Family(
        key="plural-f-exception",
        world="en",
        kind="spelling",
        prompt_kind="glyph",
        mode="exact",
        levels=("A1", "A2", "B1"),
        target_count=60,
        divergence="the f to ves rule applied to a noun that keeps its f",
        guidance=(
            "Ask for the plural of an A1-B1 noun ending in f or fe where the plural keeps the f: "
            "roof, chief, belief, proof, cliff, chef, safe, gulf, reef, handkerchief. The lure is the "
            "ves form (rooves, chieves). Contrast in the note with a noun that does change (leaf to "
            "leaves, knife to knives, wife to wives). The o-plurals work the same way: piano to "
            "pianos and photo to photos against potato to potatoes and hero to heroes."
        ),
        exemplar={
            "seed": "roof",
            "subject": "roofs",
            "task": "Write the plural of the noun: roof.",
            "surface": "roof",
            "reading": "",
            "instruction": "Write the plural.",
            "mode": "exact",
            "primary": "roofs",
            "accept": ["roofs", "Roofs"],
            "lure": "rooves",
            "note": "roof keeps its f: roofs. The ves change belongs to a closed list that includes leaf, knife and wife, and roof was never on it.",
            "rationale": "counter-example to the f to ves plural rule",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Plural",
        constraint_text="PLURAL",
        time_limit_ms=15000,
        cold_start_beta=-0.9,
    ),
    Family(
        key="capitals-interference",
        world="en",
        kind="capitalisation",
        prompt_kind="brief",
        mode="exact",
        levels=("A1", "A2"),
        target_count=60,
        divergence="words English capitalises and most other languages do not",
        guidance=(
            "Give a short A1-A2 sentence written entirely in lower case and ask for it back with "
            "English capitals. Load it with the categories that stay lower case in Spanish, French, "
            "Italian, Portuguese, Polish, Russian and Turkish: days, months, nationalities, "
            "languages, and the pronoun I. Include one word that must stay lower case, such as a "
            "season or a school subject, so the answer is not simply capitalise everything. The lure "
            "is the version that leaves the day, month, nationality or language lower case."
        ),
        exemplar={
            "seed": "monday",
            "subject": "spanish-monday",
            "task": "Write this sentence again with capital letters where English needs them: on monday i study spanish in the spring.",
            "surface": "on monday i study spanish in the spring.",
            "reading": "",
            "instruction": "Write this sentence again with capital letters where English needs them.",
            "mode": "exact",
            "primary": "On Monday I study Spanish in the spring.",
            "accept": ["On Monday I study Spanish in the spring.", "On Monday I study Spanish in the spring"],
            "lure": "On monday i study spanish in the spring.",
            "note": "Four capitals: the sentence start, the day, the pronoun I and the language. spring stays lower case, so the rule is a category rule rather than capitalise every important word.",
            "rationale": "capitalised categories against first-language habit",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Your sentence",
        constraint_text="CAPITAL LETTERS",
        time_limit_ms=25000,
        cold_start_beta=-0.4,
        needs_blank=False,
        leak_check=False,
    ),
]

# ── Spanish ─────────────────────────────────────────────────────────────────────────────────

ES_FAMILIES = [
    Family(
        key="ser-estar",
        world="es",
        kind="copula_choice",
        prompt_kind="brief",
        mode="choice",
        levels=("A1", "A2", "B1"),
        target_count=200,
        divergence="the copula the adjective usually takes is the wrong one here",
        guidance=(
            "Write a short A1-B1 Spanish sentence with a blank and four conjugated copula options "
            "drawn from ser and estar. Choose a context where the frequent choice loses: adjectives "
            "that change meaning (listo, aburrido, rico, verde, malo, bueno, vivo, orgulloso), food "
            "and drink judged by taste (la sopa está buena) against by category (la sopa es "
            "vegetariana), location of an event (la fiesta es en mi casa) against location of a thing "
            "(la casa está en el centro). The lure is the other copula in the same person and tense, "
            "and it must be one of the options. Every remaining option must be wrong in person, "
            "number or tense as well as in choice of verb."
        ),
        exemplar={
            "seed": "sopa",
            "subject": "sopa-esta-buena",
            "task": "Elige la palabra para el hueco: La sopa ___ muy buena, ¿quieres probarla?",
            "surface": "La sopa ___ muy buena, ¿quieres probarla?",
            "reading": "",
            "instruction": "Elige la palabra para el hueco.",
            "mode": "choice",
            "correct": "está",
            "options": ["está", "es", "están", "son"],
            "lure": "es",
            "note": "buena here is a verdict on how the soup tastes right now, which is estar. La sopa es buena would classify soup in general as a good thing.",
            "rationale": "ser and estar decided by the reading the sentence forces",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Tu respuesta",
        constraint_text="ELIGE LA PALABRA",
        time_limit_ms=20000,
        cold_start_beta=-0.5,
    ),
    Family(
        key="preterite-irregular",
        world="es",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("A2", "B1"),
        target_count=150,
        divergence="a strong preterite where the regular ending is well formed and wrong",
        guidance=(
            "Ask for one preterite form of a verb with a strong stem: andar to anduve, tener to tuve, "
            "estar to estuve, poder to pude, poner to puse, saber to supe, querer to quise, hacer to "
            "hizo, venir to vine, traer to traje, decir to dije, conducir to conduje, producir to "
            "produje, caber to cupe. The lure is the regularised form (andé, sabí, quisé) or, for the "
            "j-stems in the third person plural, the inserted i (trajieron for trajeron, dijieron for "
            "dijeron). State the person and the tense in the task so exactly one form is correct."
        ),
        exemplar={
            "seed": "andar",
            "subject": "anduve",
            "task": "Escribe la forma de andar en pretérito indefinido, primera persona del singular (yo).",
            "surface": "andar",
            "reading": "",
            "instruction": "Escribe el verbo en pretérito indefinido (yo).",
            "mode": "exact",
            "primary": "anduve",
            "accept": ["anduve", "Anduve"],
            "lure": "andé",
            "note": "andar takes the strong stem anduv- in the preterite, so anduve. andé follows the regular -ar pattern and is the error every learner produces first.",
            "rationale": "strong preterite stem against the regular ending",
        },
        seed_pool="vocab",
        seed_role="target",
        input_label="Tu forma",
        constraint_text="PRETÉRITO INDEFINIDO",
        time_limit_ms=25000,
        cold_start_beta=-0.2,
    ),
    Family(
        key="stem-change-preterite",
        world="es",
        kind="conjugation",
        prompt_kind="glyph",
        mode="exact",
        levels=("A2", "B1"),
        target_count=120,
        divergence="the -ir stem change that shows up only in the third person preterite",
        guidance=(
            "Ask for the third person singular or plural preterite of an -ir verb that changes its "
            "stem there and nowhere else in that tense: dormir to durmió, morir to murió, pedir to "
            "pidió, seguir to siguió, sentir to sintió, servir to sirvió, repetir to repitió, "
            "preferir to prefirió, mentir to mintió, vestir to vistió. The lure is the unchanged stem "
            "(dormió, pedió). Say in the note that the first and second persons keep the stem, which "
            "is why the change looks arbitrary."
        ),
        exemplar={
            "seed": "dormir",
            "subject": "durmio",
            "task": "Escribe la forma de dormir en pretérito indefinido, tercera persona del singular (él).",
            "surface": "dormir",
            "reading": "",
            "instruction": "Escribe el verbo en pretérito indefinido (él).",
            "mode": "exact",
            "primary": "durmió",
            "accept": ["durmió", "Durmió"],
            "lure": "dormió",
            "note": "-ir stem changers raise the vowel in the third person of the preterite only: dormí and dormiste keep the o, durmió does not. dormió is the regular form and it is wrong.",
            "rationale": "stem change confined to one person of one tense",
        },
        seed_pool="vocab",
        seed_role="target",
        input_label="Tu forma",
        constraint_text="PRETÉRITO INDEFINIDO",
        time_limit_ms=25000,
        cold_start_beta=-0.3,
    ),
    Family(
        key="gender-exception",
        world="es",
        kind="gender_agreement",
        prompt_kind="brief",
        mode="choice",
        levels=("A1", "A2", "B1"),
        target_count=150,
        divergence="grammatical gender against the gender the ending advertises",
        guidance=(
            "Write a short A1-B1 sentence with a blank for an article or an adjective and four "
            "options. Use a noun whose ending points the wrong way: el problema, el día, el mapa, el "
            "idioma, el sistema, el clima, el planeta, la mano, la foto, la moto, la radio, and the "
            "stressed-a feminines that take el in the singular and las in the plural (el agua fría, "
            "el aula, el hacha, las aguas). The agreement cases are the sharpest: el agua takes el "
            "and still takes a feminine adjective. The lure is the option that follows the ending."
        ),
        exemplar={
            "seed": "agua",
            "subject": "el-agua-fria",
            "task": "Elige la palabra para el hueco: El agua ___ del río baja de la montaña.",
            "surface": "El agua ___ del río baja de la montaña.",
            "reading": "",
            "instruction": "Elige la palabra para el hueco.",
            "mode": "choice",
            "correct": "fría",
            "options": ["fría", "frío", "fríos", "frías"],
            "lure": "frío",
            "note": "agua is feminine. It takes el in the singular only so that two a sounds do not collide, and the adjective still agrees as feminine: el agua fría.",
            "rationale": "agreement against the article the noun appears to take",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Tu respuesta",
        constraint_text="ELIGE LA PALABRA",
        time_limit_ms=20000,
        cold_start_beta=-0.4,
    ),
    Family(
        key="por-para",
        world="es",
        kind="preposition_cloze",
        prompt_kind="brief",
        mode="choice",
        levels=("A2", "B1"),
        target_count=130,
        divergence="por and para where the usual gloss picks the wrong one",
        guidance=(
            "Write a short A2-B1 sentence with a blank and four options, of which por and para are "
            "two. Choose a context where the school gloss (para is for, por is by) misfires: exchange "
            "and price (lo compré por diez euros), duration (estudié por dos horas), cause against "
            "purpose (lo hice por ti against lo hice para ti), movement through (caminamos por el "
            "parque), a deadline (para el viernes). Name in the note which reading the lure comes "
            "from. The other two options must be prepositions that are wrong here."
        ),
        exemplar={
            "seed": "comprar",
            "subject": "por-diez-euros",
            "task": "Elige la palabra para el hueco: Compré este libro ___ diez euros.",
            "surface": "Compré este libro ___ diez euros.",
            "reading": "",
            "instruction": "Elige la palabra para el hueco.",
            "mode": "choice",
            "correct": "por",
            "options": ["por", "para", "de", "en"],
            "lure": "para",
            "note": "An amount handed over in exchange is por. para would make the ten euros the purpose of the book rather than its price.",
            "rationale": "por and para split by exchange against purpose",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Tu respuesta",
        constraint_text="ELIGE LA PALABRA",
        time_limit_ms=20000,
        cold_start_beta=-0.35,
    ),
    Family(
        key="accent-minimal-pair",
        world="es",
        kind="accent_mark",
        prompt_kind="brief",
        mode="exact",
        levels=("A1", "A2", "B1"),
        target_count=90,
        divergence="one accent separates two real words",
        guidance=(
            "Write a short A1-B1 sentence with a blank where the accented and unaccented spellings are "
            "both real words and only one fits: él against el, tú against tu, sí against si, sé "
            "against se, más against mas, dé against de, té against te, qué against que, cómo against "
            "como, dónde against donde, está against esta, aún against aun. The lure is the other "
            "member of the pair. Say in the note what the accent is doing, since it marks the "
            "stressed or the emphatic word rather than a sound change."
        ),
        exemplar={
            "seed": "tu",
            "subject": "tu-vs-tu",
            "task": "Escribe la palabra que falta: ___ eres mi mejor amiga.",
            "surface": "___ eres mi mejor amiga.",
            "reading": "",
            "instruction": "Escribe la palabra que falta.",
            "mode": "exact",
            "primary": "Tú",
            "accept": ["Tú", "tú"],
            "lure": "Tu",
            "note": "The subject pronoun carries the accent: tú eres. Unaccented tu is the possessive, as in tu amiga, and it cannot be the subject of eres.",
            "rationale": "accent distinguishing pronoun from possessive",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Tu respuesta",
        constraint_text="ESCRIBE LA PALABRA",
        time_limit_ms=15000,
        cold_start_beta=-0.5,
    ),
    Family(
        key="gustar-agreement",
        world="es",
        kind="conjugation",
        prompt_kind="brief",
        mode="choice",
        levels=("A1", "A2"),
        target_count=60,
        divergence="gustar agreeing with the thing liked rather than with the person",
        guidance=(
            "Write a short A1-A2 sentence with a blank for gustar, encantar, interesar, doler, "
            "parecer, quedar or faltar. The verb agrees with what is liked, so a plural object takes "
            "the plural verb even though the sentence starts with a singular person: a mí me gustan "
            "los libros, a Ana le duelen los pies. The lure is the singular form, which is what "
            "agreement with the person would give. Options must all be forms of the same verb."
        ),
        exemplar={
            "seed": "gustar",
            "subject": "me-gustan-libros",
            "task": "Elige la palabra para el hueco: A mí me ___ los libros de aventuras.",
            "surface": "A mí me ___ los libros de aventuras.",
            "reading": "",
            "instruction": "Elige la palabra para el hueco.",
            "mode": "choice",
            "correct": "gustan",
            "options": ["gustan", "gusta", "gusto", "gustamos"],
            "lure": "gusta",
            "note": "gustar agrees with what pleases, and los libros is plural, so gustan. me is an indirect object and never drives the ending.",
            "rationale": "agreement with the object rather than with the person",
        },
        seed_pool="vocab",
        seed_role="context",
        input_label="Tu respuesta",
        constraint_text="ELIGE LA PALABRA",
        time_limit_ms=20000,
        cold_start_beta=-0.45,
    ),
]

ALL_FAMILIES = JA_FAMILIES + EN_FAMILIES + ES_FAMILIES
BY_KEY = {family.key: family for family in ALL_FAMILIES}
