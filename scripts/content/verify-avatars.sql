\set ON_ERROR_STOP off
\echo '===================== CONSTRAINT PROOFS ====================='

create temporary view ok as
select
  'probe'::text                                                                          as slug,
  'Probe'::text                                                                          as name,
  'A described face, forty characters or more, written out in plain words for the card.'::text as look,
  'I hold one line here so the row is shaped like a real character.'::text                as hook,
  '{"speaks":["a","b","c"],"never":["a","b","c"]}'::jsonb                                 as voice_guide,
  '{"taught_well":"aaaaaaaaaaaaaaaaaaaaaa","taught_badly":"aaaaaaaaaaaaaaaaaaaaaa","player_slow":"aaaaaaaaaaaaaaaaaaaaaa","player_quit":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb as reactions,
  'Probe row used to prove the constraints reject bad data.'::text                        as homage_note;

\echo ''
\echo '--- 1. avatars_trait_budget: a 17-point vector -------------------------'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,hook, 5,4,1,1,2,4, voice_guide,reactions,homage_note, 900 from ok;

\echo ''
\echo '--- 2. avatars_trait_silhouette: the flat build, 3 everywhere, sums 18 --'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,hook, 3,3,3,3,3,3, voice_guide,reactions,homage_note, 901 from ok;

\echo ''
\echo '--- 3. avatars_says_no_label: a hook that names an axis ----------------'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,
       'I am a warm student with plenty of patience and very little edge.',
       5,4,1,1,2,5, voice_guide,reactions,homage_note, 902 from ok;

\echo ''
\echo '--- 4. avatars_names_no_source: a look that names the source character -'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,
       'A good coat over worse shoes, and people keep telling me I stand like Reigen does.',
       hook, 5,4,1,1,2,5, voice_guide,reactions,homage_note, 903 from ok;

\echo ''
\echo '--- 5. avatars_reactions_cover_every_situation: one situation missing --'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,hook, 5,4,1,1,2,5, voice_guide,
       reactions - 'player_quit', homage_note, 904 from ok;

\echo ''
\echo '--- 6. avatars_reactions_cover_every_situation: a fifth situation ------'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,hook, 5,4,1,1,2,5, voice_guide,
       reactions || '{"player_swears":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb, homage_note, 905 from ok;

\echo ''
\echo '--- 7. avatars_voice_guide_shape: no `never` array ---------------------'
insert into public.avatars (slug,name,look,hook,warmth,humour,edge,patience,candour,drive,voice_guide,reactions,homage_note,sort_order)
select slug,name,look,hook, 5,4,1,1,2,5,
       voice_guide - 'never', reactions, homage_note, 906 from ok;

\echo ''
\echo '--- 8. nothing above was written ---------------------------------------'
select count(*) as avatar_rows_after_seven_attempts from public.avatars;

\echo ''
\echo '===================== THE SWITCH ====================='
begin;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'switch-probe@example.test', now(), now());

\echo ''
\echo '--- 9. a legitimate first pairing sits exactly where the player is -----'
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'nell', 0.42, 0.42);
update public.user_avatars
   set theta = 1.90, stage = 4, lessons_taught = 12, last_taught_at = now()
 where avatar_slug = 'nell';
select avatar_slug, stage, theta, origin_theta, lessons_taught from public.user_avatars;

\echo ''
\echo '--- 10. the switch, carrying the taught theta across: REJECTED ---------'
savepoint s10;
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'vane', 1.90, 0.42);
rollback to savepoint s10;

\echo ''
\echo '--- 11. carrying the stage across instead: REJECTED --------------------'
savepoint s11;
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta, stage)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'vane', 0.42, 0.42, 4);
rollback to savepoint s11;

\echo ''
\echo '--- 12. faking a lesson count to escape that: REJECTED -----------------'
savepoint s12;
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta, stage, lessons_taught)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'vane', 1.90, 0.42, 4, 12);
rollback to savepoint s12;

\echo ''
\echo '--- 13. two current pairings in one world: REJECTED --------------------'
savepoint s13;
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'vane', 0.42, 0.42);
rollback to savepoint s13;

\echo ''
\echo '--- 14. the honest switch: retire, then pair. The old row survives -----'
update public.user_avatars set retired_at = now()
 where user_id = '11111111-1111-1111-1111-111111111111' and avatar_slug = 'nell';
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('11111111-1111-1111-1111-111111111111', 'ja', 'vane', 0.42, 0.42);
select avatar_slug, stage, theta, origin_theta, lessons_taught,
       (retired_at is null) as is_current
  from public.user_avatars order by avatar_slug;

\echo ''
\echo '--- 15. a pairing in another world stands at the same time -------------'
insert into public.user_avatars (user_id, world_slug, avatar_slug, theta, origin_theta)
values ('11111111-1111-1111-1111-111111111111', 'en', 'sorrel', 0.0, 0.0);
select world_slug, avatar_slug from public.user_avatars where retired_at is null order by world_slug;
rollback;

\echo ''
\echo '===================== EXPOSURE ====================='
begin;
set local role authenticated;
\echo '--- 16. a signed-in reader cannot see the trait columns ----------------'
select warmth from public.avatars limit 1;
\echo '--- 17. and cannot see homage_note -------------------------------------'
select homage_note from public.avatars limit 1;
\echo '--- 18. and can read the card ------------------------------------------'
select slug, name from public.avatars order by sort_order;
rollback;
