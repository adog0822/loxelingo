-- LoxeLingo: the measured model prior on an item, and the eligibility rule built on it.
--
-- Implements the storage half of docs/research/09-prior-filter.md, against the findings in
-- docs/research/06-model-prior.md and docs/research/07-injection.md. Read those first. 06 found
-- that a contentless explanation scores 0.885 on the current bank and that 31 of 40 items return
-- the right answer on all five vacuous tries; an item like that cannot be failed by a player, so
-- the `taught` boolean it feeds into user_avatars.theta is a constant rather than a score.
--
-- =============================================================================
-- WHY p0 IS FIVE COLUMNS AND NOT ONE
-- =============================================================================
-- p0 is a property of an (item, prompt, model) triple. 07 measured the same six items at three
-- prompt versions and got 0.333, 0.567 and 0.400. A p0 stored without the version beside it
-- therefore does not say which prompt produced it, and the number keeps looking valid while
-- meaning something else.
--
--   prior_p0              measured P(correct) with a contentless explanation
--   prior_samples         how many attempts that came from
--   prior_prompt_version  ATTEMPT_PROMPT_VERSION at measurement time
--   prior_model           the model id that was attempting
--   prior_measured_at     when
--
-- `items_prior_all_or_nothing` makes the group atomic. A half-written measurement -- a p0 with
-- no version, or a version left behind after a p0 was cleared -- cannot exist, so any reader
-- that finds prior_p0 non-null also finds the three facts needed to interpret it.
--
-- =============================================================================
-- WHY ELIGIBILITY READS A CONFIDENCE BOUND AND NOT prior_p0
-- =============================================================================
-- This is the load-bearing decision in the file. 07 re-measured six items three times and found
-- that a five-sample rate does not identify an item: ja-forge-conj-shizuka-past came back 0/5,
-- then 5/5, then 3/5. A rule of the form `prior_p0 < 0.5` would have called that item a perfect
-- discriminator, then dead, then marginal, on the same item and the same model. Pinning a true
-- p0 to plus or minus 0.1 needs on the order of 100 samples per item, which across thousands of
-- candidates is unaffordable.
--
-- So the rule does not attempt to know p0. It asks whether the EVIDENCE RULES OUT a high p0:
--
--   is_teachable  <=>  prior_p0_ci_upper < teachable_max_p0()
--
-- Reachable at n = 20 (4 correct out of 20 gives an upper bound of 0.416, which clears; 9 out of
-- 20 gives 0.658, which does not), and it fails in the safe direction: an item near the line is
-- refused for want of evidence rather than admitted on a coin flip. Admitting a secretly-easy
-- item is the failure that destroys the mechanic, because it puts a constant back on the scored
-- surface where a score should be. Refusing a good item only costs a re-measurement.
--
-- =============================================================================
-- WHY THE RULE IS A VIEW, AND WHY THE BOUNDS ARE STORED COLUMNS
-- =============================================================================
-- Eligibility depends on attempt_prompt_version(). A stored generated column is computed at
-- write time, so were that version ever bumped, every existing row would still assert the
-- eligibility it held under the old prompt and nothing would error. The view is evaluated at
-- read time, so one edit retires the whole bank at once, which is the correct blast radius.
--
-- The Wilson bounds ARE stored generated columns, and that is not an inconsistency: they are a
-- pure function of prior_p0 and prior_samples, both of which sit in the same row, so a stored
-- bound can never fall out of step with its inputs. Storing them also means the number the rule
-- reads exists in exactly one place rather than being recomputed by each caller.
--
-- =============================================================================
-- THE MIRRORED CONSTANTS
-- =============================================================================
-- attempt_prompt_version() mirrors ATTEMPT_PROMPT_VERSION in src/lib/teaching/prompt.ts, and
-- teachable_max_p0() and prior_confirm_samples() mirror TEACHABLE_MAX_P0 and
-- PRIOR_CONFIRM_SAMPLES in src/lib/teaching/prior.ts. Written twice because Postgres cannot call
-- TypeScript. src/lib/teaching/prior-sql.test.ts reads this file and fails on a one-sided edit,
-- the same guard shape as display-scale.test.ts, bot-rungs.test.ts and altitude-band-sql.test.ts.
-- All three of those exist because a value was recorded somewhere that could not see its source;
-- this is the fourth, and a threshold that decides what reaches the scored surface is exactly
-- that kind of value.

