-- Verification queries for the Japanese content seed (supabase/seed.sql).
--
-- Run against the local stack:
--   docker exec -i supabase_db_loxelingo psql -U postgres -d postgres \
--     -f - < scripts/content/verify-seed.sql
-- or:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -f scripts/content/verify-seed.sql
--
-- The seed itself raises an exception on the three hard invariants (checks 3, 4, 6 below).
-- This file exists so a human can see the numbers rather than only the absence of a failure.

\pset border 2
\timing off

\echo '== 1. Row counts =========================================================='
select
  (select count(*) from public.concepts where world_slug = 'ja')        as ja_concepts,
  (select count(*) from public.items    where world_slug = 'ja')        as ja_items,
  (select count(*) from public.item_concepts ic
     join public.items i on i.id = ic.item_id where i.world_slug = 'ja') as ja_mappings,
  (select count(*) from public.item_stats st
     join public.items i on i.id = st.item_id where i.world_slug = 'ja') as ja_item_stats;

\echo '== 2. Items per ladder, with the difficulty prior ========================='
select
  ladder_slug,
  kind,
  count(*)                                as items,
  round(min(cold_start_beta)::numeric, 2) as beta_min,
  round(avg(cold_start_beta)::numeric, 2) as beta_avg,
  round(max(cold_start_beta)::numeric, 2) as beta_max
from public.items
where world_slug = 'ja'
group by ladder_slug, kind
order by ladder_slug, kind;

\echo '== 3. Every item maps to >= 1 concept (expect 0 rows) ====================='
select i.external_id
from public.items i
where i.world_slug = 'ja'
  and not exists (select 1 from public.item_concepts ic where ic.item_id = i.id);

\echo '== 4. Every concept has >= 1 item — no dead stars (expect 0 rows) ========='
select c.slug, c.kind
from public.concepts c
where c.world_slug = 'ja'
  and not exists (select 1 from public.item_concepts ic where ic.concept_id = c.id)
order by c.slug;

\echo '== 5. Concept coverage: items per concept ================================='
select c.kind, c.tier, count(distinct ic.item_id) as items, count(distinct c.id) as concepts
from public.concepts c
left join public.item_concepts ic on ic.concept_id = c.id
where c.world_slug = 'ja'
group by c.kind, c.tier
order by c.kind, c.tier;

\echo '== 6. Shape invariants (expect 0 rows) ==================================='
-- DUEL items must be open-ended (answer null) and carry a rubric; closed items must have
-- an answer whose `correct` is actually one of the offered options.
select i.external_id, 'duel item has a non-null answer' as problem
from public.items i where i.ladder_slug = 'duel' and i.answer is not null
union all
select i.external_id, 'item has no rubric_version'
from public.items i where i.world_slug = 'ja' and i.rubric_version is null
union all
select i.external_id, 'non-duel item has no answer'
from public.items i where i.world_slug = 'ja' and i.ladder_slug <> 'duel' and i.answer is null
union all
select i.external_id, 'prompt.task is missing or not a string (judge-runner reads it)'
from public.items i
where i.world_slug = 'ja' and jsonb_typeof(i.prompt -> 'task') is distinct from 'string'
union all
select i.external_id, 'answer.correct is not one of prompt.options'
from public.items i
where i.world_slug = 'ja'
  and i.answer ->> 'mode' = 'choice'
  and not (i.prompt -> 'options' ? (i.answer ->> 'correct'))
union all
select i.external_id, 'closed item has fewer than 2 options'
from public.items i
where i.world_slug = 'ja'
  and i.answer ->> 'mode' = 'choice'
  and jsonb_array_length(coalesce(i.prompt -> 'options', '[]'::jsonb)) < 2
union all
select i.external_id, 'recall item carries a media_path but no audio exists yet'
from public.items i where i.ladder_slug = 'recall' and i.media_path is not null
union all
select i.external_id, 'cold_start_beta outside [-1.8, 1.6]'
from public.items i
where i.world_slug = 'ja'
  and (i.cold_start_beta is null or i.cold_start_beta < -1.8 or i.cold_start_beta > 1.6);

\echo '== 7. Predicted P(correct) for a brand-new learner (theta = 0) ============'
-- tasks.ts targets 0.70 with an acceptance band of [0.50, 0.75]. `choices` comes from
-- prompt.options, exactly as choicesFromPrompt reads it, so the guessing floor is included.
with p as (
  select
    i.ladder_slug,
    case
      when jsonb_array_length(coalesce(i.prompt -> 'options', '[]'::jsonb)) >= 2
        then (1.0 / jsonb_array_length(i.prompt -> 'options'))
             + (1 - 1.0 / jsonb_array_length(i.prompt -> 'options'))
               * (1 / (1 + exp(i.cold_start_beta)))
      else 1 / (1 + exp(i.cold_start_beta))
    end as predicted_p
  from public.items i
  where i.world_slug = 'ja'
)
select
  ladder_slug,
  count(*)                                              as items,
  round(min(predicted_p)::numeric, 3)                   as p_min,
  round(avg(predicted_p)::numeric, 3)                   as p_avg,
  round(max(predicted_p)::numeric, 3)                   as p_max,
  count(*) filter (where predicted_p between 0.50 and 0.75) as in_band
from p
group by ladder_slug
order by ladder_slug;

\echo '== 8. Spot-check: five items, Japanese rendered ==========================='
select
  i.external_id,
  i.ladder_slug,
  coalesce(i.prompt ->> 'glyph', left(i.prompt ->> 'brief', 60)) as shown,
  i.prompt ->> 'reading'                                          as furigana,
  i.constraint_text,
  i.answer ->> 'primary'                                          as answer_primary,
  i.answer ->> 'correct'                                          as answer_correct,
  i.cold_start_beta
from public.items i
where i.external_id in (
  'ja-forge-kanji-tegami',
  'ja-forge-conj-iku-te',
  'ja-forge-particle-ga-dekiru',
  'ja-duel-package-note',
  'ja-recall-sweater-gift'
)
order by i.external_id;
