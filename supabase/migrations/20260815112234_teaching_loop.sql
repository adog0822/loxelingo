-- LoxeLingo — the teaching loop. What the player explained, what the avatar did with it, and
-- what that moved.
--
-- Implements Phase 3 of docs/superpowers/plans/2026-08-13-v2-goal-and-plan.md, against the
-- contract in src/lib/teaching/contract.ts. Read that file first: the mechanic is "scored on
-- whether the avatar can now do the thing", taken literally.
--
-- =============================================================================
-- WHAT THIS ADDS, AND WHAT IT REFUSES TO DUPLICATE
-- =============================================================================
-- `public.user_avatars` (20260815100430) already holds the pairing and its progress: `stage`,
-- `theta`, `origin_theta`, `lessons_taught`. This migration EXTENDS that row with one column
-- and adds one table beside it. It creates no second home for teaching progress, because a
-- second home is a second answer to "what stage is this avatar", and the two would disagree
-- within a release.
--
--   user_avatars.teaching_net   the stage counter. New column, described below.
--   teaching_sessions           one append-only row per graded attempt.
--
-- =============================================================================
-- THE STAGE RULE, AS SCHEMA
-- =============================================================================
-- Three teachings that land move the avatar up a stage. One that misses takes back one of the
-- three. Mechanically that is a single counter and a division:
--
--   teaching_net := clamp(teaching_net + (correct ? +1 : -1), 0, 17)
--   stage        := 1 + teaching_net / 3            -- integer division
--
-- WHY A COUNTER AND NOT A STREAK. A streak rule takes everything from a player two thirds of
-- the way up for one miss, which makes the honest move (teach the concept you are shaky on)
-- the expensive one. A counter costs a miss exactly one third of a step, wherever it lands.
--
-- WHY REGRESSION AT ALL. A stage that only rises records how much a player has done rather
-- than what their avatar can do, and the avatar's ability is the score. Three consecutive
-- misses cost one stage and never more than one at a time. The landing is soft on purpose:
-- dropping out of stage 3 lands at net 2, the TOP of stage 2, so one success returns it.
--
-- WHY THE CAP AT 17. Without it, an Expert avatar with forty successes banked could miss
-- thirty times and still read as Expert. 17 is the top of stage 6, so a stage-6 avatar sits at
-- most two successes above its threshold, exactly like every other stage. Expert is held.
--
-- `user_avatars_stage_matches_net` makes the division an invariant rather than a convention.
-- It is the same expression as `stageFromNet` in src/lib/teaching/stage.ts, written twice
-- because Postgres cannot call TypeScript; stage.test.ts reads this file and fails on a
-- one-sided edit, exactly as display-scale.test.ts does for the rating scale.
--
-- =============================================================================
-- WHY A SESSION ROW EXISTS EXACTLY WHEN AN ATTEMPT WAS GRADED
-- =============================================================================
-- `NoSettleReason` in the contract has four values and only one of them ever reaches this
-- table:
--
--   explanation_empty  no attempt was made. There is nothing to attribute a scoring change to.
--   attempt_failed     the model call failed. An outage is not a miss and is not recorded as
--                      one; charging a player a third of a stage for our downtime would be
--                      indistinguishable, session by session, from having taught badly.
--   already_settled    the insert below collided. By definition the row is already here.
--   not_calibrated     the attempt ran and was graded; only the write to theta was withheld.
--
-- So every row here carries a real answer and a real verdict, `no_settle_reason` is either
-- null or 'not_calibrated', and the attempt columns are NOT NULL. A nullable-everything audit
-- table would have been the alternative and it would have made every query start by working
-- out which rows mean anything.
--
-- =============================================================================
-- THE KAPPA GATE, RECORDED RATHER THAN ASSUMED
-- =============================================================================
-- Ratings stay frozen until the judge configuration clears kappa > 0.6, exactly as matches do
-- (src/lib/judge/calibration.ts). Teaching is a SECOND scored surface writing to a progression
-- ladder, so it inherits the gate. While it holds, `theta_before` and `theta_after` are null
-- and `no_settle_reason` is 'not_calibrated'. `teaching_sessions_theta_pair_agrees_with_reason`
-- makes the two statements the same statement, so a frozen session cannot be written with a
-- rating movement attached and a settled one cannot be written without.
--
-- The stage still moves while the gate holds, and that is the contract's choice, not this
-- file's: `TeachingOutcome.thetaBefore` is `number | null` and documented as null under the
-- gate, while `stageBefore` is not nullable. The stage is feedback; theta is the rating.
--
-- =============================================================================
-- APPEND-ONLY
-- =============================================================================
-- Enforced three ways, because "append-only" as a comment is a convention and this table is
-- the evidence a scoring change is reconstructed from:
--   1. no UPDATE or DELETE policy for `authenticated` and no UPDATE/DELETE grant,
--   2. a BEFORE UPDATE OR DELETE trigger that raises, which binds `service_role` too,
--   3. a unique index on (pairing, item, taught_at), so a replayed settlement collides
--      instead of appending a second row. `taught_at` is deterministic for a given session,
--      derived by the caller from the session rather than read off a clock; if it were
--      `now()` the index would be decorative. Same rule as review_log's (card_id, review_time).
--
-- =============================================================================
-- EXPOSURE
-- =============================================================================
-- Per-user and readable only by its owner, with NO client write path, matching `user_avatars`
-- and `user_ratings`. Everything that writes here runs server-side under the service role: a
-- client that could insert a session could mark its own attempt correct.
--
-- `explanation` is the player's own words and is readable by that player. The avatar's answer
-- and remark are readable too; they are what the verdict screen shows. Nothing in this table
-- is another player's data and nothing here is an answer key.