-- ---------------------------------------------------------------------------
-- 1. The measurement itself
-- ---------------------------------------------------------------------------
alter table public.items
  add column prior_p0             double precision,
  add column prior_samples        integer,
  add column prior_prompt_version integer,
  add column prior_model          text,
  add column prior_measured_at    timestamptz;

comment on column public.items.prior_p0 is
  'Measured P(correct) when the avatar attempts this item from a contentless explanation. Descriptive only: eligibility reads prior_p0_ci_upper, because a point estimate at these sample sizes does not identify an item.';
comment on column public.items.prior_samples is
  'Attempts behind prior_p0. 20 for a stage-2 measurement, 30 for a stage-3 rescue, 5 for a stage-1 screen that is only ever allowed to reject.';
comment on column public.items.prior_prompt_version is
  'ATTEMPT_PROMPT_VERSION at measurement time. A p0 from an older prompt is stale, not wrong.';
comment on column public.items.prior_model is
  'The attempting model id, e.g. claude-haiku-4-5. A model swap invalidates the measurement as surely as a prompt edit.';
comment on column public.items.prior_measured_at is
  'When the measurement was taken.';

alter table public.items
  -- All five, or none. A measurement is a single fact spread across five columns, and a partial
  -- write would present a p0 that no reader can date or attribute.
  add constraint items_prior_all_or_nothing check (
    num_nonnulls(prior_p0, prior_samples, prior_prompt_version, prior_model, prior_measured_at)
      in (0, 5)
  ),
  add constraint items_prior_p0_range check (
    prior_p0 is null or (prior_p0 >= 0 and prior_p0 <= 1)
  ),
  add constraint items_prior_samples_positive check (
    prior_samples is null or prior_samples > 0
  ),
  add constraint items_prior_prompt_version_positive check (
    prior_prompt_version is null or prior_prompt_version > 0
  ),
  add constraint items_prior_model_present check (
    prior_model is null or length(btrim(prior_model)) > 0
  );

-- ---------------------------------------------------------------------------
-- 2. The mirrored constants
-- ---------------------------------------------------------------------------
create function public.attempt_prompt_version()
returns integer
language sql
immutable
parallel safe
as $$
  select 4;
$$;

comment on function public.attempt_prompt_version() is
  'Mirror of ATTEMPT_PROMPT_VERSION in src/lib/teaching/prompt.ts. Bump this in the same commit that bumps that constant; prior-sql.test.ts fails otherwise. Bumping it retires every stored measurement, which is the point.';

create function public.teachable_max_p0()
returns double precision
language sql
immutable
parallel safe
as $$
  select 0.5::double precision;
$$;

comment on function public.teachable_max_p0() is
  'Mirror of TEACHABLE_MAX_P0 in src/lib/teaching/prior.ts. An item is eligible only while the UPPER bound of its interval sits strictly below this, not while its point estimate does.';

create function public.prior_confirm_samples()
returns integer
language sql
immutable
parallel safe
as $$
  select 20;
$$;

comment on function public.prior_confirm_samples() is
  'Mirror of PRIOR_CONFIRM_SAMPLES in src/lib/teaching/prior.ts. The minimum sample count a measurement must carry before it is allowed to look eligible; see items_prior_evidence_bar.';

-- ---------------------------------------------------------------------------
-- 3. Wilson score interval, stored beside the estimate
-- ---------------------------------------------------------------------------
-- The upper bound is not decoration here, it IS the eligibility rule, so it lives in the row
-- rather than in whichever caller happens to need it.
--
-- Wilson rather than the normal approximation because the approximation is worst exactly where
-- this bank lives: 0 correct out of 20 gives [0, 0] under the normal form, which claims a
-- certainty the sample does not carry, and [0, 0.161] under Wilson.
--
-- `side` is -1 for the lower bound and +1 for the upper. One function rather than two so the
-- algebra is written once. Mirrors wilsonInterval in src/lib/teaching/prior.ts.
create function public.wilson_bound(p0 double precision, samples integer, side integer)
returns double precision
language sql
immutable
parallel safe
as $$
  select case
    when p0 is null or samples is null or samples <= 0 then null
    else greatest(0.0::double precision, least(1.0::double precision,
      (
        (p0 + 1.959963984540054 ^ 2 / (2 * samples))
        + side * 1.959963984540054
            * sqrt(p0 * (1 - p0) / samples + 1.959963984540054 ^ 2 / (4 * samples * samples))
      ) / (1 + 1.959963984540054 ^ 2 / samples)
    ))
  end;
