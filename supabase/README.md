# LoxeLingo — database

Postgres schema for LoxeLingo, as Supabase migrations. Six migrations, 29 tables, RLS on every one.

Sources of truth for this schema:

- `docs/research/03-learning-libs.md` §4 — the review-log schema. §4.7 is used essentially verbatim.
- `docs/superpowers/plans/2026-08-05-loxelingo-v1-plan.md` → "Data model" — the entity list.
- `docs/superpowers/specs/2026-08-05-*.md` — the product invariants (promotion-only leagues,
  mastery-capped companion, both judge orderings, 5% holdout).
- `docs/design/design-system.md` §2.5 (world hues) and §5.2 (altitude bands).

## Migration order

Order matters; each depends on the one before it.

| # | File | Contents |
|---|---|---|
| 1 | `*_static_config.sql` | `worlds`, `ladders`, `seasons`, `concepts`, `items`, `item_concepts` + seed data; `set_updated_at()`, `altitude_band()` |
| 2 | `*_identity_and_progression.sql` | `profiles` (+ the `auth.users` triggers), `user_worlds`, `user_ratings`, `user_concept_mastery` |
| 3 | `*_learning_engine.sql` | `card`, `fsrs_params`, `review_log`, `item_presentations`, `item_stats` |
| 4 | `*_match_loop.sql` | `matches`, `match_participants`, `submissions`, `judgments`, `judge_gold_labels` + the participation helpers |
| 5 | `*_progression_and_social.sql` | `daily_puzzles`, `daily_puzzle_items`, `daily_results`, `leagues`, `league_divisions`, `league_members`, `rivalries`, `companions`, `companion_actions` |
| 6 | `*_anonymous_user_cleanup.sql` | `delete_stale_anonymous_users()` and how to schedule it |

Migration 4 also back-fills the `item_presentations.match_id` foreign key, which could not exist in
migration 3 because `matches` did not exist yet.