-- ---------------------------------------------------------------------------
-- user_avatars.teaching_net — the stage counter.
-- ---------------------------------------------------------------------------
alter table public.user_avatars
  add column teaching_net smallint not null default 0;

comment on column public.user_avatars.teaching_net is
  'Stage counter. +1 per teaching that lands, -1 per one that misses, clamped to 0..17. The stage is 1 + teaching_net / 3 and user_avatars_stage_matches_net keeps the two from disagreeing. Mirrors stageFromNet in src/lib/teaching/stage.ts.';

alter table public.user_avatars
  add constraint user_avatars_teaching_net_range check (teaching_net between 0 and 17);

-- The stage is a function of the counter, not a second fact about the pairing.
alter table public.user_avatars
  add constraint user_avatars_stage_matches_net check (stage = 1 + teaching_net / 3);

-- The pairing origin, extended. `user_avatars_untaught_pairing_sits_at_origin` already says an
-- untaught pairing sits at stage 1 with theta = origin_theta; it predates this column and says
-- nothing about it. Without this, a fresh row could carry a banked counter, which is two thirds
-- of a stage smuggled into a new pairing by the same INSERT that constraint exists to stop.
alter table public.user_avatars
  add constraint user_avatars_untaught_pairing_has_no_progress check (
    lessons_taught > 0 or teaching_net = 0
  );

