"""
stage 2: adversarial generation with Claude Haiku.

The model id matches `src/lib/teaching/attempt.ts`: `claude-haiku-4-5`, the same model that will
later attempt these items. Generating and attempting with one model is deliberate. The generator
is asked for the form the attempting model would reach for first, which is the only thing anyone
can honestly ask a model to introspect about, and stage 4 then measures whether the guess was
right.

A naive "write ten questions about this word" prompt reproduces the bank that already exists. So
every call carries one family from `families.py`, which names a specific divergence, a worked
exemplar, and a demand for a `lure`: the wrong answer the family predicts. An item with no
credible lure is thrown away in stage 3.

Seeds come from `out/seeds.jsonl` and travel with the item as `source_dataset`, so a candidate can
always be traced back to the graded list it was built from.

Output: out/raw_candidates.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import anthropic

from common import (
    LADDER_SLUG,
    RAW_PATH,
    SEEDS_PATH,
    ensure_out,
    external_id,
    load_env,
    read_jsonl,
    write_jsonl,
)
from families import ALL_FAMILIES, Family

MODEL = "claude-haiku-4-5"
GENERATION_TEMPERATURE = 1.0  # variety is the point here; the attempt runs at 0.2

SYSTEM = """You write single-answer language exercises for a game whose scoring depends on one \
property: the item must be one that a strong language model gets WRONG when it answers on \
instinct.

The game works like this. A human player writes an explanation of a concept. A language model \
then attempts the item using only that explanation. The player scores when the model gets it \
right. If the model already knows the answer, the item measures nothing, and the item is thrown \
away. Measurement of a real bank found that a model answered 88.5 percent of items correctly from \
an explanation containing no information at all.

So your target is narrow. Every item you write must sit at a point where the most fluent, most \
frequent, most rule-consistent answer is the WRONG one, and the key is the other answer. You will \
be given one divergence family that names such a point. Stay inside it.

Hard requirements for every item:
1. Exactly one answer is defensible. If a second answer could be argued for, the item is broken.
2. The `lure` is the wrong answer you predict a model produces on instinct. It must be a real, \
well formed string that a competent speaker would recognise as the common error. It must never \
be correct, and it must never appear in `accept`.
3. The answer must not appear anywhere in the task text. No item may contain its own answer.
4. Stay inside the stated level. Every other word in the sentence must be vocabulary a learner at \
that level already has.
5. `note` states the actual rule in one or two sentences and names why the lure is wrong. A later \
stage uses `note` to author a teaching explanation, so it has to be a rule and not a restatement \
of the answer.
6. `surface` is the bare material and its shape depends on the family. In a word family it is a \
single word or compound and never a sentence. In a sentence family it is one short sentence \
carrying a visible blank where the answer goes: `___` for English and Spanish, `＿＿` for Japanese. \
A sentence with the answer already in it is discarded.
7. `constraint_text` is the short shouted banner above the input, three words at most, upper case, \
and it must match what this item actually asks for.
8. Write plainly. No em-dashes anywhere in your output.

Return items through the tool. Return no prose."""

TOOL = {
    "name": "emit_items",
    "description": "Return the generated exercise items.",
    "input_schema": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "seed": {"type": "string", "description": "The seed word this item was built from, copied exactly, or the word you chose if none of the seeds fit."},
                        "subject": {"type": "string", "description": "A short ascii label for the item, lowercase words joined by hyphens, e.g. 'shizuka-past' or 'an-hour'."},
                        "level": {"type": "string", "description": "The level of this item, one of the levels named in the brief."},
                        "task": {"type": "string", "description": "The full task line shown to the player, instruction and material together."},
                        "surface": {"type": "string", "description": "The bare material: the word for a glyph item, the sentence with the blank for a brief item."},
                        "reading": {"type": "string", "description": "Japanese only: the kana reading of the surface word. Empty string otherwise."},
                        "instruction": {"type": "string", "description": "The short instruction line, without the material."},
                        "mode": {"type": "string", "enum": ["exact", "choice"]},
                        "primary": {"type": "string", "description": "exact mode only: the canonical answer. Empty string in choice mode."},
                        "accept": {"type": "array", "items": {"type": "string"}, "description": "exact mode only: every string that counts as correct, including primary. Matching is exact after NFC and trim, with no case folding, so spell out the case variants that should pass."},
                        "correct": {"type": "string", "description": "choice mode only: the correct option, copied exactly from options. Empty string in exact mode."},
                        "options": {"type": "array", "items": {"type": "string"}, "description": "choice mode only: the options, including the correct one and the lure. Every option other than the correct one must be clearly wrong."},
                        "constraint_text": {"type": "string", "description": "The short upper case banner above the input, three words at most, matching what this item asks for."},
                        "lure": {"type": "string", "description": "The wrong answer a model is predicted to give on instinct."},
                        "note": {"type": "string", "description": "The rule, in one or two sentences, naming why the lure is wrong."},
                        "rationale": {"type": "string", "description": "One short clause naming the divergence this item targets."},
                    },
                    "required": ["seed", "subject", "level", "task", "surface", "instruction", "mode", "lure", "note", "rationale"],
                },
            }
        },
        "required": ["items"],
    },
}


def build_user_message(family: Family, seeds: list[dict[str, Any]], count: int) -> str:
    seed_lines = []
    for seed in seeds:
        bits = [seed["surface"]]
        if seed.get("reading"):
            bits.append(f"reading {seed['reading']}")
        if seed.get("gloss"):
            bits.append(f"means {seed['gloss']}")
        if seed.get("pos"):
            bits.append(f"tagged {seed['pos']}")
        bits.append(f"level {seed['level']}")
        seed_lines.append("  - " + ", ".join(bits))

    role = (
        "Each seed is the subject of one item. Use every seed that fits the family."
        if family.seed_role == "target"
        else
        "The seeds are graded vocabulary for the sentence around the item. Build the item on the "
        "family's own target list and use the seeds for the surrounding words so the level holds."
    )

    shape = ("a single word or compound in `surface`, with no sentence around it"
             if family.prompt_kind == "glyph"
             else "one short sentence in `surface`, carrying the blank")
    return f"""DIVERGENCE FAMILY: {family.key}
