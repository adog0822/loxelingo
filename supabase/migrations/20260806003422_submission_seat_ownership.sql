-- LoxeLingo — close the submission seat-hijack hole.
--
-- FOUND BY: schema execution verification, 2026-08-06.
--
-- THE HOLE
-- `submissions` had a FK on (match_id, seat) into match_participants, and an
-- INSERT policy requiring `user_id = auth.uid()` and participation in the
-- match. Nothing tied the *seat being claimed* to the seat the caller actually
-- occupies. So seat 1 could insert a row for seat 2 under its own user_id.
--
-- That is not a cosmetic integrity problem. `submissions_one_per_seat` is a
-- unique constraint on (match_id, seat), so the forged row PERMANENTLY consumes
-- the victim's seat: the real occupant can never submit, the match never reaches
-- two submissions, and it never judges. One request denies an opponent their
-- match, and it is repeatable against every opponent you are ever paired with.
--
-- THE FIX — two independent layers, because either alone is one bug from open.
--   1. Structural: a composite FK so the (match_id, seat, user_id) triple must
--      match an actual participant row. This binds the seat to its occupant in
--      the schema, so even service-role code cannot get it wrong.
--   2. RLS: the INSERT policy now also requires the caller to occupy that seat,
--      so the request is rejected before it reaches the constraint.
--
-- NULL SEMANTICS: bot seats carry user_id = null on both sides. A composite FK
-- under the default MATCH SIMPLE is not enforced when any column is null, so bot
-- submissions still insert. That is intended — bots are written server-side
-- under the service role. A client cannot exploit the null path because the RLS
-- policy requires user_id = auth.uid(), which is never null for a real caller.

-- ---------------------------------------------------------------------------
-- 1. Structural binding.
-- ---------------------------------------------------------------------------

-- A composite FK needs a unique constraint on the referenced columns.
-- (match_id, seat) is already the primary key, so adding user_id is trivially
-- satisfied and costs one more index.
alter table public.match_participants
  add constraint match_participants_seat_user_uq
  unique (match_id, seat, user_id);

comment on constraint match_participants_seat_user_uq on public.match_participants is
  'Exists so submissions can carry a composite FK binding a seat to its occupant. Redundant with the primary key alone; load-bearing as an FK target.';

-- ADD the three-column form ALONGSIDE the existing (match_id, seat) FK.
--
-- An earlier draft of this migration dropped `submissions_seat_fk` on the theory
-- that the wider FK implied it. It does not, for two independent reasons, and
-- dropping it would have weakened the schema while appearing to tighten it:
--
--   1. MATCH SIMPLE. A composite FK is not checked AT ALL when any referencing
--      column is null. Bot submissions carry user_id = null by design, so for
--      exactly those rows the three-column FK enforces nothing — including the
--      part that has nothing to do with identity, namely that the seat exists.
--      A bot submission could then name a (match_id, seat) that was never
--      seated, and ON DELETE CASCADE would stop reclaiming bot submissions when
--      their participant row is deleted.
--
--   2. The constraint NAME is a public interface. src/lib/match/matchmaking.ts
--      embeds the seat as `match_participants!submissions_seat_fk(...)`;
--      PostgREST cannot disambiguate a composite relationship by table name, so
--      the query names the constraint. Dropping it fails at runtime with
--      PGRST200 and matchmaking cannot build a pool.
--
-- The two are complementary, and both are required:
--   submissions_seat_fk       (match_id, seat)           the seat EXISTS  — every row
--   submissions_seat_user_fk  (match_id, seat, user_id)  the seat is YOURS — every row naming a user
alter table public.submissions
  add constraint submissions_seat_user_fk
  foreign key (match_id, seat, user_id)
  references public.match_participants (match_id, seat, user_id)
  on delete cascade;

comment on constraint submissions_seat_user_fk on public.submissions is
  'Binds a submission to the exact participant row for that seat. Prevents one player filing into an opponent''s seat, which would consume submissions_one_per_seat and lock the victim out of the match permanently.';

-- ---------------------------------------------------------------------------
-- 2. RLS binding.
-- ---------------------------------------------------------------------------

create function public.owns_match_seat(p_match_id uuid, p_seat smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_participants mp
     where mp.match_id = p_match_id
       and mp.seat     = p_seat
       and mp.user_id  = (select auth.uid())
  );
$$;

comment on function public.owns_match_seat(uuid, smallint) is
  'True when the calling user occupies this exact seat. security definer so it can read match_participants, which has no client SELECT policy.';

revoke execute on function public.owns_match_seat(uuid, smallint) from public;
grant execute on function public.owns_match_seat(uuid, smallint) to authenticated;

drop policy "submissions: insert own into own match" on public.submissions;

create policy "submissions: insert own into own seat"
  on public.submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_match_seat(match_id, seat)
  );

-- is_match_participant() is now implied by owns_match_seat(): occupying a seat
-- in the match is a strictly stronger condition than participating in it.

create index if not exists match_participants_seat_user_idx
  on public.match_participants (match_id, seat, user_id)
  where user_id is not null;
