-- English — the seventh world.
--
-- WHY THIS WORLD IS NOT LIKE THE OTHER SIX
-- The six launch worlds are all foreign languages *for a US native English speaker*: the
-- learner reads the instructions in their first language and produces in a second. English
-- inverts that. Nobody whose first language is English needs this world, so every learner in
-- it is a non-native speaker, and the instruction text is itself second-language input.
-- That is the constraint the content seed is authored under (supabase/seeds/english-content.sql):
-- short, concrete task lines, no idiom in the instruction, never an instruction that is harder
-- than the item it introduces.
--
-- HUE 120, AND WHY IT IS NOT NEXT TO ANYTHING
-- The `hue` column is an OKLCH hue angle (verified: #D3C7FF is h294.5, #62D7AB is h165.9, and
-- so on down the table). The six taken angles are 72, 166, 196, 244, 294, 322. The arcs between
-- them are 94, 30, 48, 50, 28 and 110 degrees wide, so on hue distance alone the two candidate
-- landing zones are ~119 (the middle of the Spanish -> Korean arc) and ~17 (the middle of the
-- French -> Spanish arc, through red).
--
-- Red is disqualified by design-system 2.6, not by spacing: `--signal-error` (#E8757A) sits at
-- OKLCH h18.8 and the rose-gold earned-light ramp occupies h33-47. "Red means the system is
-- broken, and appears perhaps four times in the product" is the separation that does the most
-- work in this product; a whole world painted 15 degrees off it would spend that separation.
--
-- 120 is what is left, and it is genuinely the roomiest slot: measured as OKLab dE between the
-- candidate's atmos/mark steps and all twelve existing world atmos/mark steps, h120 scores
-- min dE 0.101 -- the joint maximum over the whole wheel -- and stays 0.086 clear of every
-- semantic token (`--signal-error` h19, `--signal-warn` h79, `--verdict-loss` h264,
-- `--verdict-draw`/`--signal-info` h273, gold-400/500 h38-43). In degrees it is 48 from
-- Spanish (72) and 46 from Korean (166), both comfortably wider than the tightest spacing the
-- system already ships (Japanese 294 / French 322, 28 degrees).
--
-- It is a second green-family world, and Korean's jade is the neighbour to watch. They separate
-- on chroma direction rather than on lightness: Korean is a cool blue-green sea-light
-- (#62D7AB, h166) and English is a warm yellow-green lichen (#B9D06B, h120) -- mint versus moss
-- at the same L. Design-system rule 2 (identity = native name + Latin name + globe art + hue,
-- never hue alone) is what carries the rest, and it is the same guarantee every other pair
-- relies on. Rule 5 is untouched: green still appears in no feedback, verdict or state surface,
-- because there is no green in the semantic set at all.
--
-- PALETTE STEPS. Computed, not eyeballed, against the same targets 2.5 states:
--   atmos #B9D06B  L0.819 C0.130  10.9:1 on Night  (band: 8.11-11.83)
--   mark  #768C02  L0.601 C0.142   4.9:1 on Night  (band: 4.3-5.7, 2.5 rule 3)
--   deep  #2A3201  L0.299 C0.069  tint bed / horizon (others sit at L0.30 +/- 0.02)
--   dusk  #516003  L0.460 C0.108   5.2:1 on Dusk #F3D9C9  (band: 4.42-5.78)
--
-- `is_launched = true`: unlike es/fr/de this world ships with content behind it
-- (supabase/seeds/english-content.sql: 34 concepts, 35 items).

insert into public.worlds
  (slug, name_en, native_name, concept, hue, atmos_hex, mark_hex, deep_hex, dusk_hex, display_order, is_launched)
values
  ('en', 'English', 'English',
   'The Lichen Steppe. A low green airglow over open rock, a bright star-band overhead.',
   120, '#B9D06B', '#768C02', '#2A3201', '#516003', 7, true)
on conflict (slug) do update set
  name_en       = excluded.name_en,
  native_name   = excluded.native_name,
  concept       = excluded.concept,
  hue           = excluded.hue,
  atmos_hex     = excluded.atmos_hex,
  mark_hex      = excluded.mark_hex,
  deep_hex      = excluded.deep_hex,
  dusk_hex      = excluded.dusk_hex,
  display_order = excluded.display_order,
  is_launched   = excluded.is_launched;

comment on table public.worlds is
  'The seven languages-as-places. Hue encodes place, never data, state, correctness or rank. Six are foreign languages for an English speaker; `en` is the inverse -- a world only non-native speakers enter.';
