-- items.external_id — a stable, human-authored natural key for content rows.
--
-- Why this exists:
--   `items` has an identity primary key and no other unique column, so there is no key an
--   idempotent content seed can conflict on. Without one, `supabase/seed.sql` can only be made
--   re-runnable by deleting and re-inserting, which churns `items.id` and cascades through
--   `item_presentations` / `item_stats` / `matches.item_id` — i.e. it would destroy calibration
--   and match history every time content is re-published.
--
--   `external_id` is that key. It is authored by hand in the content source (e.g.
--   'ja-forge-kanji-tegami'), never generated, and never reused for different content: renaming
--   the key is how you retire an item and publish a new one.
--
-- Nullable on purpose. Items created by a future pipeline or by an admin UI have no authored key,
-- and a plain UNIQUE index treats NULLs as distinct, so any number of them may coexist.
-- (NULLS NOT DISTINCT is deliberately NOT used here — that would allow exactly one keyless item.)

alter table public.items
  add column external_id text;

comment on column public.items.external_id is
  'Stable hand-authored content key, e.g. ''ja-forge-kanji-tegami''. The ON CONFLICT target that makes supabase/seed.sql idempotent. Null for items with no authored source. Never reuse a key for different content.';

-- The conflict target. Plain unique (not partial) so `on conflict (external_id)` needs no
-- index predicate; NULLs are distinct in a Postgres unique index, so keyless rows are unaffected.
create unique index items_external_id_key on public.items (external_id);

-- Shape guard: this is a key, not prose. Lowercase, digits, hyphens.
alter table public.items
  add constraint items_external_id_shape
  check (external_id is null or external_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- No grant or policy change: `items` remains deny-all for anon/authenticated (the row carries
-- `answer`), and service_role already holds `grant all` from the static-config migration.
