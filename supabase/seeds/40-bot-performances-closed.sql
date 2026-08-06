-- ---------------------------------------------------------------------------
-- LoxeLingo — bot performance pool for the CLOSED ladders (FORGE, RECALL).
--
-- DUEL needed 200 hand-authored answers because it is open production. These
-- ladders are closed: a performance is a chosen option or an exact string, so
-- nothing here is authored. Correctness is COMPUTED from the same logistic the
-- product already uses to target difficulty at humans, and wrong answers are
-- drawn from real content rather than invented.
--
-- §1  The accuracy model
--     src/lib/engine/elo.ts:
--       expectedCorrect(theta, beta, k) = k>1 ? 1/k + (1-1/k)*sigmoid(theta-beta)
--                                            : sigmoid(theta-beta)
--     Reimplemented below in SQL because a seed cannot call TypeScript. The
--     1/k guessing floor matters: without it a 940 bot would look hopeless on
--     4-option items, when in reality it guesses 25% of them right.
--       theta = (display_rating - 900) / 400.0   -- DISPLAY_INIT / DISPLAY_SCALE
--       beta  = items.cold_start_beta
--
-- §2  Deterministic, never random()
--     random() would repopulate differently on every `db reset`, breaking the
--     byte-identical idempotency the other pools prove and silently changing
--     which bot a learner meets. The roll is a hash of (bot, item): same input,
--     same outcome, forever.
--
-- §3  Wrong answers are BORROWED, never invented
--     choice items: another option from this item's own `prompt.options`.
--     exact items:  another item's correct answer from the same world+ladder.
--       Those 31 items carry no distractor list, and the alternative was to let
--       every bot answer them correctly — which would have produced no gradient
--       at all on more than half the closed pool. A borrowed reading is real
--       language, unambiguously wrong for THIS prompt, and invents nothing. It
--       is also the mistake a real learner makes: a word that exists, in the
--       wrong place.
--     Both paths assert the result is not the correct answer and not in accept[].
--
-- §4  Structure and hazards, inherited from 20-bot-performances-ja.sql
--     Three rows per performance: an origin `matches` row (void/ghost/unrated),
--     one `match_participants` bot seat, one `submissions` row.
--     - The CLI parses the whole file as ONE pipelined batch before executing,
--       so `create table ...; insert into it` fails with 42P01. Nothing is
--       created here; every intermediate is a CTE.
--     - `submitted_at` is a FIXED authored instant. chooseOpponent tie-breaks on
--       submission age, so now() would change the opponent by wall-clock time.
--     - `theta_before` must be double precision or toPoolPerformance yields NaN
--       and fetchPool silently drops the performance.
--     - Roster is DERIVED from public.bots (a migration table, present before
--       every seed). Slugs are never retyped here.
-- ---------------------------------------------------------------------------

-- §5  ORIGIN MATCHES ---------------------------------------------------------
with roster as (
  select slug, world_slug, display_rating,
         ((display_rating - 900) / 400.0)::double precision as theta,
         sort_order
  from public.bots
),
closed_items as (
  select i.id, i.external_id, i.world_slug, i.ladder_slug,
         i.cold_start_beta, i.time_limit_ms,
         i.answer->>'mode' as mode,
         coalesce(i.answer->>'correct', i.answer->>'primary') as correct,
         case when jsonb_typeof(i.prompt->'options') = 'array'
              then jsonb_array_length(i.prompt->'options') else 1 end as choices
  from public.items i
  where i.ladder_slug in ('forge', 'recall')
    and i.is_active
),
pairs as (
  select r.slug, r.world_slug, r.theta, r.sort_order,
         ci.id as item_id, ci.external_id, ci.ladder_slug,
         ci.choices, ci.time_limit_ms
  from roster r
  join closed_items ci on ci.world_slug = r.world_slug
)
insert into public.matches (
  id, world_slug, ladder_slug, item_id, prompt_snapshot, constraint_text,
  time_limit_ms, status, source, is_rated, created_at, resolved_at
)
select
  md5('loxelingo:bot-origin-match:v1:' || p.external_id || ':' || p.slug)::uuid,
  p.world_slug, p.ladder_slug, p.item_id,
  i.prompt, i.constraint_text, p.time_limit_ms,
  'void', 'ghost', false,
  timestamptz '2026-07-03 00:00:00+00',
  timestamptz '2026-07-03 00:00:00+00'
from pairs p
join public.items i on i.id = p.item_id
on conflict (id) do nothing;