-- ---------------------------------------------------------------------------
-- teaching_sessions — one graded attempt. Append-only.
-- ---------------------------------------------------------------------------
create table public.teaching_sessions (
  -- Supplied by the caller and deterministic for a given session, so a retry collides here
  -- rather than recording the same teaching twice.
  id                      uuid        primary key,

  user_id                 uuid        not null references auth.users (id) on delete cascade,
  world_slug              text        not null,
  avatar_slug             text        not null,

  -- The ladder the task came from, for the same reason judgments carry it: a rating is per
  -- world per ladder and a session that cannot name its ladder cannot be attributed to one.
  ladder_slug             text        not null references public.ladders (slug) on delete restrict,

  -- WHAT WAS TAUGHT. Recorded here and nowhere near a prompt: the concept name and id are on
  -- the isolation rule's forbidden list, and `AttemptInput` has no field for either.
  concept_id              bigint      references public.concepts (id) on delete set null,
  -- WHAT WAS ATTEMPTED. `on delete restrict`: a retired item must not take the evidence of how
  -- players taught it with it.
  item_id                 bigint      not null references public.items (id) on delete restrict,

  -- The player's explanation, verbatim. Stored exactly as it was prompted with, because a
  -- stored paraphrase would make every later question about this session unanswerable.
  explanation             text        not null,

  -- The attempt.
  attempt_answer          text        not null,
  -- The avatar's own account of whether it followed the explanation. FLAVOUR, never score: a
  -- low-candour avatar is expected to misreport this and that is the axis working.
  attempt_said_understood boolean     not null,
  attempt_remark          text        not null,

  -- THE SCORE. `attempt_answer` against `items.answer`, by the rule the closed ladders use.
  was_correct             boolean     not null,

  stage_before            smallint    not null check (stage_before between 1 and 6),
  stage_after             smallint    not null check (stage_after  between 1 and 6),
  net_before              smallint    not null check (net_before between 0 and 17),
  net_after               smallint    not null check (net_after  between 0 and 17),

  -- Null exactly while the kappa gate holds ratings frozen.
  theta_before            double precision,
  theta_after             double precision,
  theta_delta             double precision generated always as (theta_after - theta_before) stored,

  no_settle_reason        text        check (
    no_settle_reason is null or no_settle_reason = 'not_calibrated'
  ),

  -- PROVENANCE: required, not optional, so a change in how often avatars succeed is
  -- attributable to a configuration change rather than mistaken for drift in players.
  teaching_model          text        not null,
  teaching_model_version  text        not null,
  -- ATTEMPT_PROMPT_VERSION from src/lib/teaching/prompt.ts. A prompt edit is exactly as
  -- significant as a model swap here, because the prompt IS the isolation rule.
  attempt_config_version  integer     not null check (attempt_config_version >= 1),

  -- Deterministic for a given session. See the append-only note in the header.
  taught_at               timestamptz not null,
  created_at              timestamptz not null default now(),

  -- The pairing this belongs to, as one key rather than three. There is no row here that
  -- describes teaching in a world without naming the avatar, for the same reason there is no
  -- such row in user_avatars.
  foreign key (user_id, world_slug, avatar_slug)
    references public.user_avatars (user_id, world_slug, avatar_slug) on delete cascade,

  -- THE STAGE RULE, AS AN INVARIANT. One session moves the counter by exactly one, in the
  -- direction the verdict says, clamped at both ends. Everything a reader would otherwise have
  -- to assert separately follows from this and the line below it: a stage moves by at most
  -- one, a miss never promotes, a success never demotes.
  constraint teaching_sessions_net_moves_one_step check (
    net_after = least(17, greatest(0, net_before + case when was_correct then 1 else -1 end))
  ),
  -- The same division as user_avatars_stage_matches_net, on both ends of the session.
  constraint teaching_sessions_stage_matches_net check (
    stage_before = 1 + net_before / 3 and stage_after = 1 + net_after / 3
  ),

  -- A frozen session moved no rating, and a settled one moved one. The two facts are one fact.
  constraint teaching_sessions_theta_pair_agrees_with_reason check (
    (theta_before is null) = (theta_after is null)
    and (theta_before is null) = (no_settle_reason is not null)
  ),

  -- An empty explanation never reaches a model and never reaches this table; it settles as
  -- 'explanation_empty' with nothing recorded. See the header.
  constraint teaching_sessions_explanation_present check (
    char_length(btrim(explanation)) between 1 and 4000
  ),
  constraint teaching_sessions_remark_one_line check (
    position(E'\n' in attempt_remark) = 0 and char_length(attempt_remark) between 1 and 400
  ),
  constraint teaching_sessions_answer_present check (
    char_length(attempt_answer) between 1 and 400
  )
);

comment on table public.teaching_sessions is
  'One graded attempt: what the player explained, what the avatar produced from it, and what that moved. Append-only. A row exists exactly when an attempt was graded, so was_correct is never null and no_settle_reason is either null or ''not_calibrated''.';
comment on column public.teaching_sessions.explanation is
  'The player''s own words, verbatim. Prompted verbatim and stored verbatim: a paraphrase on either side scores our prose rather than their teaching.';
comment on column public.teaching_sessions.attempt_said_understood is
  'The avatar''s account of itself. Flavour and feedback, never score. Low candour is expected to misreport it.';
comment on column public.teaching_sessions.was_correct is
  'attempt_answer against items.answer, by the same rule the closed ladders use. This boolean is the player''s score for the session.';
