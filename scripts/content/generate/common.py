"""
common: paths, io and the small pieces every stage shares.

The pipeline is three stages that talk to each other through files in `out/`, so each stage can
be rerun on its own and the intermediate state stays inspectable. Nothing here touches the
database: the deliverable is `out/candidates.jsonl` and ingestion belongs to someone else.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable, Iterator

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
REPO = HERE.parent.parent.parent

SEEDS_PATH = OUT / "seeds.jsonl"
LEXICON_PATH = OUT / "lexicon.json"
RAW_PATH = OUT / "raw_candidates.jsonl"
CANDIDATES_PATH = OUT / "candidates.jsonl"
REJECTED_PATH = OUT / "rejected.jsonl"
FUNNEL_PATH = OUT / "funnel.json"
ADJUDICATION_PATH = OUT / "adjudication.jsonl"

LADDER_SLUG = "forge"

# `items.external_id_shape` in the database: lowercase ascii words joined by single hyphens.
EXTERNAL_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# The 40 seeded items all match `{world}-forge-{topic}-{name}`. Generated items carry `gen` in
# the third position, which no seeded id uses, so the two sets cannot collide by construction.
GENERATED_MARKER = "gen"


def ensure_out() -> None:
    OUT.mkdir(parents=True, exist_ok=True)


def load_env(name: str) -> str:
    """Read one variable from the process env, falling back to the repo's `.env.local`."""
    value = os.environ.get(name)
    if value:
        return value.strip()
    env_file = REPO / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, raw = line.partition("=")
            if key.strip() == name:
                return raw.strip().strip('"').strip("'")
    raise RuntimeError(f"{name} is not set and is not in {env_file}")


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")
            count += 1
    return count


def normalize(value: str) -> str:
    """The same normalisation `src/lib/teaching/answer-key.ts` applies: NFC and trim, nothing more."""
    return unicodedata.normalize("NFC", value).strip()


def slugify(value: str) -> str:
    """An ascii id segment. Non-ascii input (kanji, kana, accents) collapses to its hash."""
    folded = unicodedata.normalize("NFKD", value)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    ascii_only = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")
    if not ascii_only:
        return digest(value, length=8)
    return re.sub(r"-{2,}", "-", ascii_only)[:24].strip("-")


def digest(*parts: str, length: int = 8) -> str:
    payload = "".join(parts).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:length]


def external_id(world: str, family: str, subject: str, task: str, answer: str) -> str:
    """
    Deterministic and collision-proof against the seeded bank.

    `{world}-forge-gen-{family}-{subject}-{hash}`. The hash covers the task text and the answer,
    so regenerating the same item twice produces the same id and two items that differ in either
    field get different ids.
    """
    subject_slug = slugify(subject) or "item"
    parts = [world, LADDER_SLUG, GENERATED_MARKER, slugify(family), subject_slug, digest(task, answer, length=8)]
    candidate = "-".join(part for part in parts if part)
    candidate = re.sub(r"-{2,}", "-", candidate).strip("-")
    return candidate


def is_valid_external_id(value: str) -> bool:
    return bool(EXTERNAL_ID_RE.match(value))