## Applying them

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push            # applies every unapplied migration, in filename order
```

Local, if you have Docker:

```bash
npx supabase start              # boots Postgres and applies all migrations from empty
npx supabase db reset           # re-applies from scratch; the real "runs clean from empty" test
```

New migrations must be created with `npx supabase migration new <name>` — never by hand-writing a
filename, because the timestamp prefix is the ordering.

### What has been verified

**These migrations have been executed.** `npx supabase start` followed by `npx supabase db reset`
runs all six clean from an empty database on **PostgreSQL 17.6** (`supabase/postgres:17.6.1.156`,
Supabase CLI 2.111.0) — the real `auth` schema, the real `anon` / `authenticated` / `service_role`
roles, no shim of any kind. Result: 29 tables, RLS enabled on all 29, 11 functions, `db reset`
exits clean.

Only one thing was actually broken, and a reset is what found it:

> `ERROR: relation "public.submissions" does not exist (SQLSTATE 42P01)`
> `At statement: 12 ... create function public.has_own_submission(p_match_id uuid)`

`has_own_submission()` was declared next to `is_match_participant()`, above the `submissions`
table it reads. A `language sql` body is parsed *and its relations resolved* at `CREATE FUNCTION`
time, so it cannot forward-reference a table in the same migration. The function is now declared
immediately after `create table public.submissions`, with its `revoke`/`grant` pair moved with it.
No behaviour changed: same body, same `security definer`, same `search_path = ''`, same grants.
That was the only edit needed to make the schema run.

The four things this file previously listed as unverifiable, now confirmed against the catalog:

- **`generated always as (...) stored` — all accepted.** There are six, not four:
  `user_ratings.rating` and `.peak_rating` (`900 + 400 * theta`), `judgments.rubric_hash`
  (`md5(rubric_text)`), `judgments.position_disagreement` (`is distinct from`),
  `match_participants.rating_delta`, `rivalries.matches_played` (`wins_a + wins_b + draws`).
  Every expression is immutable enough for Postgres to store it.
- **Both `auth.users` triggers were created** — `on_auth_user_created` and
  `on_auth_user_converted` are present and enabled in `pg_trigger`, and `auth.users` really does
  carry `is_anonymous`, `raw_app_meta_data`, `deleted_at` and `last_sign_in_at`. Inserting an
  `auth.users` row does create the `profiles` row; flipping `is_anonymous` does mirror to
  `profiles.is_guest`. Both were exercised, not just inspected.
- **`check_function_bodies` is `on`** and all 11 functions were created under it. This is not a
  formality — it is exactly what rejected `has_own_submission()` above.
- **Seed data inserts cleanly**: 6 `worlds`, 3 `ladders`, 1 `seasons`, 1 `fsrs_params` row whose
  `w` array has length 21. `leagues` is 0 rows, deliberately (see Known gaps).

### Invariant test results

Run against the live database inside a transaction that is rolled back at the end. 38 assertions,
38 pass. The one gap this exercise originally surfaced — a participant could submit under the
opponent's seat — is **closed** as of `20260806003422_submission_seat_ownership`; its regression tests are
rows 7a–7h below.

| # | Invariant | Result |
|---|---|---|
| 1 | `user_ratings.rating` = `900 + 400 * theta`; a fresh row (theta 0) yields exactly **900** | pass |
| 1b | theta 1.25 yields 1400; `altitude_band(900)` = `Treeline` | pass |
| 1c | `peak_theta` cannot be lowered | pass — *"peak_theta is a permanent high-water mark and cannot decrease"* |
| 2a | `league_members.points` cannot decrease | pass — *"league points are monotonic: leagues are promotion-only"* |
| 2b | points may increase | pass |
| 2c | "promotion" to a **lower** tier rejected | pass — *"no demotion path exists"* |
| 2d | "promotion" to the **same** tier rejected | pass |
| 2e | genuine promotion to a strictly higher tier accepted | pass |
| 2f | no `demot*` / `relegat*` column exists on `league_members` | pass |
| 3a | `review_log` has no UPDATE and no DELETE policy | pass |
| 3b | `authenticated` holds no UPDATE / DELETE / TRUNCATE privilege on `review_log` | pass |
| 3c | UPDATE as role `authenticated` rejected | pass — *permission denied for table review_log* |
| 3d | DELETE as role `authenticated` rejected | pass — *permission denied for table review_log* |
| 3e | SELECT + INSERT still work (append-only, not read-only) | pass |
| 4a/4b | a second submission for the same `(match_id, seat)` is rejected | pass — `submissions_one_per_seat` |
| 4d | opponent's submission invisible before you commit your own | pass — 0 rows visible |
| 4f | submission for a `(match, seat)` with no participant row rejected | pass — `submissions_seat_fk` |
| 7a | **seat hijack**: the seat-1 user inserting into seat 2 under their own `user_id` is rejected | pass — RLS `42501`, policy *"submissions: insert own into own seat"* |
| 7b | the same write with **RLS bypassed** (as table owner) is still rejected | pass — `23503 submissions_seat_user_fk` |
| 7c | the mirror case (seat-2 user filing into seat 1) rejected | pass — `23503 submissions_seat_user_fk` |
| 7d | a non-participant inserting into a match they are not in rejected | pass — RLS `42501` |
| 7e | a user inserting their **own** submission for their **own** seat still accepted | pass |
| 7f | a **bot** submission (`user_id is null`) for a real bot seat still accepted | pass |
| 7g | a **bot-shaped** submission (`user_id is null`) for an *unseated* seat rejected | pass — `23503 submissions_seat_fk` (the composite FK cannot see this row; see the null-path note below) |
| 7h | deleting a bot seat still cascades to its submission | pass — 0 rows survive |
| 5a/5b | `is_holdout` inconsistent with `selection_policy` rejected, both directions | pass — `item_presentations_holdout_matches_policy` |
| 5c/5d | consistent pairs accepted | pass |
| 5e | no client INSERT policy on `item_presentations` | pass |
| 6a | bot seat carrying a `user_id` rejected | pass — `match_participants_bot_xor_user` |
| 6b | non-bot seat with no `user_id` rejected | pass — same constraint |
| 6c/6d | bot with no `bot_slug`, and non-bot carrying one, both rejected | pass |
| 6e | a proper bot seat accepted | pass |
| X1–X3 | companion `sent` requires a parent `approved` row approved by the sending user | pass |
| X4 | `position_disagreement` and `rubric_hash` computed correctly | pass |
| X5 | one current judgment per match | pass — `judgments_one_current_per_match_idx` |
| X6 | `review_log` idempotent per `(card, review_time)` | pass |
| X7 | `delete_stale_anonymous_users()` executes (the `WITH ... DELETE` body runs) | pass — returned 0 |

### Seat identity: why `submissions` carries two foreign keys

A submission is bound to its seat by **two** complementary FKs. They look redundant and are not:

| Constraint | Columns | Guarantees | Covers bot rows? |
|---|---|---|---|
| `submissions_seat_fk` | `(match_id, seat)` | the seat **exists** | yes — every row |
| `submissions_seat_user_fk` | `(match_id, seat, user_id)` | the seat is **yours** | no |

The reason is the default `MATCH SIMPLE` semantics: a composite FK is **not checked at all** when
any referencing column is null. A bot submission carries `user_id is null` by design, so for
exactly those rows `submissions_seat_user_fk` enforces nothing — not even that the seat exists, and
not the `ON DELETE CASCADE`. `submissions_seat_fk` is what holds invariants 4f and 7g/7h for bot
rows. Dropping it as "implied by the three-column form" opens a hole (verified: the orphan row
inserts, and survives deletion of its seat).

Clients cannot reach that null path — the INSERT policy requires `user_id = (select auth.uid())`,
which is never null for a real caller — so it is only ever exercised by server-side bot writes
under the service role. That is precisely why it needs a constraint rather than a policy.

**Two layers, deliberately.** `owns_match_seat(match_id, seat)` rejects a hijack at the policy
level before it reaches the constraint; the composite FK rejects it even for code running as the
service role, where RLS does not apply.

> **PostgREST caveat.** There are now two relationships between `submissions` and
> `match_participants`, so an unhinted embed fails with `PGRST201` (ambiguous). Any embed between
> these two tables **must name the constraint** — e.g.
> `match_participants!submissions_seat_fk(...)`, as `src/lib/match/matchmaking.ts` does. This was
> already required before, because PostgREST cannot disambiguate a composite relationship by table
> name alone.

### Types

`src/lib/db/types.ts` is generated, not hand-written. Regenerate it whenever a migration lands:

```bash
npx supabase gen types --local --lang typescript --schema public > src/lib/db/types.ts
```

Caveat worth knowing: the generator emits stored generated columns (`user_ratings.rating`,
`peak_rating`, `judgments.rubric_hash`, `position_disagreement`, `match_participants.rating_delta`,
`rivalries.matches_played`) as ordinary optional fields in `Insert` and `Update`. They are not
writable — PostgREST will reject a write to any of them at runtime. Never set them; set `theta`.

## RLS model

The rules applied, and where:

- **RLS is enabled on all 29 tables**, including the pure-config ones.
- **`to authenticated` + an ownership predicate**, always. `auth.role() = 'authenticated'` appears
  nowhere: it is true for guests, and this app is guest-first, so it would be a silent hole.
- **`(select auth.uid())`**, never bare `auth.uid()` — the subselect is evaluated once per statement
  instead of once per row.
- **Every column named in a policy is indexed.** Where the predicate is a partial condition, the
  index is partial to match (e.g. `concepts (world_slug, kind) where is_active`,
  `item_presentations (item_id, presented_at) where is_holdout`).
- **UPDATE policies always carry both `using` and `with check`**, so a row cannot be reassigned to
  another owner, and every table with an UPDATE policy also has a SELECT policy (without one, the
  update silently affects zero rows).
- **Column-level `grant update (...)`** does the work a row policy cannot: it is what stops a user
  rewriting `profiles.is_guest` or `companions.level` / `unlocked_capabilities` on their own row.
  Tables the engine owns outright (`user_ratings`, `user_concept_mastery`, `item_stats`,
  `judgments`, `matches`, `match_participants`) have no client write grant at all.
- **Permanent-account gate** is `(select (auth.jwt() ->> 'is_anonymous')::boolean) is false`, used on
  claiming a `profiles.handle`, creating a `companions` row, inserting `companion_actions`, and
  joining `league_members`. Guests can still play matches, take The Daily, and accumulate cards,
  reviews and ratings — that is the whole point of play-before-signup.
- **`app_metadata` only.** `raw_app_meta_data` is read once, in `handle_new_user()`.
  `user_metadata` / `raw_user_meta_data` is never referenced anywhere, because the user can edit it.
- **`review_log` is append-only**: SELECT and INSERT policies only, plus an explicit
  `revoke update, delete, truncate`. `submissions` and `companion_actions` are append-only the same
  way. Do not add a policy to any of the three.
- **`security definer` functions** (`handle_new_user`, `handle_user_converted`,
  `is_match_participant`, `has_own_submission`, `delete_stale_anonymous_users`) all set
  `search_path = ''` and qualify every name. The last three have `execute` revoked from `public`
  and granted only where needed.
- **Explicit grants next to every policy.** As of the 2026-04-28 Supabase change (enforced
  2026-10-30) tables are not auto-exposed to the Data API, so RLS alone would leave a table
  unreadable, and — more dangerously — a future default-privileges change cannot silently expose
  one.
- No views are defined yet. Any that get added must be created
  `with (security_invoker = true)`, or they will run with the definer's rights and bypass RLS.

## Decisions you would otherwise question

**1. User data is owner-only through the Data API. Public surfaces are the server's job.**
Ladders, the results feed, rivals' handles and league standings are all public *product* surfaces,
but there is no policy anywhere that lets one user select another user's row. Those screens are
rendered by server code holding the service-role key, which projects exactly the columns it means to
publish. The alternative — a `using (true)` select policy on `profiles` and `user_ratings` — would
also publish `timezone`, `day_cutoff_hour` and every rating the client didn't ask for, and it is one
forgotten column away from a leak. This is the single most consequential choice in the file; if you
add a `using (true)` read policy later, add column-level grants in the same commit.

**2. `items`, `item_stats`, `daily_puzzle_items` and `judge_gold_labels` have RLS enabled and no
policies at all.** That is deny-all for `anon` and `authenticated`; `service_role` bypasses RLS and
still reads them. This is deliberate: `items.answer` holds the answer, `daily_puzzle_items` is the
spoiler, `item_stats.beta` is an internal calibration signal, and the gold label set is the judge's
answer key. Prompts reach the client only through server code that strips the answer.

**3. Ratings are stored as logits; the 900–2100 number is generated.**
`user_ratings.theta` is the dynamic-K Elo ability on the logit scale (which is what the engine, the
knowledge tracer and Bradley-Terry all compose on), and `rating` is a stored generated column,
`900 + 400 * theta` — 900 because that is the floor of the Treeline band, so a fresh account starts
at the bottom of the visible climb rather than at the payoff. The constant is pinned on both sides
by `src/lib/engine/display-scale.test.ts`, which reads this migration; verified 900 at theta 0.
There is exactly one source of truth. `peak_theta` is protected by a trigger
that refuses to lower it, because "you can be below your own line, you cannot lose the line" is a
product promise, not a UI detail.

**4. Table names `card` / `review_log` are singular, unlike everything else.**
They are taken from `03-learning-libs.md` §4.7 verbatim, and that section is the one place where the
column set was derived by reading the FSRS optimizer's source. The plan doc writes them plural;
§4.7 wins, so that the canonical five-column dump query in §4.7 runs unmodified.

**5. `delta_t` is never stored.**
`review_log` keeps the absolute `review_time`, plus the IANA `tz` **as it was at review time** and
`day_cutoff_hour`. `delta_t` is a calendar-day difference under those two values and both can change
retroactively (people travel; the cutoff is a setting), so it is computed at training time. The
`elapsed_days` column exists for audit only and is commented as such — do not train on it.

## Invariants enforced in the schema, not in code

These exist so that a future code path cannot violate them by accident:

| Invariant | Mechanism |
|---|---|
| Leagues never demote | No demotion column exists; `league_members_points_monotonic` refuses a points decrease; `league_members_promotion_only` refuses a target division whose tier is not strictly higher |
| Peak rating is permanent | `user_ratings_peak_monotonic` |
| The companion never sends autonomously | `companion_actions_send_requires_approval`: a `sent` row must descend from an `approved` row approved by the sending user |
| Holdout status cannot be faked | `item_presentations_holdout_matches_policy` ties `is_holdout` to `selection_policy = 'random_holdout'`, and there is no client INSERT policy on the table |
| A bot is never mistakable for a human | `match_participants_bot_xor_user`: a bot seat carries a `bot_slug` and no `user_id` |
| You cannot see your opponent's answer before committing yours | the `submissions` SELECT policy requires `has_own_submission(match_id)` |
| One judgment is current per match | partial unique index `judgments_one_current_per_match_idx` |
| One review row per `(card, review_time)` | unique index, so a client retry is idempotent |

## Anonymous-user cleanup

Supabase does not clean up unconverted anonymous users, and play-before-signup mints one per curious
stranger. Migration 6 ships `public.delete_stale_anonymous_users(older_than, played_grace, max_rows)`
but deliberately **does not** enable `pg_cron` or schedule anything — `create extension pg_cron`
fails on a project where it is not available, which would take the whole migration down with it.

Enable the extension from the dashboard, then, as `postgres`:

```sql
select cron.schedule(
  'delete-stale-anonymous-users',
  '30 3 * * *',
  $$ select public.delete_stale_anonymous_users(); $$
);
```

Or call it from a Vercel cron route with the service-role key. It is batched (`max_rows`, default
1000) and idempotent, so call it until it returns 0.

Two tiers, on purpose: a guest with no `review_log` and no `submissions` row is deleted after 30
days; a guest who actually played is kept for 90, because their review log is training data and
their rating is exactly what conversion is supposed to protect. Deleting the `auth.users` row
cascades through every user-data table — each of those FKs is `on delete cascade`.

## Known gaps

- ~~A participant can submit under the opponent's seat.~~ **Closed** by
  `20260806003422_submission_seat_ownership`, in two layers: an RLS check that the caller occupies
  the seat, and a composite FK that holds even for service-role writes. See invariants 7a–7h and
  "Seat identity: why `submissions` carries two foreign keys" above.
- `public.leagues` is intentionally **unseeded**: no source doc names the league tiers, and reusing
  the seven altitude band names would conflate the loss-bearing rating with the gain-only league.
- `entitlements`, `user_cosmetics` and `subscriptions` (plan doc, Phase 1) are not here — they were
  out of scope for this pass and belong with the billing work.
- No `updated_at` trigger on `daily_results`; completion is a single UPDATE from the client.
- `concepts` and `items` are empty. Migration 3 of the plan (the content pipeline) fills them.