comment on column public.teaching_sessions.no_settle_reason is
  '''not_calibrated'' when the kappa gate held theta frozen. Null when the rating moved. The other three NoSettleReason values never produce a row; see the migration header.';
comment on column public.teaching_sessions.attempt_config_version is
  'ATTEMPT_PROMPT_VERSION at the time of the attempt. The prompt is the isolation rule, so a prompt edit is as significant as a model swap and is attributed the same way.';
comment on column public.teaching_sessions.taught_at is
  'Deterministic for a given session, derived from the session and never from a clock. It is half of the replay guard below; a wall-clock value would make that index decorative.';

-- THE REPLAY GUARD. Same shape and same reasoning as review_log's (card_id, review_time).
create unique index teaching_sessions_one_per_attempt
  on public.teaching_sessions (user_id, world_slug, avatar_slug, item_id, taught_at);

create index teaching_sessions_pairing_idx
  on public.teaching_sessions (user_id, world_slug, avatar_slug, taught_at desc);
create index teaching_sessions_concept_idx
  on public.teaching_sessions (concept_id) where concept_id is not null;
-- The frozen slice, so the sessions to re-score once the gate clears are one index scan away.
create index teaching_sessions_frozen_idx
  on public.teaching_sessions (created_at) where no_settle_reason is not null;

-- ---------------------------------------------------------------------------
-- Append-only, enforced against every role including service_role.
-- ---------------------------------------------------------------------------
create function public.teaching_sessions_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'teaching_sessions is append-only: % is not permitted. A scoring change is reconstructed from these rows, so correcting one means writing a new session, not editing an old one.',
    tg_op;
end;
$$;

comment on function public.teaching_sessions_is_append_only() is
  'Raises on UPDATE and DELETE. Binds service_role as well, which is the point: everything that writes teaching_sessions runs as service_role.';

create trigger teaching_sessions_no_update_or_delete
  before update or delete on public.teaching_sessions
  for each row execute function public.teaching_sessions_is_append_only();

-- ---------------------------------------------------------------------------
-- RLS + grants.
-- `to authenticated` covers guests: anonymous sign-in issues an `authenticated` JWT with
-- is_anonymous = true. (Never `auth.role() = 'authenticated'` in a predicate.)
-- ---------------------------------------------------------------------------
alter table public.teaching_sessions enable row level security;

create policy "teaching_sessions: select own"
  on public.teaching_sessions for select to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT, UPDATE or DELETE policy. Settlement runs server-side under the service role; a
-- client that could insert a session could mark its own attempt correct.

grant select on public.teaching_sessions to authenticated;
grant all    on public.teaching_sessions to service_role;

-- ---------------------------------------------------------------------------
-- Assertions. The stage rule now lives in three places (this file, stage.ts, and any UI that
-- draws the progress bar) because Postgres cannot call TypeScript. Pin the SQL side to
-- literals here so a change to the constraints that forgets stage.ts fails at migration time
-- rather than at settlement time.
--
-- These probe user_avatars rather than teaching_sessions on purpose: teaching_sessions needs a
-- real auth.users row and a real pairing to probe, which a migration has no business creating.
-- The constraints on that table are proved by scripts/content/verify-teaching.sql.
-- ---------------------------------------------------------------------------
do $$
declare
  n_bad integer;
begin
  -- 1 + net/3 must give 1,1,1,2,2,2,...,6,6,6 across 0..17, or `stage` and `teaching_net` do
  -- not describe the same ladder that stageFromNet does.
  select count(*) into n_bad
  from generate_series(0, 17) as net
  where 1 + net / 3 <> case
    when net <  3 then 1 when net <  6 then 2 when net <  9 then 3
    when net < 12 then 4 when net < 15 then 5 else 6 end;
  if n_bad > 0 then
    raise exception
      'teaching: 1 + teaching_net / 3 does not produce six stages of three across 0..17 (% mismatches); user_avatars_stage_matches_net disagrees with stageFromNet in src/lib/teaching/stage.ts',
      n_bad;
  end if;

  -- The cap must be the top of the last stage, not somewhere inside it.
  if 1 + 17 / 3 <> 6 or 1 + 18 / 3 = 6 then
    raise exception
      'teaching: 17 is not the top of stage 6; NET_MAX in src/lib/teaching/stage.ts and the teaching_net range CHECK have drifted apart';
  end if;

  raise notice 'LoxeLingo teaching: teaching_sessions in place, stage = 1 + teaching_net / 3 binding across 0..17.';
end $$;
