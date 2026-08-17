"""
stage 1: seed from real graded data.

Pulls level-labelled vocabulary and sentences off the Hugging Face Hub and writes two files:

  out/seeds.jsonl   one row per seed word or sentence, carrying its graded level and the dataset
                    it came from, which becomes `source_dataset` on every candidate built from it
  out/lexicon.json  per language, the set of surface forms and lemmas attested at each level.
                    Stage 3 uses this as the vocabulary gate.

Every dataset below was loaded and counted on this machine. Anything that failed to load is
recorded in out/lexicon.json under `datasets` with the reason, so the report can be written from
the run rather than from memory.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from typing import Any, Iterator

from datasets import load_dataset

from common import LEXICON_PATH, SEEDS_PATH, digest, ensure_out, write_jsonl

JA_LEVELS = ("N5", "N4")
CEFR_LEVELS = ("A1", "A2", "B1")
CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

KANA = re.compile(r"^[぀-ヿー]+$")
HAS_JA = re.compile(r"[぀-ヿ一-鿿]")
LATIN_WORD = re.compile(r"^[a-zA-ZÀ-ÿ'\-]+$")

REPORT: dict[str, dict[str, Any]] = {}


def note(name: str, status: str, **extra: Any) -> None:
    REPORT[name] = {"status": status, **extra}


def _load(name: str, **kwargs: Any):
    """load_dataset with the outcome recorded either way."""
    try:
        ds = load_dataset(name, **kwargs)
        return ds
    except Exception as exc:  # noqa: BLE001 - the reason is the deliverable
        note(name + (f" [{kwargs.get('data_files')}]" if kwargs.get("data_files") else ""), "failed",
             error=f"{type(exc).__name__}: {str(exc)[:180]}")
        return None


# ── Japanese ────────────────────────────────────────────────────────────────────────────────


def japanese_seeds() -> Iterator[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()

    def emit(surface: str, reading: str, gloss: str, level: str, pos: str, source: str, kind: str = "vocab"):
        surface = (surface or "").strip()
        if not surface or not HAS_JA.search(surface):
            return
        key = (surface, kind)
        if key in seen:
            return
        seen.add(key)
        yield_row = {
            "seed_id": f"ja-{digest(source, surface, kind)}",
            "lang": "ja",
            "kind": kind,
            "surface": surface,
            "reading": (reading or "").strip(),
            "gloss": (gloss or "").strip()[:120],
            "level": level,
            "pos": (pos or "").strip()[:60],
            "source_dataset": source,
        }
        return yield_row

    # 1. Highgroundbkk/anki-words: word / reading / meaning / jlpt
    name = "Highgroundbkk/anki-words"
    ds = _load(name)
    if ds is not None:
        rows = ds["train"]
        kept = 0
        for row in rows:
            level = (row.get("jlpt") or "").upper()
            if level not in JA_LEVELS:
                continue
            out = emit(row["word"], row.get("reading", ""), row.get("meaning", ""), level, "", name)
            if out:
                kept += 1
                yield out
        note(name, "loaded", rows=len(rows), seeds=kept)

    # 2. xqt/jlpt_n5_vocabulary_tagged: two CSVs joined on word_id. The default loader tries to
    #    concatenate every csv in the repo into one schema and fails, so each file is loaded on
    #    its own and joined here.
    name = "xqt/jlpt_n5_vocabulary_tagged"
    words = _load(name, data_files="raw_words.csv", split="train")
    meta = _load(name, data_files="raw_tagged_meta.csv", split="train")
    if words is not None and meta is not None:
        by_id = {m["word_id"]: m for m in meta}
        kept = 0
        for row in words:
            m = by_id.get(row["word_id"], {})
            level_digit = str(m.get("jlpt_level") or "").strip()
            level = {"5": "N5", "4": "N4"}.get(level_digit)
            if level is None:
                continue
            out = emit(row["kanji"], m.get("furigana", ""), "", level, m.get("ai_tags", ""), name)
            if out:
                kept += 1
                yield out
        note(name, "loaded", rows=len(words), seeds=kept,
             note="default load_dataset raises DatasetGenerationCastError; loaded per-file and joined on word_id")

    # 3. jpercommunity/JLPT-wordlist: the substitute for open-anki-jlpt-decks, which is a GitHub
    #    project rather than a Hub dataset. Same Anki deck lineage, one CSV per level.
    name = "jpercommunity/JLPT-wordlist"
    for level, path in (("N5", "sources/n5.csv"), ("N4", "sources/n4.csv")):
        split = _load(name, data_files=path, split="train")
        if split is None:
            continue
        kept = 0
        for row in split:
            out = emit(row.get("expression", ""), row.get("reading", ""), row.get("meaning", ""),
                       level, row.get("tags", ""), name)
            if out:
                kept += 1
                yield out
        note(f"{name}:{path}", "loaded", rows=len(split), seeds=kept)

    # 4. xqt/synthetic_jlpt_n5_kanji_questions: N5 sentences around a target kanji.
    name = "xqt/synthetic_jlpt_n5_kanji_questions"
    ds = _load(name)
    if ds is not None:
        rows = ds["train"]
        kept = 0
        for row in rows:
            out = emit(row["kanji"], row.get("option_1", ""), row.get("sentence", ""), "N5", "", name,
                       kind="sentence")
            if out:
                kept += 1
                yield out
        note(name, "loaded", rows=len(rows), seeds=kept)

    # 5. Nihongo DoJo beginner: kanji readings and short tasks graded by school year.
    name = "akira-sasaki/nihongo-dojo-beginner-10k"
    ds = _load(name)
    if ds is not None:
        rows = ds["train"]
        kept = 0
        for row in rows:
            if row.get("type") != "kanji_reading":
                continue
            grade = row.get("grade")
            try:
                if grade is not None and float(grade) > 3:
                    continue
            except (TypeError, ValueError):
                pass
            target = re.search(r"「(.+?)」", row.get("problem", "") or "")
            if not target:
                continue
            out = emit(target.group(1), row.get("solution", ""), "", "N5", "kanji_reading", name)
            if out:
                kept += 1
                yield out
        note(name, "loaded", rows=len(rows), seeds=kept, note="filtered to type=kanji_reading, school grade <= 3")


# ── English ─────────────────────────────────────────────────────────────────────────────────


def english_seeds() -> Iterator[dict[str, Any]]:
    seen: set[str] = set()

    # 1. Alex123321/english_cefr_dataset: the `english_cefr_dataset` named in the brief.
    name = "Alex123321/english_cefr_dataset"
    ds = _load(name)
    if ds is not None:
        rows = ds["train"]
        kept = 0
        for row in rows:
            word = (row.get("ud_word") or "").strip().lower()
            level = (row.get("ud_word_level") or "").strip().upper()
            if level not in CEFR_LEVELS or not LATIN_WORD.match(word) or word in seen:
                continue
            seen.add(word)
            kept += 1
            yield {
                "seed_id": f"en-{digest(name, word)}",
                "lang": "en",
                "kind": "vocab",
                "surface": word,
                "reading": "",
                "gloss": "",
                "level": level,
                "pos": (row.get("ud_word_pos") or "").strip(),
                "source_dataset": name,
            }
        note(name, "loaded", rows=len(rows), seeds=kept)

    # 2. UniversalCEFR/cefr_sp_en: sentence-level CEFR, the English arm of UniversalCEFR.
    name = "UniversalCEFR/cefr_sp_en"
    ds = _load(name)
    if ds is not None:
        rows = ds["train"]
        kept = 0
        for row in rows:
            level = (row.get("cefr_level") or "").strip().upper()
            text = (row.get("text") or "").strip()
            if level not in CEFR_LEVELS or not (12 <= len(text) <= 110):
                continue
            kept += 1
            if kept > 1200:
                break
            yield {
                "seed_id": f"en-{digest(name, text)}",
                "lang": "en",
                "kind": "sentence",
                "surface": text,
                "reading": "",
                "gloss": "",
                "level": level,
                "pos": "",
                "source_dataset": name,
            }
        note(name, "loaded", rows=len(rows), seeds=min(kept, 1200), note="capped at 1200 sentence seeds")


# ── Spanish ─────────────────────────────────────────────────────────────────────────────────

ES_SOURCES = [
    ("UniversalCEFR/hablacultura_es", 713),
    ("UniversalCEFR/caes_es", 31149),
    ("UniversalCEFR/kwiqiz_es", 206),
]


def spanish_texts(limit_per_level: int = 2500) -> dict[str, list[str]]:
    by_level: dict[str, list[str]] = defaultdict(list)
    for name, _ in ES_SOURCES:
        ds = _load(name)
        if ds is None:
            continue
        rows = ds["train"]
        kept = 0
        for row in rows:
            level = (row.get("cefr_level") or "").strip().upper()
            text = (row.get("text") or "").strip()
            if level not in CEFR_LEVELS or len(text) < 20:
                continue
            if len(by_level[level]) >= limit_per_level:
                continue
            by_level[level].append(text[:1500])
            kept += 1
        note(name, "loaded", rows=len(rows), seeds=kept)
    return by_level


def spanish_seeds(by_level: dict[str, list[str]]) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    """
    No CEFR-graded Spanish word list exists on the Hub, so the level inventory is built by
    attestation: a lemma counts as A1 if it appears in A1 text, A2 if it first appears in A2 text,
    and so on. spaCy does the lemmatising.
    """
    import spacy

    nlp = spacy.load("es_core_news_sm", exclude=["ner", "parser"])
    first_level: dict[str, str] = {}
    freq: Counter[str] = Counter()
    pos_of: dict[str, str] = {}

    for level in CEFR_LEVELS:
        texts = by_level.get(level, [])
        for doc in nlp.pipe(texts, batch_size=64):
            for token in doc:
                if token.is_punct or token.is_space or token.like_num:
                    continue
                lemma = token.lemma_.lower().strip()
                if not lemma or not LATIN_WORD.match(lemma):
                    continue
                freq[lemma] += 1
                if lemma not in first_level:
                    first_level[lemma] = level
                    pos_of[lemma] = token.pos_

    inventory: dict[str, list[str]] = {level: [] for level in CEFR_LEVELS}
    for lemma, level in first_level.items():
        inventory[level].append(lemma)

    seeds: list[dict[str, Any]] = []
    for lemma, level in first_level.items():
        if freq[lemma] < 3 or len(lemma) < 3:
            continue
        if pos_of.get(lemma) not in {"VERB", "NOUN", "ADJ", "ADV"}:
            continue
        seeds.append({
            "seed_id": f"es-{digest('universalcefr-es', lemma)}",
            "lang": "es",
            "kind": "vocab",
            "surface": lemma,
            "reading": "",
            "gloss": "",
            "level": level,
            "pos": pos_of.get(lemma, ""),
            "source_dataset": "UniversalCEFR (hablacultura_es + caes_es + kwiqiz_es)",
            "corpus_frequency": freq[lemma],
        })
    seeds.sort(key=lambda row: -row["corpus_frequency"])
    return seeds, inventory


# ── English lexicon ─────────────────────────────────────────────────────────────────────────


def english_lexicon() -> dict[str, list[str]]:
    inventory: dict[str, set[str]] = {level: set() for level in CEFR_ORDER}

    name = "Alex123321/english_cefr_dataset"
    ds = _load(name)
    if ds is not None:
        for row in ds["train"]:
            word = (row.get("ud_word") or "").strip().lower()
            level = (row.get("ud_word_level") or "").strip().upper()
            if level in inventory and LATIN_WORD.match(word or ""):
                inventory[level].add(word)

    # CEFR-Annotated WordNet is sense-level: the same word appears at several levels depending on
    # which sense the rater saw. The easiest sense is what a learner meets first, so the minimum
    # level per word is what goes in the inventory.
    name = "star092304/CEFR-Annotated-WordNet"
    ds = _load(name)
    if ds is not None:
        pattern = re.compile(r"the sense of (.+?) in the following text", re.I)
        best: dict[str, int] = {}
        rows = ds["train"]
        for row in rows:
            messages = row.get("messages")
            if isinstance(messages, str):
                try:
                    messages = json.loads(messages.replace("'", '"'))
                except Exception:  # noqa: BLE001
                    continue
            if not isinstance(messages, list) or len(messages) < 3:
                continue
            user = str(messages[-2].get("content", ""))
            label = str(messages[-1].get("content", "")).strip().upper()
            match = pattern.search(user)
            if not match or label not in CEFR_ORDER:
                continue
            word = match.group(1).strip().lower()
            if not LATIN_WORD.match(word):
                continue
            rank = CEFR_ORDER.index(label)
            if word not in best or rank < best[word]:
                best[word] = rank
        for word, rank in best.items():
            inventory[CEFR_ORDER[rank]].add(word)
        note(name, "loaded", rows=len(rows), seeds=len(best),
             note="parsed out of the rater chat template; minimum level per word kept")

    return {level: sorted(words) for level, words in inventory.items()}


def japanese_lexicon(seeds: list[dict[str, Any]]) -> dict[str, list[str]]:
    inventory: dict[str, set[str]] = {level: set() for level in JA_LEVELS}
    for seed in seeds:
        if seed["lang"] != "ja":
            continue
        level = seed["level"]
        if level not in inventory:
            continue
        inventory[level].add(seed["surface"])
        if seed["reading"] and KANA.match(seed["reading"]):
            inventory[level].add(seed["reading"])
    return {level: sorted(words) for level, words in inventory.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="stage 1: pull graded seeds off the Hub")
    parser.add_argument("--es-texts-per-level", type=int, default=2500)
    args = parser.parse_args()

    ensure_out()

    seeds: list[dict[str, Any]] = [row for row in japanese_seeds() if row]
    seeds += [row for row in english_seeds() if row]

    es_texts = spanish_texts(args.es_texts_per_level)
    es_seeds, es_inventory = spanish_seeds(es_texts)
    seeds += es_seeds

    written = write_jsonl(SEEDS_PATH, seeds)

    lexicon = {
        "datasets": REPORT,
        "ja": japanese_lexicon(seeds),
        "en": english_lexicon(),
        "es": {level: sorted(words) for level, words in es_inventory.items()},
    }
    LEXICON_PATH.write_text(json.dumps(lexicon, ensure_ascii=False), encoding="utf-8")

    counts = Counter((row["lang"], row["level"]) for row in seeds)
    print(f"seeds written: {written} -> {SEEDS_PATH}")
    for key in sorted(counts):
        print(f"  {key[0]} {key[1]}: {counts[key]}")
    print("lexicon sizes:")
    for lang in ("ja", "en", "es"):
        for level, words in lexicon[lang].items():
            if words:
                print(f"  {lang} {level}: {len(words)}")
    print("datasets:")
    for name, info in REPORT.items():
        print(f"  {info['status']:8s} {name} {info.get('rows', '')} -> {info.get('seeds', '')}"
              f"{' | ' + info['error'] if 'error' in info else ''}")


if __name__ == "__main__":
    main()