$$;

comment on function public.wilson_bound(double precision, integer, integer) is
  'One bound of the 95 percent Wilson score interval. side = -1 for the lower bound, +1 for the upper. Mirror of wilsonInterval in src/lib/teaching/prior.ts; z = 1.959963984540054.';

alter table public.items
  add column prior_p0_ci_lower double precision
    generated always as (public.wilson_bound(prior_p0, prior_samples, -1)) stored,
  add column prior_p0_ci_upper double precision
    generated always as (public.wilson_bound(prior_p0, prior_samples, 1)) stored;

comment on column public.items.prior_p0_ci_lower is
  'Lower bound of the 95 percent Wilson interval on prior_p0. Derived, so it can never disagree with the estimate it describes.';
comment on column public.items.prior_p0_ci_upper is
  'Upper bound of the 95 percent Wilson interval on prior_p0. THIS is what item_teachability.is_teachable compares against teachable_max_p0(); prior_p0 itself is descriptive.';

-- The evidence bar, as schema. A measurement whose upper bound clears the line -- that is, one
-- that READS as eligible -- must carry at least a confirmation-sized sample. Without this, 0
-- correct out of 5 (upper bound 0.434) would admit an item on a single lucky screening draw,
-- which is precisely the selection effect the two-stage design exists to exclude.
alter table public.items
  add constraint items_prior_evidence_bar check (
    prior_p0 is null
    or public.wilson_bound(prior_p0, prior_samples, 1) >= public.teachable_max_p0()
    or prior_samples >= public.prior_confirm_samples()
  );

-- Most of the bank will sit at prior_p0 null or high. The partial index keeps the measured tail
-- cheap to scan without pinning the threshold into another place: it is deliberately WIDER than
-- the eligibility rule, so a change to teachable_max_p0() can never leave it stale.
create index items_prior_measured_idx on public.items (prior_p0_ci_upper)
  where prior_p0 is not null;

-- ---------------------------------------------------------------------------
-- 4. is_teachable
-- ---------------------------------------------------------------------------
-- `items` is never exposed to the Data API because `answer` would leak, so this view projects
-- the safe columns only and carries no answer key. security_invoker so it cannot become a way
-- around whatever policy the base table grows later.
create view public.item_teachability
with (security_invoker = true)
as
select
  i.id,
  i.external_id,
  i.world_slug,
  i.ladder_slug,
  i.kind,
  i.is_active,
  i.prior_p0,
  i.prior_samples,
  i.prior_prompt_version,
  i.prior_model,
  i.prior_measured_at,
  i.prior_p0_ci_lower,
  i.prior_p0_ci_upper,
  (
    i.prior_p0 is not null
    and i.prior_p0_ci_upper < public.teachable_max_p0()
    and i.prior_prompt_version = public.attempt_prompt_version()
  ) as is_teachable
from public.items i;

comment on view public.item_teachability is
  'Which items may be served for teaching. is_teachable asks whether the evidence rules out a high prior, not whether the point estimate happens to be low, because a five-sample rate does not identify an item (docs/research/07-injection.md). Evaluated at read time so that bumping attempt_prompt_version() retires every stale measurement at once.';

revoke all on public.item_teachability from public;
grant select on public.item_teachability to service_role;

