-- LoxeLingo — proofs for supabase/migrations/20260815112234_teaching_loop.sql.
--
--   npx supabase db reset && psql "$DATABASE_URL" -f scripts/content/verify-teaching.sql
--
-- Same shape as verify-avatars.sql: ON_ERROR_STOP is off, every numbered step that says
-- REJECTED must print an ERROR, and every step that says ACCEPTED must print a row. A step
-- that prints the wrong one of those is the finding.
--
-- WHY THIS FILE EXISTS RATHER THAN A MIGRATION-TIME PROBE. The avatars migration proves its
-- point budget by inserting into `public.avatars`, which is static config and needs nothing
-- else to exist. A `teaching_sessions` probe needs a real `auth.users` row and a real pairing,
-- and a migration has no business creating either. The two assertions a migration CAN make
-- there (that `1 + teaching_net / 3` produces six stages of three, and that 17 is the top of
-- stage 6) are in the migration; everything else is here.
--
-- UNVERIFIED AT THE TIME OF WRITING: all of it. Docker was down on the machine this was
-- authored on, so `supabase db reset` could not run. The migration was checked against the
-- real Postgres grammar with pgsql-parser (both the SQL and the plpgsql bodies parse) and the
-- stage arithmetic is covered by src/lib/teaching/stage.test.ts, but no statement below has
-- been executed against a live database.

\set ON_ERROR_STOP off
\echo '===================== TEACHING LOOP CONSTRAINT PROOFS ====================='

begin;

\echo ''
\echo '--- fixtures -----------------------------------------------------------'
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'teaching-probe@example.test', now(), now());

insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('22222222-2222-2222-2222-222222222222', 'ja', 'vane', 0.20, 0.20);

create temporary view probe as
select
  '22222222-2222-2222-2222-222222222222'::uuid                                as user_id,
  'ja'::text                                                                  as world_slug,
  'vane'::text                                                                as avatar_slug,
  'forge'::text                                                               as ladder_slug,
  (select id from public.items where external_id = 'ja-forge-kanji-taberu')   as item_id,
  (select id from public.concepts
    where world_slug = 'ja' and slug = 'ja-script-kanji-basic-verbs')          as concept_id,
  'Kanji with okurigana usually take the kun reading.'::text                   as explanation,
  'たべる'::text                                                               as attempt_answer,
  'I had that one ready before you finished.'::text                            as attempt_remark,
  'claude-haiku-4-5'::text                                                     as teaching_model,
  'claude-haiku-4-5@1'::text                                                   as teaching_model_version,
  1::integer                                                                   as attempt_config_version,
  timestamptz '2026-08-15 10:00:00+00'                                         as taught_at;

\echo ''
\echo '===================== user_avatars, extended ====================='

\echo ''
\echo '--- 1. user_avatars_teaching_net_range: a counter past the cap: REJECTED'
savepoint s1;
update public.user_avatars set teaching_net = 18
 where user_id = '22222222-2222-2222-2222-222222222222';
rollback to savepoint s1;

\echo ''
\echo '--- 2. user_avatars_stage_matches_net: a stage set on its own: REJECTED -'
-- The stage is a function of the counter, not a second fact about the pairing. NOTE: this is
-- the constraint that makes step 9 of verify-avatars.sql fail, where `stage = 4` is set
-- directly; that script needs `teaching_net = 9` beside it.
savepoint s2;
update public.user_avatars set stage = 4, lessons_taught = 12, last_taught_at = now()
 where user_id = '22222222-2222-2222-2222-222222222222';
rollback to savepoint s2;

\echo ''
\echo '--- 3. the same move done honestly: ACCEPTED ---------------------------'
update public.user_avatars
   set stage = 4, teaching_net = 9, lessons_taught = 12, last_taught_at = now(), theta = 1.10
 where user_id = '22222222-2222-2222-2222-222222222222';
select avatar_slug, stage, teaching_net, lessons_taught, theta, origin_theta
  from public.user_avatars where user_id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- 4. a fresh pairing carrying a banked counter: REJECTED -------------'
