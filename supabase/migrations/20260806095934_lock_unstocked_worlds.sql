-- Lock the worlds that have no content.
--
-- `is_launched` gates the world-select screen. Korean and Mandarin were seeded
-- true while holding zero items, so two of the seven doors on the first screen a
-- user ever sees opened onto a dead end. Spanish, French and German were already
-- false and correctly produced the honest "has no content yet" screen.
--
-- v1 ships Japanese and English only. Korean and Mandarin are the v1.5 wedge --
-- deliberately next, because CJK is where the incumbent is weakest and where
-- demand is most intense. Spanish, French and German are v2, and are last on
-- purpose: Spanish is the biggest market and also where Duolingo is strongest,
-- so it is the worst place to fight first.
--
-- The rule this encodes: `is_launched` means PLAYABLE, not IMPLEMENTED. A world
-- with a name, a hue, a font stack and no items is implemented. It is not
-- playable, and the flag must not claim otherwise.
--
-- Re-runnable. Scoped by slug rather than by a subquery on item counts, because
-- a world must not silently launch itself the moment its first item lands: one
-- item is not a stocked ladder, and a bot pool is a separate requirement on top.

update public.worlds
   set is_launched = false
 where slug in ('ko', 'zh-Hans');

comment on column public.worlds.is_launched is
  'PLAYABLE, not implemented. Requires stocked ladders AND a bot performance pool. Flipping this without both is how a user reaches a dead end from world select.';
