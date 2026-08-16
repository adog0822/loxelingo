-- altitude_band() was left behind by the rescale to 0-10,000.
--
-- It still cut at 900/1100/1300/1550/1800/2100, which were the floors under
-- `900 + 400 * theta`. On the current scale that function was wrong in two
-- ways at once:
--
--   altitude_band(1800) returned 'Exosphere', while src/lib/design/altitude.ts
--   calls 1800 the floor of 'Ridge'. Two answers for one player.
--
--   Everything at or above 2100 returned 'Meridian', so the top four bands
--   collapsed into one. A player at 2800 and a player at 8800 were shown the
--   same summit, and the four crossings between them stopped existing.
--
-- This is the third place the same rescale left stale, after BAND_STEPS_DISPLAY
-- and the bot roster. The pattern in all three: a number derived from
-- DISPLAY_SCALE, written down somewhere that cannot see DISPLAY_SCALE.
--
-- No product decision is being made here. The floors in
-- src/lib/design/altitude.ts are the decision and they already shipped; this
-- mirrors them so both sides agree. src/lib/design/altitude-band-sql.test.ts
-- reads THIS FILE and fails on a one-sided edit, which is the same guard
-- display-scale.test.ts puts on the rating formula.
--
--   MUST MATCH the `floor` values of BANDS in src/lib/design/altitude.ts.

create or replace function public.altitude_band(rating double precision)
returns text
language sql
immutable parallel safe
set search_path to ''
as $$
  select case
    when rating is null then null
    when rating < 1000  then 'Valley Floor'
    when rating < 1800  then 'Treeline'
    when rating < 2800  then 'Ridge'
    when rating < 4400  then 'Above the Deck'
    when rating < 6400  then 'The Long Light'
    when rating < 8800  then 'Exosphere'
    else                     'Meridian'
  end;
$$;

comment on function public.altitude_band(double precision) is
  'Display band for a rating on the 0-10,000 scale. Mirror of BANDS in src/lib/design/altitude.ts; a band floor is a threshold players cross, so the two sides must never disagree.';

-- Prove the mirror at apply time rather than trusting the arithmetic above.
do $$
declare
  expected text[] := array[
    'Valley Floor', 'Treeline', 'Ridge', 'Above the Deck',
    'The Long Light', 'Exosphere', 'Meridian'
  ];
  floors double precision[] := array[0, 1000, 1800, 2800, 4400, 6400, 8800];
  i int;
begin
  -- Each floor reports its own band, and one point below it reports the band
  -- underneath. A floor that is off by one point is a player told they crossed
  -- something they did not.
  for i in 2 .. array_length(floors, 1) loop
    if public.altitude_band(floors[i]) is distinct from expected[i] then
      raise exception 'altitude_band(%) returned %, expected %',
        floors[i], public.altitude_band(floors[i]), expected[i];
    end if;
    if public.altitude_band(floors[i] - 1) is distinct from expected[i - 1] then
      raise exception 'altitude_band(%) returned %, expected % just below the floor',
        floors[i] - 1, public.altitude_band(floors[i] - 1), expected[i - 1];
    end if;
  end loop;

  if public.altitude_band(null) is not null then
    raise exception 'altitude_band(null) must stay null';
  end if;

  raise notice 'altitude_band mirrors all % bands in altitude.ts', array_length(floors, 1);
end $$;