-- Two thirds of a stage smuggled into a new pairing by the INSERT that
-- user_avatars_untaught_pairing_sits_at_origin exists to stop. Caught whichever stage the
-- writer picks: stage 1 fails user_avatars_stage_matches_net, stage 2 fails the untaught rule.
savepoint s4;
insert into public.user_avatars
  (user_id, world_slug, avatar_slug, theta, origin_theta, teaching_net, stage)
values ('22222222-2222-2222-2222-222222222222', 'en', 'nell', 0.0, 0.0, 3, 2);
rollback to savepoint s4;

\echo ''
\echo '===================== teaching_sessions ====================='

\echo ''
\echo '--- 5. a legitimate settled session: ACCEPTED --------------------------'
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, concept_id, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   no_settle_reason, teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000005', user_id, world_slug, avatar_slug, ladder_slug,
       concept_id, item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       null, teaching_model, teaching_model_version, attempt_config_version, taught_at
  from probe;
select stage_before, stage_after, net_before, net_after, theta_before, theta_after, theta_delta
  from public.teaching_sessions where id = '00000000-0000-4000-8000-000000000005';

\echo ''
\echo '--- 6. teaching_sessions_net_moves_one_step: a jump of three: REJECTED --'
savepoint s6;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000006', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 5, 9, 12, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '1 min'
  from probe;
rollback to savepoint s6;

\echo ''
\echo '--- 7. teaching_sessions_net_moves_one_step: a miss that promotes: REJECTED'
savepoint s7;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000007', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, false, attempt_remark, false,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '2 min'
  from probe;
rollback to savepoint s7;

\echo ''
\echo '--- 8. teaching_sessions_stage_matches_net: a stage off its counter: REJECTED'
savepoint s8;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000008', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 6, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '3 min'
  from probe;
rollback to savepoint s8;

\echo ''
\echo '--- 9. the floor at Novice holds: a miss at net 0 stays at net 0: ACCEPTED'
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000009', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, false,
       1, 1, 0, 0, 0.20, 0.05,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '4 min'
  from probe;

\echo ''
\echo '--- 10. the cap at Expert holds: a success at net 17 stays: ACCEPTED ----'
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000010', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       6, 6, 17, 17, 2.40, 2.51,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '5 min'
  from probe;

\echo ''
\echo '===================== the kappa gate, as schema ====================='

\echo ''
\echo '--- 11. a frozen session: no reason, no theta: ACCEPTED -----------------'
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   no_settle_reason, teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000011', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, null, null,
       'not_calibrated', teaching_model, teaching_model_version, attempt_config_version,
       taught_at + interval '6 min'
  from probe;
select id, no_settle_reason, theta_before, theta_after, theta_delta
  from public.teaching_sessions where id = '00000000-0000-4000-8000-000000000011';

\echo ''
\echo '--- 12. a frozen session that moved a rating anyway: REJECTED -----------'
savepoint s12;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   no_settle_reason, teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000012', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       'not_calibrated', teaching_model, teaching_model_version, attempt_config_version,
       taught_at + interval '7 min'
  from probe;
rollback to savepoint s12;

\echo ''
\echo '--- 13. a settled session with no rating movement recorded: REJECTED ----'
savepoint s13;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000013', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, null, null,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '8 min'
  from probe;
rollback to savepoint s13;

\echo ''
\echo '--- 14. half a rating movement: REJECTED --------------------------------'
savepoint s14;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000014', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, null,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '9 min'
  from probe;
rollback to savepoint s14;

\echo ''
\echo '--- 15. a NoSettleReason that never produces a row: REJECTED ------------'
-- explanation_empty, attempt_failed and already_settled record nothing. See the migration
-- header: a row exists exactly when an attempt was graded.
savepoint s15;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   no_settle_reason, teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000015', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, null, null,
       'attempt_failed', teaching_model, teaching_model_version, attempt_config_version,
       taught_at + interval '10 min'
  from probe;
rollback to savepoint s15;

\echo ''
\echo '===================== the recorded text ====================='

\echo ''
\echo '--- 16. teaching_sessions_explanation_present: whitespace only: REJECTED'
savepoint s16;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000016', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, E'   \n  ', attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '11 min'
  from probe;
rollback to savepoint s16;

\echo ''
\echo '--- 17. teaching_sessions_remark_one_line: a remark with a break: REJECTED'
savepoint s17;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000017', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, E'One line.\nThen a second.', true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '12 min'
  from probe;