-- §6  BOT SEATS --------------------------------------------------------------
with roster as (
  select slug, world_slug, ((display_rating - 900) / 400.0)::double precision as theta
  from public.bots
),
closed_items as (
  select i.id, i.external_id, i.world_slug, i.ladder_slug
  from public.items i
  where i.ladder_slug in ('forge', 'recall') and i.is_active
)
insert into public.match_participants (
  match_id, user_id, seat, is_bot, bot_slug, theta_before, result, created_at
)
select
  md5('loxelingo:bot-origin-match:v1:' || ci.external_id || ':' || r.slug)::uuid,
  null, 1, true, r.slug, r.theta, 'void',
  timestamptz '2026-07-03 00:00:00+00'
from roster r
join closed_items ci on ci.world_slug = r.world_slug
on conflict (match_id, seat) do nothing;

-- §7  SUBMISSIONS — where correctness is decided ----------------------------
with roster as (
  select slug, world_slug, display_rating,
         ((display_rating - 900) / 400.0)::double precision as theta,
         sort_order
  from public.bots
),
closed_items as (
  select i.id, i.external_id, i.world_slug, i.ladder_slug,
         i.cold_start_beta, i.time_limit_ms, i.prompt, i.answer,
         i.answer->>'mode' as mode,
         coalesce(i.answer->>'correct', i.answer->>'primary') as correct,
         case when jsonb_typeof(i.prompt->'options') = 'array'
              then jsonb_array_length(i.prompt->'options') else 1 end as choices
  from public.items i
  where i.ladder_slug in ('forge', 'recall') and i.is_active
),
-- Every distinct correct answer per world+ladder. The borrow pool for exact
-- items (§3). Ordered so the pick below is stable.
borrow_pool as (
  select world_slug, ladder_slug, correct,
         row_number() over (partition by world_slug, ladder_slug order by correct) - 1 as idx,
         count(*) over (partition by world_slug, ladder_slug) as n
  from (select distinct world_slug, ladder_slug, correct from closed_items) d
),
scored as (
  select
    r.slug, r.world_slug, r.theta, r.sort_order,
    ci.id as item_id, ci.external_id, ci.ladder_slug, ci.mode, ci.correct,
    ci.choices, ci.time_limit_ms, ci.prompt, ci.answer,
    -- §1 expectedCorrect, guessing floor included.
    case when ci.choices > 1
         then (1.0 / ci.choices)
              + (1 - 1.0 / ci.choices) * (1.0 / (1.0 + exp(-(r.theta - ci.cold_start_beta))))
         else 1.0 / (1.0 + exp(-(r.theta - ci.cold_start_beta)))
    end as p_correct,
    -- §2 deterministic tie-break, used for ordering only (see quota below).
    ((('x' || substr(md5('pick:' || r.slug || ':' || ci.external_id), 1, 8))::bit(32)::bigint
      & 2147483647)) as pick
  from roster r
  join closed_items ci on ci.world_slug = r.world_slug
),
-- §2b QUOTA SAMPLING, not per-item coin flips.
--
-- The obvious implementation — roll a hash against p_correct for each item —
-- was measured and REJECTED. Over 5-25 items the Bernoulli variance swamps the
-- signal: it produced Satoru (940) at 0.800 against Rin (1120) at 0.600, and
-- Sable (1820) below Mira (1340). The expected values were right and the
-- realised ladder was inverted, which is worse than useless in a product whose
-- entire premise is that rank means something.
--
-- Instead each bot answers correctly exactly as many items as the model
-- predicts (the sum of its per-item p_correct, rounded), and it gets right the
-- items it is MOST LIKELY to get right. Two properties fall out:
--   - aggregate accuracy matches expectedCorrect by construction
--   - the ladder is monotonic by construction, because a higher-rated bot has a
--     higher p_correct on EVERY item, hence a larger quota
-- The per-item choice stays principled: which items a bot misses are the hard
-- ones for that bot, not an accident of hashing.
quota as (
  select slug, world_slug, ladder_slug,
         round(sum(p_correct))::int as n_correct
  from scored group by 1,2,3
),
ranked as (
  select s.*,
         row_number() over (
           partition by s.slug, s.world_slug, s.ladder_slug
           order by s.p_correct desc, s.pick, s.external_id
         ) as difficulty_rank
  from scored s
),
resolved as (
  select s.*,
    (s.difficulty_rank <= q.n_correct) as is_right,
    case
      when s.difficulty_rank <= q.n_correct then s.correct
      -- choice: a different option from this item's own list
      when s.choices > 1 then (
        select opt from (
          select o.value #>> '{}' as opt,
                 row_number() over (order by o.ordinality) - 1 as i,
                 count(*) over () as n
          from jsonb_array_elements(s.prompt->'options') with ordinality o(value, ordinality)
          where o.value #>> '{}' is distinct from s.correct
        ) w where w.i = (s.pick % greatest(w.n, 1))
      )
      -- exact: another item's correct answer from the same world+ladder
      else (
        select bp.correct from borrow_pool bp
        where bp.world_slug = s.world_slug
          and bp.ladder_slug = s.ladder_slug
          and bp.correct is distinct from s.correct
          and not (coalesce(s.answer->'accept', '[]'::jsonb) ? bp.correct)
        offset (s.pick % greatest((
          select count(*) from borrow_pool b2
          where b2.world_slug = s.world_slug and b2.ladder_slug = s.ladder_slug
            and b2.correct is distinct from s.correct
            and not (coalesce(s.answer->'accept', '[]'::jsonb) ? b2.correct)
        ), 1)) limit 1
      )
    end as answer_text
  from ranked s
  join quota q
    on q.slug = s.slug and q.world_slug = s.world_slug and q.ladder_slug = s.ladder_slug
)
insert into public.submissions (
  id, match_id, user_id, seat, content, selected_option, media_path,
  elapsed_ms, paste_detected, keystroke_features, client_tz, integrity_flags,
  submitted_at
)
select
  md5('loxelingo:bot-submission:v1:' || rs.external_id || ':' || rs.slug)::uuid,
  md5('loxelingo:bot-origin-match:v1:' || rs.external_id || ':' || rs.slug)::uuid,
  null, 1,
  -- `content` always carries the answer: toPoolPerformance copies it into the
  -- learner's match and the comparator reads it. `selected_option` is set too
  -- for choice items so the closed-answer path has its structured form.
  rs.answer_text,
  case when rs.choices > 1 then rs.answer_text else null end,
  null,
  -- §8 elapsed_ms. Closed items are fast, and unlike DUEL a stronger bot is
  -- genuinely quicker: there is nothing to deliberate about once you know it.
  least(
    greatest(1200, (9000 - (rs.sort_order - 1) * 1400) + rs.choices * 350),
    coalesce(rs.time_limit_ms, 120000) - 1000
  ),
  false, null, 'UTC', null,
  timestamptz '2026-07-03 00:00:00+00'
