"""
stage 3: the linguistic filter.

Nothing here measures p0. That belongs to the harness that owns `src/lib/teaching/`. This stage
answers a smaller question: is the item well formed, is it at the level it claims, and is its
answer key actually a key. An item that fails any of those is noise in the p0 measurement, and
measuring it costs the same as measuring a good one.

The gates run cheapest first and every drop is recorded with a reason, so the funnel in
`out/funnel.json` can be read straight into the write-up.

  A  shape          required fields, the external_id regex the database enforces, no collision
                    with the 40 seeded items
  B  answer key     choice: the correct option is among the options and the lure is a different
                    option. exact: primary is in accept, and the lure is NOT accepted. A distractor
                    that the key happens to accept would punish a player who taught well, which is
                    the failure mode the brief calls out by name.
  C  well formed    the answer does not appear in the task, a sentence item has a blank, the script
                    matches the world
  D  morphology     SudachiPy for Japanese, spaCy for English and Spanish. Is the answer actually a
                    form of the word the item claims to be about, and is the target in the word
                    class the family requires
  E  level          vocabulary membership against the graded lists from stage 1, plus
                    bennexx/cl-tohoku-bert-base-japanese-v3-jlpt-classifier for Japanese sentences
  F  duplicates     exact and near duplicate within the batch
  G  adjudication   one Claude Haiku call per surviving item at temperature 0, asking whether the
                    stated answer is right, whether a second answer is defensible, and whether any
                    distractor is also correct. Deterministic checks cannot see a distractor that
                    happens to be true.

Gate G is a correctness gate on the whole pipeline rather than a quality nicety, and the reason is
the shape of the filter downstream. `docs/research/09-prior-filter.md` keeps an item when the
avatar answers it WRONG without teaching. Now take an item whose key says は where the truth is が:

  * the avatar answers が, which is right in reality
  * it is scored against the key, so it is marked wrong
  * every sample misses, p0 = 0.0, Wilson upper bound 0.161, top of the eligible list
  * it enters the bank, a player teaches が correctly, and the player is marked wrong

A broken key is not merely invisible to the p0 filter. It outscores a perfect item, so the filter
selects for it. That is why an item gate G never judged leaves through `candidates.pending.jsonl`
rather than `candidates.jsonl`, and why every row of both files carries `eligible_for_prior`. A
consumer that reads the main file is right by default, and a consumer that reads the field is right
whichever file it came from.

Output: out/candidates.jsonl (eligible), out/candidates.pending.jsonl (unjudged),
out/rejected.jsonl, out/funnel.json, out/adjudication.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterable

from common import (
    ADJUDICATION_PATH,
    CANDIDATES_PATH,
    FUNNEL_PATH,
    PENDING_PATH,
    LEXICON_PATH,
    RAW_PATH,
    REJECTED_PATH,
    ensure_out,
    is_valid_external_id,
    load_env,
    normalize,
    read_jsonl,
    write_jsonl,
)
from families import BY_KEY

HERE = Path(__file__).resolve().parent
EXISTING_BANK = HERE / "existing_bank.json"

ADJUDICATION_MODEL = "claude-haiku-4-5"

CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
JLPT_ORDER = ["N5", "N4", "N3", "N2", "N1"]

HAS_JA = re.compile(r"[぀-ヿ一-鿿]")
HAS_CJK_ONLY_LATIN = re.compile(r"^[\x00-\x7f]*$")
BLANK_MARKERS = ("___", "__", "＿＿", "＿", "…", "____")
EM_DASH = re.compile(r"[—–]")

# The alternations Sudachi resolves to a different dictionary form than the item names.
JA_LEMMA_ALIASES = {"いい": "よい", "良い": "よい", "よい": "よい"}

REQUIRED_FIELDS = (
    "external_id", "world_slug", "ladder_slug", "kind", "prompt", "answer",
    "target_level", "source_dataset", "generation_rationale", "divergence_family", "lure",
)


class Rejects:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self.counts: Counter[str] = Counter()

    def drop(self, row: dict[str, Any], stage: str, reason: str, detail: str = "") -> None:
        self.counts[reason] += 1
        self.rows.append({
            "external_id": row.get("external_id"),
            "divergence_family": row.get("divergence_family"),
            "world_slug": row.get("world_slug"),
            "stage": stage,
            "reason": reason,
            "detail": detail[:200],
        })


def answer_strings(row: dict[str, Any]) -> list[str]:
    answer = row.get("answer") or {}
    if answer.get("mode") == "choice":
        return [normalize(str(answer.get("correct") or ""))]
    values = [answer.get("primary"), *(answer.get("accept") or [])]
    return [normalize(str(v)) for v in values if v]


def head_answer(row: dict[str, Any]) -> str:
    answer = row.get("answer") or {}
    return normalize(str(answer.get("correct") if answer.get("mode") == "choice" else answer.get("primary") or ""))


def surface_of(row: dict[str, Any]) -> str:
    prompt = row.get("prompt") or {}
    return str(prompt.get("glyph") or prompt.get("brief") or "")


# ── A: shape ────────────────────────────────────────────────────────────────────────────────


def load_existing_bank() -> tuple[set[str], set[tuple[str, str]]]:
    if not EXISTING_BANK.exists():
        return set(), set()
    rows = json.loads(EXISTING_BANK.read_text(encoding="utf-8"))
    ids = {row["external_id"] for row in rows if row.get("external_id")}
    pairs = {(normalize(row.get("surface") or ""), normalize(row.get("answer") or "")) for row in rows}
    return ids, pairs


def gate_shape(rows: Iterable[dict[str, Any]], rejects: Rejects) -> list[dict[str, Any]]:
    existing_ids, existing_pairs = load_existing_bank()
    kept: list[dict[str, Any]] = []
    for row in rows:
        missing = [field for field in REQUIRED_FIELDS if not row.get(field)]
        if missing:
            rejects.drop(row, "A", "a1_missing_field", ",".join(missing))
            continue
        if row["divergence_family"] not in BY_KEY:
            rejects.drop(row, "A", "a2_unknown_family", row["divergence_family"])
            continue
        if not is_valid_external_id(row["external_id"]):
            rejects.drop(row, "A", "a3_bad_external_id", row["external_id"])
            continue
        if row["external_id"] in existing_ids:
            rejects.drop(row, "A", "a4_id_collides_with_seeded_bank", row["external_id"])
            continue
        if (normalize(surface_of(row)), head_answer(row)) in existing_pairs:
            rejects.drop(row, "A", "a5_restates_a_seeded_item", surface_of(row))
            continue
        prompt = row["prompt"]
        if not prompt.get("task") or not surface_of(row) or not prompt.get("instruction"):
            rejects.drop(row, "A", "a6_empty_prompt_field", "")
            continue
        if not (row["answer"].get("note") or "").strip():
            rejects.drop(row, "A", "a7_missing_note", "")
            continue
        kept.append(row)
    return kept


# ── B: answer key ───────────────────────────────────────────────────────────────────────────


def gate_answer_key(rows: Iterable[dict[str, Any]], rejects: Rejects) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for row in rows:
        family = BY_KEY[row["divergence_family"]]
        answer = row["answer"]
        lure = normalize(str(row.get("lure") or ""))
        accepted = set(answer_strings(row))

        if not lure:
            rejects.drop(row, "B", "b1_lure_missing")
            continue
        if lure in accepted:
            rejects.drop(row, "B", "b2_lure_is_accepted_by_the_key", lure)
            continue

        if answer["mode"] == "choice":
            options = [normalize(str(o)) for o in (row["prompt"].get("options") or [])]
            correct = normalize(str(answer.get("correct") or ""))
            if len(options) != family.option_count:
                rejects.drop(row, "B", "b3_wrong_option_count", str(len(options)))
                continue
            if len(set(options)) != len(options):
                rejects.drop(row, "B", "b4_duplicate_options", "|".join(options))
                continue
            if correct not in options:
                rejects.drop(row, "B", "b5_correct_not_among_options", correct)
                continue
            if lure not in options:
                rejects.drop(row, "B", "b6_lure_not_among_options", lure)
                continue
        else:
            primary = normalize(str(answer.get("primary") or ""))
            accept = [normalize(str(a)) for a in (answer.get("accept") or [])]
            if not primary:
                rejects.drop(row, "B", "b7_missing_primary")
                continue
            if primary not in accept:
                rejects.drop(row, "B", "b8_primary_not_in_accept", primary)
                continue
            if len(set(accept)) != len(accept):
                rejects.drop(row, "B", "b9_accept_duplicates_after_nfc", "|".join(accept))
                continue
            if len(accept) > 8:
                rejects.drop(row, "B", "b10_accept_too_permissive", str(len(accept)))
                continue
        kept.append(row)
    return kept


# ── C: well formed ──────────────────────────────────────────────────────────────────────────


def leaks(answer: str, material: str, world: str) -> bool:
    """Is the answer readable straight off the material."""
    if world == "ja":
        return len(answer) >= 2 and answer in material
    if len(answer) >= 3:
        return answer.lower() in material.lower()
    return re.search(rf"\b{re.escape(answer)}\b", material, flags=re.I) is not None


def is_a_sentence(text: str, world: str) -> bool:
    """A glyph item shows one word. Anything with sentence punctuation or several words is not."""
    if world == "ja":
        return any(mark in text for mark in "。、？！＿") or len(text) > 8
    return len(text.split()) > 2 or any(mark in text for mark in ".?!_")


def gate_well_formed(rows: Iterable[dict[str, Any]], rejects: Rejects) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for row in rows:
        family = BY_KEY[row["divergence_family"]]
        prompt = row["prompt"]
        task = str(prompt["task"])
        surface = surface_of(row)
        head = head_answer(row)

        blob = " ".join([task, surface, str(prompt.get("instruction") or ""), str(row["answer"].get("note") or "")])
        if EM_DASH.search(blob):
            rejects.drop(row, "C", "c1_em_dash_in_copy")
            continue

        # The answer must not be readable off the material. Only `surface` is searched: the
        # instruction line legitimately contains words like `in` and `a`, and `task` carries the
        # instruction. Case is not folded, for the same reason answer-key.ts does not fold it.
        if family.leak_check and head and leaks(head, surface, row["world_slug"]):
            rejects.drop(row, "C", "c2_answer_appears_in_the_material", f"{head} in {surface}")
            continue

        needs_blank = family.prompt_kind == "brief" and family.needs_blank
        if needs_blank and not any(marker in surface for marker in BLANK_MARKERS):
            rejects.drop(row, "C", "c3_sentence_has_no_blank", surface)
            continue
        if family.prompt_kind == "glyph" and is_a_sentence(surface, row["world_slug"]):
            rejects.drop(row, "C", "c4_glyph_item_carries_a_sentence", surface)
            continue

        if row["world_slug"] == "ja":
            if not HAS_JA.search(surface):
                rejects.drop(row, "C", "c5_japanese_item_without_japanese_script", surface)
                continue
            if not HAS_JA.search(head):
                rejects.drop(row, "C", "c6_japanese_answer_without_japanese_script", head)
                continue
        else:
            if HAS_JA.search(surface) or HAS_JA.search(head):
                rejects.drop(row, "C", "c7_cjk_script_in_a_latin_world", surface)
                continue
        if row["world_slug"] == "es" and family.key in {"preterite-irregular", "stem-change-preterite", "accent-minimal-pair"}:
            # These three turn on a diacritic. An answer stripped of its accents is a different word.
            if unicodedata.normalize("NFD", head) == unicodedata.normalize("NFD", row.get("lure", "")):
                rejects.drop(row, "C", "c8_answer_and_lure_differ_only_in_normalisation")
                continue
        kept.append(row)
    return kept


# ── D: morphology ───────────────────────────────────────────────────────────────────────────


class Morphology:
    def __init__(self) -> None:
        from sudachipy import dictionary, tokenizer

        self.sudachi = dictionary.Dictionary(dict="core").create()
        self.mode = tokenizer.Tokenizer.SplitMode.C

        import spacy

        self.en = spacy.load("en_core_web_sm", exclude=["ner", "parser"])
        self.es = spacy.load("es_core_news_sm", exclude=["ner", "parser"])

    def ja_tokens(self, text: str) -> list[Any]:
        return list(self.sudachi.tokenize(text, self.mode))

    def ja_dictionary_form(self, text: str) -> str:
        tokens = self.ja_tokens(text)
        if not tokens:
            return ""
        form = tokens[0].dictionary_form()
        return JA_LEMMA_ALIASES.get(form, form)

    def ja_roots(self, text: str) -> set[str]:
        """
        Every dictionary form the answer could be reduced to.

        A bare masu-stem (走り) tokenises as a noun on its own, so the stem is retried with ます and
        た attached, which is enough for Sudachi to see the verb behind it.
        """
        roots: set[str] = set()
        for probe in (text, f"{text}ます", f"{text}た"):
            form = self.ja_dictionary_form(probe)
            if form:
                roots.add(form)
        return roots

    def lemma(self, lang: str, word: str) -> tuple[str, str, bool]:
        """Returns (lemma, pos, resolved). `resolved` is False when spaCy returned the word itself,
        which out of context means it had nothing to say rather than that the word is a lemma."""
        nlp = self.en if lang == "en" else self.es
        doc = nlp(word)
        if not len(doc):
            return "", "", False
        token = doc[0]
        lemma = token.lemma_.lower()
        return lemma, token.pos_, lemma != token.text.lower()


def gate_morphology(rows: Iterable[dict[str, Any]], rejects: Rejects, morph: Morphology) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for row in rows:
        family = BY_KEY[row["divergence_family"]]
        surface = surface_of(row)
        head = head_answer(row)

        if row["world_slug"] == "ja" and family.prompt_kind == "glyph":
            target = JA_LEMMA_ALIASES.get(surface, surface)
            derived = self_or_alias(morph.ja_dictionary_form(target))
            answer_roots = {self_or_alias(root) for root in morph.ja_roots(head)}
            if family.key != "rendaku-blocked":
                if not answer_roots:
                    rejects.drop(row, "D", "d1_answer_does_not_tokenise", head)
                    continue
                if derived not in answer_roots:
                    rejects.drop(row, "D", "d2_answer_is_not_a_form_of_the_target",
                                 f"{head} -> {sorted(answer_roots)} vs {surface} -> {derived}")
                    continue

            if family.key == "naadj-crossover":
                tokens = morph.ja_tokens(head)
                pos_head = tokens[0].part_of_speech()[0] if tokens else ""
                if pos_head not in {"形状詞", "名詞"}:
                    rejects.drop(row, "D", "d3_target_is_not_a_na_adjective", f"{surface} tagged {pos_head}")
                    continue
                # The whole family is the copula against i-adjective inflection, so the answer has
                # to actually run through the copula (だ) or the adverbial に.
                inflections = [t.part_of_speech()[4] for t in tokens]
                copula = any(str(i).startswith("助動詞-ダ") for i in inflections) or head.endswith("に")
                if not copula:
                    rejects.drop(row, "D", "d4_answer_does_not_use_the_copula", head)
                    continue
                lure_tokens = morph.ja_tokens(row["lure"])
                if any(t.part_of_speech()[4].startswith("助動詞-ダ") for t in lure_tokens):
                    rejects.drop(row, "D", "d5_lure_also_uses_the_copula", row["lure"])
                    continue

            if family.key == "godan-lookalike":
                tokens = morph.ja_tokens(surface)
                inflection = tokens[0].part_of_speech()[4] if tokens else ""
                if not str(inflection).startswith("五段"):
                    rejects.drop(row, "D", "d6_target_is_not_godan", f"{surface} inflects {inflection}")
                    continue
                if not (surface.endswith("いる") or surface.endswith("える") or
                        (len(surface) >= 2 and surface[-1] == "る")):
                    rejects.drop(row, "D", "d7_target_does_not_look_ichidan", surface)
                    continue

            if family.key == "te-voicing":
                tokens = morph.ja_tokens(surface)
                inflection = tokens[0].part_of_speech()[4] if tokens else ""
                if not str(inflection).startswith("五段"):
                    rejects.drop(row, "D", "d8_te_voicing_target_is_not_godan", f"{surface} inflects {inflection}")
                    continue

        elif row["world_slug"] in {"en", "es"} and family.prompt_kind == "glyph":
            target_lemma, _, _ = morph.lemma(row["world_slug"], surface)
            answer_lemma, _, resolved = morph.lemma(row["world_slug"], head)
            if resolved and target_lemma and answer_lemma != target_lemma and answer_lemma != surface.lower():
                rejects.drop(row, "D", "d9_answer_lemmatises_to_a_different_word",
                             f"{head} -> {answer_lemma} vs {surface} -> {target_lemma}")
                continue

        kept.append(row)
    return kept


def self_or_alias(form: str) -> str:
    return JA_LEMMA_ALIASES.get(form, form)


# ── E: level ────────────────────────────────────────────────────────────────────────────────

JA_FUNCTION_POS = {"助詞", "助動詞", "補助記号", "記号", "接続詞", "感動詞", "代名詞", "接頭辞", "接尾辞", "空白"}


class LevelChecker:
    def __init__(self, morph: Morphology, use_classifier: bool) -> None:
        self.morph = morph
        lexicon = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
        self.ja = {level: set(words) for level, words in lexicon["ja"].items()}
        self.en = {level: set(words) for level, words in lexicon["en"].items()}
        self.es = {level: set(words) for level, words in lexicon["es"].items()}
        self._rank_cache: dict[str, dict[str, int]] = {}
        self.classifier = None
        if use_classifier:
            try:
                import torch
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                name = "bennexx/cl-tohoku-bert-base-japanese-v3-jlpt-classifier"
                self.tokenizer = AutoTokenizer.from_pretrained(name)
                self.classifier = AutoModelForSequenceClassification.from_pretrained(name).eval()
                self.torch = torch
                self.classifier_name = name
            except Exception as exc:  # noqa: BLE001
                print(f"  JLPT classifier unavailable, falling back to list membership: "
                      f"{type(exc).__name__}: {str(exc)[:120]}", file=sys.stderr)
                self.classifier = None

    def jlpt_of(self, text: str) -> str | None:
        if self.classifier is None:
            return None
        with self.torch.no_grad():
            logits = self.classifier(**self.tokenizer(text, return_tensors="pt", truncation=True, max_length=64)).logits
        return self.classifier.config.id2label[int(logits.argmax(-1))]

    def ja_unknown_tokens(self, text: str) -> list[str]:
        allowed = self.ja.get("N5", set()) | self.ja.get("N4", set())
        unknown: list[str] = []
        for token in self.morph.ja_tokens(text):
            pos = token.part_of_speech()
            if pos[0] in JA_FUNCTION_POS or pos[1] in {"数詞", "固有名詞"}:
                continue
            forms = {token.surface(), token.dictionary_form(), token.normalized_form(), token.reading_form()}
            if not (forms & allowed):
                unknown.append(token.dictionary_form())
        return unknown

    def _ranks(self, lang: str) -> dict[str, int]:
        cached = self._rank_cache.get(lang)
        if cached is not None:
            return cached
        inventory = self.en if lang == "en" else self.es
        known: dict[str, int] = {}
        for rank, level in enumerate(CEFR_ORDER):
            for word in inventory.get(level, set()):
                if word not in known:
                    known[word] = rank
        self._rank_cache[lang] = known
        return known

    def cefr_above(self, lang: str, text: str, target: str) -> list[str]:
        limit = CEFR_ORDER.index(target)
        known = self._ranks(lang)
        nlp = self.morph.en if lang == "en" else self.morph.es
        offenders: list[str] = []
        for token in nlp(text):
            if token.is_punct or token.is_space or token.like_num or token.is_stop:
                continue
            lemma = token.lemma_.lower()
            rank = known.get(lemma)
            if rank is None:
                continue  # not in any list: proper nouns and the like, left alone
            if rank > limit:
                offenders.append(f"{lemma}@{CEFR_ORDER[rank]}")
        return offenders


def gate_level(rows: Iterable[dict[str, Any]], rejects: Rejects, checker: LevelChecker,
               ja_unknown_budget: int, cefr_slack: int, jlpt_slack: int) -> list[dict[str, Any]]:
    kept: list[dict[str, Any]] = []
    for row in rows:
        surface = surface_of(row)
        world = row["world_slug"]
        target = row["target_level"]
        if world == "ja":
            unknown = checker.ja_unknown_tokens(surface)
            if len(unknown) > ja_unknown_budget:
                rejects.drop(row, "E", "e1_japanese_vocabulary_outside_n5_n4", ",".join(unknown))
                continue
            # The classifier was trained on sentences and these surfaces are often one word, so it
            # is read with one level of slack: N4 on an N5 item is noise, N3 is a signal.
            verdict = checker.jlpt_of(surface) if HAS_JA.search(surface) else None
            if verdict is not None:
                row["jlpt_classifier"] = verdict
                if JLPT_ORDER.index(verdict) > JLPT_ORDER.index(target) + jlpt_slack:
                    rejects.drop(row, "E", "e2_jlpt_classifier_above_target", f"{verdict} > {target}")
                    continue
        else:
            offenders = checker.cefr_above(world, surface, target)
            if len(offenders) > cefr_slack:
                rejects.drop(row, "E", f"e3_{world}_vocabulary_above_target_level", ",".join(offenders[:6]))
                continue
        kept.append(row)
    return kept


# ── F: duplicates ───────────────────────────────────────────────────────────────────────────


def shingles(text: str) -> set[str]:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if HAS_JA.search(cleaned):
        return {cleaned[i:i + 3] for i in range(max(1, len(cleaned) - 2))}
    words = cleaned.lower().split()
    return {" ".join(words[i:i + 2]) for i in range(max(1, len(words) - 1))}


def gate_duplicates(rows: list[dict[str, Any]], rejects: Rejects, threshold: float) -> list[dict[str, Any]]:
    seen_exact: set[tuple[str, str]] = set()
    by_family: dict[str, list[tuple[set[str], str]]] = defaultdict(list)
    kept: list[dict[str, Any]] = []
    for row in rows:
        key = (normalize(surface_of(row)), head_answer(row))
        if key in seen_exact:
            rejects.drop(row, "F", "f1_exact_duplicate", key[0])
            continue
        seen_exact.add(key)

        family = row["divergence_family"]
        current = shingles(f"{surface_of(row)} {head_answer(row)}")
        clash = ""
        for other, other_id in by_family[family]:
            union = current | other
            if not union:
                continue
            if len(current & other) / len(union) >= threshold:
                clash = other_id
                break
        if clash:
            rejects.drop(row, "F", "f2_near_duplicate", clash)
            continue
        by_family[family].append((current, row["external_id"]))
        kept.append(row)
    return kept


# ── G: adjudication ─────────────────────────────────────────────────────────────────────────

ADJUDICATION_SYSTEM = """You check language exercise items for defects. You are shown the item and \
its answer key. Judge only whether the item is well formed.

