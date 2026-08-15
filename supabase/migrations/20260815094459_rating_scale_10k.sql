-- Rating display rescaled to 0-10,000.
--
-- Presentation only. Ability stays on the logit scale so it keeps composing
-- with Bradley-Terry and the logistic knowledge tracer. This changes what a
-- number LOOKS like, never what it means.
--
--   display = 1000 + 1250 * theta
--
--     theta  0.0  ->  1000   a new account
--     theta  0.64 ->  1800   Ridge, the first threshold crossing
--     theta  7.2  -> 10,000  the summit
--
-- Safe to redefine rather than migrate: user_ratings is empty, verified by
-- count before writing this. No player has ever held a rating on the old scale,
-- so nobody's number changes underneath them, which is the one thing a rating
-- system must never do casually. That property is why this lands now instead of
-- after launch.
--
-- MUST MATCH DISPLAY_INIT / DISPLAY_SCALE in src/lib/engine/elo.ts. The formula
-- is written twice because Postgres cannot call TypeScript, and
-- src/lib/engine/display-scale.test.ts reads THIS FILE and fails on a one-sided
-- edit. That guard exists because three inconsistent formulas once shipped at
-- the same time and one player displayed different ratings on different screens.

alter table public.user_ratings
  drop column rating,
  drop column peak_rating;

alter table public.user_ratings
  add column rating double precision
    generated always as (1000 + 1250 * theta) stored,
  add column peak_rating double precision
    generated always as (1000 + 1250 * peak_theta) stored;

comment on column public.user_ratings.rating is
  'Display rating on the 0-10,000 scale. Generated from theta; never written directly. Mirror of DISPLAY_INIT/DISPLAY_SCALE in src/lib/engine/elo.ts.';
comment on column public.user_ratings.peak_rating is
  'Highest display rating ever held. Permanent: peak is the one number that only moves up.';