revoke execute on function public.attempt_prompt_version() from public;
revoke execute on function public.teachable_max_p0() from public;
revoke execute on function public.prior_confirm_samples() from public;
revoke execute on function public.wilson_bound(double precision, integer, integer) from public;
grant execute on function public.attempt_prompt_version() to authenticated, service_role;
grant execute on function public.teachable_max_p0() to authenticated, service_role;
grant execute on function public.prior_confirm_samples() to authenticated, service_role;
grant execute on function public.wilson_bound(double precision, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Prove the invariants at apply time rather than trusting the SQL above
-- ---------------------------------------------------------------------------
do $$
declare
  victim bigint;
  low  double precision;
  high double precision;
  teachable boolean;
begin
  select id into victim from public.items order by id limit 1;
  if victim is null then
    raise exception 'no items to verify against';
  end if;

  -- (a) A half-written measurement must be impossible. p0 alone is exactly the failure the
  --     all-or-nothing constraint exists to stop: a number with nothing to date it by.
  begin
    update public.items set prior_p0 = 0.2 where id = victim;
    raise exception 'items_prior_all_or_nothing let a lone prior_p0 through';
  exception
    when check_violation then null;
  end;

  -- (b) And so must clearing one member of a complete group.
  update public.items
     set prior_p0 = 0.2, prior_samples = 20, prior_prompt_version = 1,
         prior_model = 'verification-only', prior_measured_at = now()
   where id = victim;
  begin
    update public.items set prior_prompt_version = null where id = victim;
    raise exception 'items_prior_all_or_nothing let prior_prompt_version be cleared alone';
  exception
    when check_violation then null;
  end;

  -- (c) The Wilson bounds bracket the estimate and are stored, not recomputed by the reader.
  select prior_p0_ci_lower, prior_p0_ci_upper into low, high
    from public.items where id = victim;
  if low is null or high is null then
    raise exception 'wilson bounds did not populate for a complete measurement';
  end if;
  if not (low < 0.2 and high > 0.2) then
    raise exception 'wilson bounds [%, %] do not bracket p0 = 0.2', low, high;
  end if;

  -- (d) 0 correct out of 20 is the case the normal approximation gets wrong. Wilson must
  --     report a lower bound of 0 and an upper bound near 0.161, not [0, 0].
  if abs(public.wilson_bound(0, 20, -1) - 0) > 1e-12 then
    raise exception 'wilson lower bound at 0/20 was %, expected 0', public.wilson_bound(0, 20, -1);
  end if;
  if abs(public.wilson_bound(0, 20, 1) - 0.16112515805281938) > 1e-12 then
    raise exception 'wilson upper bound at 0/20 was %, expected 0.16112515805281938',
      public.wilson_bound(0, 20, 1);
  end if;

  -- (d2) The two cases the eligibility rule is calibrated on. 4 out of 20 clears the line on the
  --      evidence; 9 out of 20 does not, and is correctly refused even though 0.45 < 0.5.
  if not (public.wilson_bound(0.20, 20, 1) < public.teachable_max_p0()) then
    raise exception '4/20 (upper %) failed to clear the line', public.wilson_bound(0.20, 20, 1);
  end if;
  if public.wilson_bound(0.45, 20, 1) < public.teachable_max_p0() then
    raise exception '9/20 (upper %) cleared the line; the rule is reading a point estimate',
      public.wilson_bound(0.45, 20, 1);
  end if;

  -- (e) Eligibility follows the version, not just the evidence. p0 = 0.2 at n = 20 clears the
  --     bound, so this row is ineligible only because it was measured at prompt version 1.
  select is_teachable into teachable from public.item_teachability where id = victim;
  if teachable then
    raise exception 'a measurement from prompt version 1 read as teachable at version %',
      public.attempt_prompt_version();
  end if;

  update public.items
     set prior_prompt_version = public.attempt_prompt_version() where id = victim;
  select is_teachable into teachable from public.item_teachability where id = victim;
  if not teachable then
    raise exception '4/20 at the current prompt version did not read as teachable';
  end if;

  -- (f) A point estimate under the line but an interval that reaches it is REFUSED. This is the
  --     whole change from a point-estimate rule, so it gets its own assertion.
  update public.items set prior_p0 = 0.45 where id = victim;
  select is_teachable into teachable from public.item_teachability where id = victim;
  if teachable then
    raise exception 'p0 = 0.45 at n = 20 read as teachable; the bound is not being consulted';
  end if;

  -- (g) A screening-sized sample may record a rejection but may never record eligibility.
  update public.items set prior_p0 = 1.0, prior_samples = 5 where id = victim;
  begin
    update public.items set prior_p0 = 0.0 where id = victim;
    raise exception 'items_prior_evidence_bar admitted 0/5 (upper bound %)',
      public.wilson_bound(0, 5, 1);
  exception
    when check_violation then null;
  end;

  -- Leave no verification-only measurement behind.
  update public.items
     set prior_p0 = null, prior_samples = null, prior_prompt_version = null,
         prior_model = null, prior_measured_at = null
   where id = victim;

  raise notice 'item prior invariants hold: atomic group, Wilson bounds, bound-based eligibility, evidence bar';
end $$;