Answer four questions:
1. is_answer_correct: is the stated answer actually correct for this prompt.
2. second_defensible_answer: could a competent speaker defend a different answer for a free \
response item, or is more than one option defensible for a multiple choice item. Name it if so.
3. bad_distractor: for a multiple choice item, is any option other than the correct one also \
acceptable here. Name it if so.
4. level_ok: does every word in the prompt sit at or below the stated level.

Be strict on question 3. An option that is merely less natural is fine. An option a teacher would \
have to mark correct is not.

Return your verdict through the tool. Return no prose."""

ADJUDICATION_TOOL = {
    "name": "verdict",
    "description": "Report defects in the item.",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_answer_correct": {"type": "boolean"},
            "second_defensible_answer": {"type": "string", "description": "The competing answer, or an empty string if there is none."},
            "bad_distractor": {"type": "string", "description": "The distractor that is also acceptable, or an empty string if there is none."},
            "level_ok": {"type": "boolean"},
            "reason": {"type": "string", "description": "One short sentence, only if something is wrong."},
        },
        "required": ["is_answer_correct", "second_defensible_answer", "bad_distractor", "level_ok"],
    },
}


def _is_retryable(exc: BaseException) -> bool:
    """
    Overload and timeouts are worth waiting out. A 4xx other than 429 is not.

    The Anthropic SDK sets `x-should-retry: false` on the ones that will never succeed, an expired
    key or an empty credit balance among them, and those have to fail loudly and immediately.
    """
    status = getattr(exc, "status_code", None)
    if status == 429 or (isinstance(status, int) and status >= 500):
        return True
    if isinstance(status, int) and 400 <= status < 500:
        return False
    # Connection level failures carry no status and are worth another attempt.
    return True


def adjudication_prompt(row: dict[str, Any]) -> str:
    prompt = row["prompt"]
    answer = row["answer"]
    lines = [
        f"Language world: {row['world_slug']}. Stated level: {row['target_level']}.",
        f"Task shown to the player: {prompt['task']}",
        f"Material: {surface_of(row)}",
    ]
    if prompt.get("options"):
        lines.append("Options: " + " | ".join(prompt["options"]))
        lines.append(f"Answer key: {answer.get('correct')}")
    else:
        lines.append(f"Answer key, canonical: {answer.get('primary')}")
        lines.append("Answer key, every accepted string: " + " | ".join(answer.get("accept") or []))
    lines.append(f"The item's own note on the rule: {answer.get('note')}")
    return "\n".join(lines)


def adjudicate(rows: list[dict[str, Any]], rejects: Rejects, concurrency: int,
               budget_seconds: float) -> tuple[list[dict[str, Any]], int]:
    """
    Returns the survivors and the number of items that could not be judged.

    Verdicts are cached in `out/adjudication.jsonl` and a rerun only calls for the items missing
    from it, so a run interrupted by rate limiting can be finished by running the stage again.

    An item whose adjudication never returns is kept, tagged `adjudicated: false`, and counted.
    A call that failed is not evidence of a defect, and dropping on it would silently delete good
    items whenever the API is busy.

    `budget_seconds` bounds the stage. Under heavy rate limiting a single verdict can cost minutes
    of backoff, so past the budget the remaining items are left unjudged rather than allowed to
    hold up the whole pipeline. Rerunning the stage picks them up from the cache side.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=load_env("ANTHROPIC_API_KEY"), max_retries=6, timeout=120.0)
    verdicts: dict[str, dict[str, Any]] = {}
    if ADJUDICATION_PATH.exists():
        for cached in read_jsonl(ADJUDICATION_PATH):
            external_id = cached.pop("external_id", None)
            if external_id:
                verdicts[external_id] = cached
    wanted = [row for row in rows if row["external_id"] not in verdicts]
    print(f"  {len(verdicts)} verdicts cached, {len(wanted)} to fetch")

    deadline = time.time() + budget_seconds
    fatal: list[str] = []

    def one(row: dict[str, Any]) -> tuple[str, dict[str, Any] | None]:
        for attempt in range(6):
            if time.time() > deadline or fatal:
                return row["external_id"], None
            try:
                response = client.messages.create(
                    model=ADJUDICATION_MODEL,
                    max_tokens=500,
                    temperature=0,
                    system=ADJUDICATION_SYSTEM,
                    tools=[ADJUDICATION_TOOL],
                    tool_choice={"type": "tool", "name": "verdict"},
                    messages=[{"role": "user", "content": adjudication_prompt(row)}],
                )
                for block in response.content:
                    if block.type == "tool_use":
                        return row["external_id"], dict(block.input)
                return row["external_id"], None
            except Exception as exc:  # noqa: BLE001
                # A 400 is a statement about the request or the account, not about load. Retrying
                # it burns the whole budget and looks exactly like throttling from the outside,
                # which is how an exhausted credit balance once cost fifty minutes of silence.
                if not _is_retryable(exc):
                    if not fatal:
                        fatal.append(f"{type(exc).__name__}: {str(exc)[:300]}")
                    return row["external_id"], None
                time.sleep(min(30.0, 2 ** attempt) + random.random() * 2)
        return row["external_id"], None

    started = time.time()
    if wanted:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            futures = [pool.submit(one, row) for row in wanted]
            for done, future in enumerate(as_completed(futures), start=1):
                external_id, verdict = future.result()
                if verdict is not None:
                    verdicts[external_id] = verdict
                if done % 200 == 0 or done == len(futures):
                    print(f"  adjudicated {done}/{len(futures)} in {time.time() - started:.0f}s")

    write_jsonl(ADJUDICATION_PATH, [{"external_id": k, **v} for k, v in verdicts.items()])
    if fatal:
        print(f"  gate G stopped early, the API refused in a way retrying cannot fix:\n"
              f"    {fatal[0]}\n"
              f"  every unjudged item is quarantined in {PENDING_PATH.name} and none of them is "
              f"eligible for the p0 filter. Fix the account and rerun this stage.", file=sys.stderr)

    kept: list[dict[str, Any]] = []
    unjudged = 0
    for row in rows:
        verdict = verdicts.get(row["external_id"])
        if verdict is None:
            unjudged += 1
            row["adjudicated"] = False
            kept.append(row)
            continue
        row["adjudicated"] = True
        if not verdict.get("is_answer_correct", False):
            rejects.drop(row, "G", "g1_stated_answer_is_wrong", str(verdict.get("reason", "")))
            continue
        second = str(verdict.get("second_defensible_answer") or "").strip()
        if second and second.lower() not in {"", "none", "no", "n/a"}:
            rejects.drop(row, "G", "g2_second_defensible_answer", second)
            continue
        distractor = str(verdict.get("bad_distractor") or "").strip()
        if distractor and distractor.lower() not in {"", "none", "no", "n/a"}:
            rejects.drop(row, "G", "g3_distractor_is_also_correct", distractor)
            continue
        if not verdict.get("level_ok", True):
            rejects.drop(row, "G", "g4_above_the_stated_level", str(verdict.get("reason", "")))
            continue
        kept.append(row)
    return kept, unjudged


