-- The bot cast, moved onto the 0-10,000 display scale.
--
-- `20260815094459_rating_scale_10k` rescaled what a player sees from
-- `900 + 400 * theta` to `1000 + 1250 * theta` and left the roster behind. The
-- five authored ratings were typed on the old scale, so reading them back
-- through the new one collapsed the whole cast into 0.704 logits (theta -0.048
-- to 0.656) of a designed 2.20. The top rung landed at 0.656 while Ridge, the
-- FIRST threshold crossing, sits at 0.64: a player who has just earned their
-- first band has already passed every opponent the game can seat. The ladder
-- stops being a ladder at the exact moment it is supposed to start being one.
--
-- The rungs were always logits. Restating them on the current scale:
--
--   rung               theta   was   now
--   earnest_beginner    0.10   940   1125
--   casual_peer         0.55  1120   1688   (1687.5; the column is integer)
--   precise_literary    1.10  1340   2375
--   warm_guide          1.70  1580   3125
--   master              2.30  1820   3875
--
-- The thetas are unchanged, which is the point: `match_participants.theta_before`
-- on every seeded bot seat already holds 0.1 / 0.55 / 1.1 / 1.7 / 2.3, and the
-- authored performances were tuned against those. Nothing about how well a bot
-- answers moves here. Only the number printed beside its name.
--
-- `src/lib/engine/bot-rungs.test.ts` reads THIS FILE and asserts each rating
-- converts back to its rung's theta through `fromDisplayScale`, so the next
-- display rescale that forgets the cast fails the suite instead of shipping.

-- The old bound (400-3000) was sized for the old scale: theta -1.25 to 5.25. Two
-- of the rungs above are outside it. Rather than pick two more numbers that will
-- rot at the next rescale, the check now states the display range the product
-- actually defines. A rating outside 0-10,000 is not a bot placed badly, it is a
-- number that does not belong to the scale at all.
alter table public.bots
  drop constraint bots_display_rating_check;

alter table public.bots
  add constraint bots_display_rating_check
    check (display_rating between 0 and 10000);

-- Keyed by archetype, not by slug: the rung IS the difficulty and is shared
-- across worlds, so every world's cast moves together and no future world can be
-- missed by this statement.
update public.bots b
set display_rating = r.display_rating
from (values
  ('earnest_beginner', 1125),
  ('casual_peer',      1688),
  ('precise_literary', 2375),
  ('warm_guide',       3125),
  ('master',           3875)
) as r (archetype, display_rating)
where b.archetype = r.archetype
  and b.display_rating is distinct from r.display_rating;

comment on constraint bots_display_rating_check on public.bots is
  'The 0-10,000 display range itself, not a pair of chosen bounds, so it survives a rescale of the ratings inside it.';

-- Both column comments named the rung by a number that has now changed twice. Restated to name
-- the scale and the archetype instead, which are the parts that hold still.
comment on column public.bots.display_rating is
  'The 0-10,000 DISPLAY scale, not logits: nearestBotPerformance compares display ratings, so the authored number means what a designer typed. Mirror of DISPLAY_INIT/DISPLAY_SCALE in src/lib/engine/elo.ts.';

comment on column public.bots.archetype is
  'The rung, machine-readable and shared across worlds, so code can say "the warm_guide" without knowing the cast or its current rating.';

-- Swept up while restating the scale: `user_ratings.theta` still described itself with the old
-- formula. `20260815094459` redefined the generated columns and left this one line behind, which
-- is the same failure mode as the roster and the reason it is worth naming the constants rather
-- than the arithmetic.
comment on column public.user_ratings.theta is
  'Logit-scale ability. rating = DISPLAY_INIT + DISPLAY_SCALE * theta (src/lib/engine/elo.ts) is a presentation convention; bands compare against rating.';

-- A rung that no longer converts to its intended theta is the bug this migration
-- exists to fix, so it is checked here as well as in the test suite: a seed or a
-- content edit that lands after this file has no test run standing behind it.
do $$
declare
  bad text;
begin
  select string_agg(format('%s (%s -> theta %.4f, want %.2f)',
                           t.archetype, t.display_rating, t.actual, t.intended), ', ')
    into bad
  from (
    select b.archetype,
           b.display_rating,
           (b.display_rating - 1000) / 1250.0 as actual,
           r.theta                            as intended
    from public.bots b
    join (values
      ('earnest_beginner', 0.10),
      ('casual_peer',      0.55),
      ('precise_literary', 1.10),
      ('warm_guide',       1.70),
      ('master',           2.30)
    ) as r (archetype, theta) on r.archetype = b.archetype
  ) t
  -- Half a display point is the most the integer column can cost a rung, and casual_peer pays
  -- exactly that (1687.5 rounds to 1688). Sitting a hair above the bound keeps the comparison
  -- from turning on the last bit of a double; the drift this catches is a whole rung wide.
  where abs(t.actual - t.intended) > 0.5 / 1250.0 + 1e-9;

  if bad is not null then
    raise exception 'bots: rung(s) off the display scale: %', bad;
  end if;

  raise notice 'LoxeLingo bots: % row(s) on the 0-10,000 scale, spanning % logits',
    (select count(*) from public.bots),
    (select round(((max(display_rating) - min(display_rating)) / 1250.0)::numeric, 2)
       from public.bots);
end $$;
