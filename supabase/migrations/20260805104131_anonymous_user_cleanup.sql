-- LoxeLingo — housekeeping for unconverted anonymous users.
--
-- Supabase does NOT clean up anonymous users. Play-before-signup means we mint one every time a
-- stranger taps a prompt, so without a job the auth.users table grows without bound and every
-- abandoned guest's review history sits there forever.
--
-- This migration ships the function only. It does NOT enable pg_cron and does NOT schedule
-- anything: pg_cron may not be enabled on the project, and scheduling is an operational decision.
-- See the bottom of this file and supabase/README.md for how to turn it on.

-- ---------------------------------------------------------------------------
-- What "abandoned" means: an anonymous user who has not been seen for `older_than` and who has no
-- durable footprint (no reviews, no submissions). A guest who actually played is worth keeping for
-- longer, because their review_log is training data and their rating is what conversion protects.
-- ---------------------------------------------------------------------------
create function public.delete_stale_anonymous_users(
  older_than    interval default interval '30 days',
  played_grace  interval default interval '90 days',
  max_rows      integer  default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if older_than < interval '1 day' then
    raise exception 'refusing to delete anonymous users younger than one day (got %)', older_than;
  end if;

  with candidates as (
    select u.id,
           exists (select 1 from public.review_log r where r.user_id = u.id)
             or exists (select 1 from public.submissions s where s.user_id = u.id) as has_played
      from auth.users u
      join public.profiles p on p.id = u.id
     where coalesce(u.is_anonymous, false)
       and u.deleted_at is null
       and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at), p.last_active_at)
             < now() - older_than
     limit max_rows * 4
  ),
  doomed as (
    select c.id
      from candidates c
      join auth.users u on u.id = c.id
     where (not c.has_played)
        or greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at)) < now() - played_grace
     limit max_rows
  )
  delete from auth.users u
   using doomed d
   where u.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.delete_stale_anonymous_users(interval, interval, integer) is
$c$Deletes unconverted anonymous users. Supabase does not do this for you.

Two tiers: a guest who never produced a review or a submission goes after `older_than`; a guest who
actually played is kept for `played_grace` because their review_log is training data. Deleting the
auth.users row cascades through profiles, user_worlds, user_ratings, user_concept_mastery, card,
review_log, item_presentations, daily_results, league_members, companions and companion_actions,
because every one of those FKs is `on delete cascade`.

Batched via `max_rows` so a cron tick cannot take a long lock. Call it repeatedly until it returns 0.

security definer because it writes auth.users; execute is granted to postgres/service_role only.$c$;

-- This function deletes users. Nobody with a client-side JWT may call it.
revoke execute on function public.delete_stale_anonymous_users(interval, interval, integer) from public;
revoke execute on function public.delete_stale_anonymous_users(interval, interval, integer) from anon, authenticated;
grant execute on function public.delete_stale_anonymous_users(interval, interval, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduling — do this by hand, once, after checking that pg_cron is available.
--
--   1. Dashboard -> Database -> Extensions -> enable `pg_cron` (it lives in the `extensions`
--      schema on Supabase). Do NOT `create extension` here: on a project without it the whole
--      migration fails, and enabling it changes the database's shared_preload_libraries.
--
--   2. Then, connected as `postgres`:
--
--        select cron.schedule(
--          'delete-stale-anonymous-users',
--          '30 3 * * *',                                   -- 03:30 UTC daily
--          $$ select public.delete_stale_anonymous_users(); $$
--        );
--
--   3. Verify:  select * from cron.job;
--               select * from cron.job_run_details order by start_time desc limit 10;
--
--   4. Unschedule: select cron.unschedule('delete-stale-anonymous-users');
--
-- If pg_cron is not an option, call the function from a Vercel cron route that authenticates with
-- the service-role key. It is idempotent and batched, so a retry is harmless.
-- ---------------------------------------------------------------------------