# ── driver ──────────────────────────────────────────────────────────────────────────────────


def finalise(row: dict[str, Any]) -> dict[str, Any]:
    """Fold the lure into `answer.note` so stage 4 sees the prediction it has to test."""
    row = dict(row)
    answer = dict(row["answer"])
    note = str(answer.get("note") or "").strip()
    lure = str(row.get("lure") or "").strip()
    if lure and lure not in note:
        note = f"{note} The predicted wrong answer is {lure}."
    answer["note"] = note
    row["answer"] = answer
    # `eligible_for_prior` is the field a p0 harness should read. It is written on every row of
    # both output files, so a consumer that filters on it is correct and a consumer that reads
    # only `candidates.jsonl` is correct too. See the header for why an unverified key is worse
    # than a merely low-quality item.
    row["eligible_for_prior"] = bool(row.get("adjudicated"))
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description="stage 3: linguistic filter")
    parser.add_argument("--input", default=str(RAW_PATH))
    parser.add_argument("--ja-unknown-budget", type=int, default=2,
                        help="content tokens allowed outside the N5/N4 lists")
    parser.add_argument("--cefr-slack", type=int, default=1,
                        help="lemmas allowed above the target CEFR level")
    parser.add_argument("--jlpt-slack", type=int, default=1,
                        help="levels of headroom given to the JLPT sentence classifier")
    parser.add_argument("--near-duplicate-threshold", type=float, default=0.8)
    parser.add_argument("--no-classifier", action="store_true")
    parser.add_argument("--no-adjudication", action="store_true")
    parser.add_argument("--adjudication-budget-seconds", type=float, default=900.0,
                        help="wall clock ceiling on gate G; past it the rest are kept unjudged")
    parser.add_argument("--concurrency", type=int, default=12)
    args = parser.parse_args()

    ensure_out()
    rows = list(read_jsonl(Path(args.input)))
    rejects = Rejects()
    funnel: list[dict[str, Any]] = [{"stage": "generated", "kept": len(rows)}]
    print(f"stage 3: {len(rows)} raw candidates")

    rows = gate_shape(rows, rejects)
    funnel.append({"stage": "A shape", "kept": len(rows)})
    print(f"  A shape           -> {len(rows)}")

    rows = gate_answer_key(rows, rejects)
    funnel.append({"stage": "B answer key", "kept": len(rows)})
    print(f"  B answer key      -> {len(rows)}")

    rows = gate_well_formed(rows, rejects)
    funnel.append({"stage": "C well formed", "kept": len(rows)})
    print(f"  C well formed     -> {len(rows)}")

    morph = Morphology()
    rows = gate_morphology(rows, rejects, morph)
    funnel.append({"stage": "D morphology", "kept": len(rows)})
    print(f"  D morphology      -> {len(rows)}")

    checker = LevelChecker(morph, use_classifier=not args.no_classifier)
    rows = gate_level(rows, rejects, checker, args.ja_unknown_budget, args.cefr_slack, args.jlpt_slack)
    funnel.append({"stage": "E level", "kept": len(rows), "classifier": checker.classifier is not None})
    print(f"  E level           -> {len(rows)}")

    rows = gate_duplicates(rows, rejects, args.near_duplicate_threshold)
    funnel.append({"stage": "F duplicates", "kept": len(rows)})
    print(f"  F duplicates      -> {len(rows)}")

    unjudged = 0
    if not args.no_adjudication:
        rows, unjudged = adjudicate(rows, rejects, args.concurrency, args.adjudication_budget_seconds)
        funnel.append({"stage": "G adjudication", "kept": len(rows), "unjudged_kept": unjudged})
        print(f"  G adjudication    -> {len(rows)} ({unjudged} kept unjudged)")

    # An item that gate G never judged is quarantined rather than shipped. The p0 filter keeps
    # items the avatar answers WRONG, so an item whose key is itself wrong scores p0 = 0.0 and
    # sorts to the top of the eligible list. A bad key is not merely noise on that surface, it is
    # selected for. Anything unverified therefore leaves through a different file.
    survivors = [finalise(row) for row in rows]
    eligible = [row for row in survivors if row["eligible_for_prior"]]
    pending = [row for row in survivors if not row["eligible_for_prior"]]

    written = write_jsonl(CANDIDATES_PATH, eligible)
    write_jsonl(PENDING_PATH, pending)
    write_jsonl(REJECTED_PATH, rejects.rows)

    by_family = Counter(row["divergence_family"] for row in eligible)
    by_world = Counter(row["world_slug"] for row in eligible)
    by_level = Counter(row["target_level"] for row in eligible)
    FUNNEL_PATH.write_text(json.dumps({
        "funnel": funnel,
        "eligible_for_prior": len(eligible),
        "quarantined_pending_adjudication": len(pending),
        "drop_reasons": dict(rejects.counts.most_common()),
        "survivors_by_family": dict(by_family),
        "survivors_by_world": dict(by_world),
        "survivors_by_level": dict(by_level),
        "settings": vars(args),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\neligible for the p0 filter: {written} -> {CANDIDATES_PATH}")
    if pending:
        print(f"quarantined, adjudication never returned: {len(pending)} -> {PENDING_PATH}")
        print("  rerun this stage to finish them; verdicts already fetched are cached")
    print("drop reasons, most frequent first:")
    for reason, count in rejects.counts.most_common():
        print(f"  {count:6d}  {reason}")


if __name__ == "__main__":
    main()