rollback to savepoint s17;

\echo ''
\echo '--- 18. teaching_sessions_answer_present: an empty answer: REJECTED -----'
savepoint s18;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000018', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, '', true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '13 min'
  from probe;
rollback to savepoint s18;

\echo ''
\echo '--- 19. attempt_config_version below 1: REJECTED ------------------------'
savepoint s19;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000019', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, 0, taught_at + interval '14 min'
  from probe;
rollback to savepoint s19;

\echo ''
\echo '===================== the pairing key, and replay ====================='

\echo ''
\echo '--- 20. a session for a pairing that does not exist: REJECTED -----------'
savepoint s20;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000020', user_id, world_slug, 'nell', ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '15 min'
  from probe;
rollback to savepoint s20;

\echo ''
\echo '--- 21. the replay guard: the same attempt again under a new id: REJECTED'
-- taught_at is deterministic for a given session, so a replayed settlement collides on
-- teaching_sessions_one_per_attempt instead of appending a second row.
savepoint s21;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-0000000000ff', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at
  from probe;
rollback to savepoint s21;

\echo ''
\echo '--- 22. the same session id twice: REJECTED -----------------------------'
savepoint s22;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
select '00000000-0000-4000-8000-000000000005', user_id, world_slug, avatar_slug, ladder_slug,
       item_id, explanation, attempt_answer, true, attempt_remark, true,
       4, 4, 9, 10, 1.10, 1.32,
       teaching_model, teaching_model_version, attempt_config_version, taught_at + interval '16 min'
  from probe;
rollback to savepoint s22;

\echo ''
\echo '===================== append-only ====================='

\echo ''
\echo '--- 23. correcting a verdict in place, as postgres: REJECTED ------------'
savepoint s23;
update public.teaching_sessions set was_correct = false
 where id = '00000000-0000-4000-8000-000000000005';
rollback to savepoint s23;

\echo ''
\echo '--- 24. deleting a session, as postgres: REJECTED -----------------------'
savepoint s24;
delete from public.teaching_sessions where id = '00000000-0000-4000-8000-000000000005';
rollback to savepoint s24;

\echo ''
\echo '===================== exposure ====================='

\echo ''
\echo '--- 25. a signed-in client cannot write a session: REJECTED -------------'
-- There is no INSERT policy and no INSERT grant. A client that could insert one could mark
-- its own attempt correct.
savepoint s25;
set local role authenticated;
insert into public.teaching_sessions
  (id, user_id, world_slug, avatar_slug, ladder_slug, item_id, explanation,
   attempt_answer, attempt_said_understood, attempt_remark, was_correct,
   stage_before, stage_after, net_before, net_after, theta_before, theta_after,
   teaching_model, teaching_model_version, attempt_config_version, taught_at)
values ('00000000-0000-4000-8000-000000000025', '22222222-2222-2222-2222-222222222222',
        'ja', 'vane', 'forge', 1, 'mine now', 'たべる', true, 'ok', true,
        4, 4, 9, 10, 1.10, 9.99, 'm', 'm@1', 1, now());
rollback to savepoint s25;

\echo ''
\echo '--- 26. a signed-in reader who is not the owner sees nothing: 0 rows ----'
savepoint s26;
set local role authenticated;
select count(*) as rows_visible_to_a_stranger from public.teaching_sessions;
rollback to savepoint s26;

\echo ''
\echo '--- 27. what actually landed --------------------------------------------'
select id, was_correct, stage_before, stage_after, net_before, net_after,
       no_settle_reason, theta_delta
  from public.teaching_sessions
 order by taught_at;

\echo ''
\echo '--- 28. nothing rejected above was written -----------------------------'
select count(*) as sessions_after_all_attempts from public.teaching_sessions;

rollback;

\echo ''
\echo '===================== expected outcome ====================='
\echo 'Steps 3, 5, 9, 10, 11, 26, 27, 28 print rows. Every other numbered step prints an ERROR.'
\echo 'Step 28 counts 4: the sessions from steps 5, 9, 10 and 11, and nothing else.'
\echo 'Note for step 2: verify-avatars.sql step 9 sets stage = 4 without teaching_net and will'
\echo 'now be rejected. It needs `teaching_net = 9` beside it.'