World: {family.world}. Levels in scope: {", ".join(family.levels)}.
The divergence: {family.divergence}.
This family is a {family.prompt_kind} family, so every item carries {shape}.

{family.guidance}

Answer mode for this family: {family.mode}.{f" Every item needs exactly {family.option_count} options." if family.mode == "choice" else ""}

GRADED SEED WORDS, drawn from real level-labelled datasets:
{chr(10).join(seed_lines)}

{role}

WORKED EXAMPLE of the shape and the standard:
{json.dumps(family.exemplar, ensure_ascii=False, indent=2)}

Write {count} items. Make them different from each other: different target words, different forms
asked for, different sentence frames. Do not repeat the worked example."""


class Budget:
    """Cheap shared counters so a long run reports as it goes."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.calls = 0
        self.failures = 0
        self.items = 0
        self.input_tokens = 0
        self.output_tokens = 0

    def record(self, items: int, usage: Any) -> None:
        with self.lock:
            self.calls += 1
            self.items += items
            if usage is not None:
                self.input_tokens += usage.input_tokens
                self.output_tokens += usage.output_tokens

    def fail(self) -> None:
        with self.lock:
            self.calls += 1
            self.failures += 1


def call_once(client: anthropic.Anthropic, family: Family, seeds: list[dict[str, Any]],
              count: int, attempt: int) -> tuple[list[dict[str, Any]], Any]:
    response = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        temperature=GENERATION_TEMPERATURE,
        system=SYSTEM,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "emit_items"},
        messages=[{"role": "user", "content": build_user_message(family, seeds, count)}],
    )
    for block in response.content:
        if block.type == "tool_use" and block.name == "emit_items":
            return list(block.input.get("items") or []), response.usage
    return [], response.usage


def run_batch(client: anthropic.Anthropic, family: Family, seeds: list[dict[str, Any]],
              count: int, budget: Budget) -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            items, usage = call_once(client, family, seeds, count, attempt)
            budget.record(len(items), usage)
            return [shape(family, raw, seeds) for raw in items if isinstance(raw, dict)]
        except (anthropic.RateLimitError, anthropic.APIStatusError, anthropic.APIConnectionError) as exc:
            last_error = exc
            time.sleep(2 ** attempt + random.random())
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            break
    budget.fail()
    print(f"  batch failed [{family.key}]: {type(last_error).__name__}: {str(last_error)[:120]}",
          file=sys.stderr)
    return []