from resolved rs
on conflict (id) do nothing;

-- §9  ASSERTIONS -------------------------------------------------------------
do $$
declare
  v_perf int; v_expected int; v_bad_slug int;
  v_empty int; v_uncovered int; v_rated int;
begin
  select count(*) into v_expected
  from public.items i join public.bots b on b.world_slug = i.world_slug
  where i.ladder_slug in ('forge','recall') and i.is_active;

  select count(*) into v_perf
  from public.submissions s
  join public.matches m on m.id = s.match_id
  join public.match_participants mp on mp.match_id = m.id
  where m.status = 'void' and mp.is_bot and m.ladder_slug in ('forge','recall');

  if v_perf <> v_expected then
    raise exception 'closed pool: expected % performances, found %', v_expected, v_perf;
  end if;

  -- No slug may be outside its own world's cast. There is no FK on bot_slug
  -- (deliberate: it would make unrelated seed order load-bearing), so this
  -- assertion is the only thing standing between a typo and a silent miss.
  select count(*) into v_bad_slug
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where m.status = 'void' and mp.is_bot and m.ladder_slug in ('forge','recall')
    and mp.bot_slug not in (select slug from public.bots where world_slug = m.world_slug);
  if v_bad_slug > 0 then
    raise exception 'closed pool: % seats carry a slug outside their world cast', v_bad_slug;
  end if;

  select count(*) into v_empty
  from public.submissions s
  join public.matches m on m.id = s.match_id
  where m.status = 'void' and m.ladder_slug in ('forge','recall')
    and (s.content is null or btrim(s.content) = '');
  if v_empty > 0 then
    raise exception 'closed pool: % submissions have an empty answer', v_empty;
  end if;

  select count(*) into v_uncovered
  from public.items i
  where i.ladder_slug in ('forge','recall') and i.is_active
    and (select count(distinct mp.bot_slug)
         from public.matches m join public.match_participants mp on mp.match_id = m.id
         where m.item_id = i.id and m.status = 'void' and mp.is_bot)
        <> (select count(*) from public.bots b where b.world_slug = i.world_slug);
  if v_uncovered > 0 then
    raise exception 'closed pool: % items are not covered by their full cast', v_uncovered;
  end if;

  select count(*) into v_rated
  from public.matches m
  where m.status = 'void' and m.ladder_slug in ('forge','recall') and m.is_rated;
  if v_rated > 0 then
    raise exception 'closed pool: % origin matches are marked rated', v_rated;
  end if;

  raise notice 'LoxeLingo closed pool: % performances across forge and recall', v_perf;
end $$;