def shape(family: Family, raw: dict[str, Any], seeds: list[dict[str, Any]]) -> dict[str, Any]:
    """Assemble the jsonb shapes `public.items` uses. The model never writes them directly."""
    task = str(raw.get("task") or "").strip()
    surface = str(raw.get("surface") or "").strip()
    instruction = str(raw.get("instruction") or family.exemplar.get("instruction", "")).strip()
    mode = str(raw.get("mode") or family.mode).strip()
    level = str(raw.get("level") or family.levels[0]).strip().upper()
    if level not in family.levels:
        level = family.levels[0]

    seed_surface = str(raw.get("seed") or "").strip()
    matched = next((s for s in seeds if s["surface"] == seed_surface), None)
    if matched:
        source_dataset = matched["source_dataset"]
    else:
        # The family's own target list supplied the word. The graded seeds still set the level and
        # the surrounding vocabulary, so they are what the item is traceable to.
        pools = sorted({s["source_dataset"] for s in seeds})
        source_dataset = f"family:{family.key} over seeds from " + "; ".join(pools) if pools else f"family:{family.key}"

    prompt: dict[str, Any] = {
        "kind": family.prompt_kind,
        "task": task,
        "instruction": instruction,
        "input": {
            "label": family.input_label,
            "countUnit": None,
            "multiline": False,
            "countLimit": None,
        },
    }
    if family.prompt_kind == "glyph":
        prompt["glyph"] = surface
        prompt["reading"] = str(raw.get("reading") or "").strip() or None
        prompt["strokeOrderPath"] = None
    else:
        prompt["brief"] = surface

    note = str(raw.get("note") or "").strip()
    lure = str(raw.get("lure") or "").strip()

    if mode == "choice":
        options = [str(o).strip() for o in (raw.get("options") or []) if str(o).strip()]
        prompt["options"] = options
        correct = str(raw.get("correct") or "").strip()
        answer: dict[str, Any] = {"mode": "choice", "correct": correct, "note": note}
        answer_head = correct
    else:
        primary = str(raw.get("primary") or "").strip()
        accept = [str(a).strip() for a in (raw.get("accept") or []) if str(a).strip()]
        if primary and primary not in accept:
            accept = [primary, *accept]
        answer = {"mode": "exact", "primary": primary, "accept": accept, "note": note}
        answer_head = primary

    subject = str(raw.get("subject") or "").strip() or seed_surface
    return {
        "external_id": external_id(family.world, family.key, subject, task, answer_head),
        "world_slug": family.world,
        "ladder_slug": LADDER_SLUG,
        "kind": family.kind,
        "prompt": prompt,
        "answer": answer,
        "rubric_version": "forge@1",
        "constraint_text": (str(raw.get("constraint_text") or "").strip().upper()[:32]
                            or family.constraint_text),
        "time_limit_ms": family.time_limit_ms,
        "cold_start_beta": family.cold_start_beta,
        "source": "loxelingo-generated-v1",
        "license": "proprietary",
        "is_active": True,
        "target_level": level,
        "source_dataset": source_dataset,
        "generation_rationale": str(raw.get("rationale") or family.divergence).strip(),
        "divergence_family": family.key,
        "lure": lure,
        "seed_surface": seed_surface,
        "generation_model": MODEL,
    }


def pick_seeds(pool: list[dict[str, Any]], family: Family, rng: random.Random, n: int) -> list[dict[str, Any]]:
    eligible = [s for s in pool
                if s["lang"] == family.world
                and s["level"] in family.levels
                and s["kind"] == family.seed_pool]
    if not eligible:
        eligible = [s for s in pool if s["lang"] == family.world]
    if not eligible:
        return []
    return rng.sample(eligible, min(n, len(eligible)))


def main() -> None:
    parser = argparse.ArgumentParser(description="stage 2: generate candidates adversarially")
    parser.add_argument("--per-call", type=int, default=6, help="items requested per API call")
    parser.add_argument("--seeds-per-call", type=int, default=8)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--scale", type=float, default=1.0, help="multiplier on every family target")
    parser.add_argument("--only", default="", help="comma separated family keys")
    parser.add_argument("--seed", type=int, default=20260816)
    args = parser.parse_args()

    ensure_out()
    pool = list(read_jsonl(SEEDS_PATH))
    if not pool:
        raise SystemExit(f"no seeds at {SEEDS_PATH}; run stage1_seed.py first")

    wanted = {key.strip() for key in args.only.split(",") if key.strip()}
    families = [f for f in ALL_FAMILIES if not wanted or f.key in wanted]

    rng = random.Random(args.seed)
    jobs: list[tuple[Family, list[dict[str, Any]], int]] = []
    for family in families:
        target = max(1, round(family.target_count * args.scale))
        remaining = target
        while remaining > 0:
            count = min(args.per_call, remaining)
            jobs.append((family, pick_seeds(pool, family, rng, args.seeds_per_call), count))
            remaining -= count
    rng.shuffle(jobs)

    client = anthropic.Anthropic(api_key=load_env("ANTHROPIC_API_KEY"), max_retries=2)
    budget = Budget()
    started = time.time()
    rows: list[dict[str, Any]] = []

    print(f"stage 2: {len(jobs)} calls, {sum(j[2] for j in jobs)} items requested, model {MODEL}")
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool_exec:
        futures = [pool_exec.submit(run_batch, client, fam, seeds, count, budget)
                   for fam, seeds, count in jobs]
        for done, future in enumerate(as_completed(futures), start=1):
            rows.extend(future.result())
            if done % 25 == 0 or done == len(futures):
                elapsed = time.time() - started
                print(f"  {done}/{len(futures)} calls, {len(rows)} items, "
                      f"{budget.failures} failed calls, {elapsed:.0f}s")

    # Two calls can land on the same item. Keep the first, since the id is a content hash.
    unique: dict[str, dict[str, Any]] = {}
    for row in rows:
        unique.setdefault(row["external_id"], row)

    written = write_jsonl(RAW_PATH, unique.values())
    print(f"raw candidates written: {written} (from {len(rows)} returned, "
          f"{len(rows) - written} exact id duplicates) -> {RAW_PATH}")
    print(f"tokens: {budget.input_tokens} in, {budget.output_tokens} out over {budget.calls} calls")


if __name__ == "__main__":
    main()
