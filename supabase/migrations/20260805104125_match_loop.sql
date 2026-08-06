-- LoxeLingo — the match loop: async "ghost" matches, submissions, comparative judgments,
-- and the human-labeled gold set the judge is calibrated against.
--
-- Judging invariants that the schema enforces or records, per the plan doc Phase 5:
--   * comparative only (there is no absolute-score column);
--   * BOTH position orderings are stored separately, plus the aggregated Bradley-Terry score,
--     so order-swap disagreement is a queryable rate rather than a lost signal;
--   * the judge model AND its version string are required, not optional;
--   * the EXACT rubric text shown to the judge is stored on the judgment, not referenced by id,
--     because a rubric row could later be edited and the judgment would silently change meaning.

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  world_slug      text        not null references public.worlds (slug) on delete restrict,
  ladder_slug     text        not null references public.ladders (slug) on delete restrict,
  season_id       integer     references public.seasons (id) on delete set null,
  item_id         bigint      references public.items (id) on delete set null,

  -- Snapshot of what was actually shown. Items can be edited or retired; a match must stay legible.
  prompt_snapshot jsonb,
  constraint_text text,
  time_limit_ms   integer check (time_limit_ms is null or time_limit_ms > 0),

  status          text        not null default 'awaiting_opponent'
                    check (status in ('awaiting_opponent', 'judging', 'complete', 'abandoned', 'void')),
  -- 'ghost' = matched against a stored performance (the default architecture).
  source          text        not null default 'ghost'
                    check (source in ('ghost', 'direct_challenge', 'live')),
  is_rated        boolean     not null default true,

  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

comment on table public.matches is
  'Async performance-pool matchmaking: the opponent need not be online. Density is a function of cumulative, not concurrent, players.';
comment on column public.matches.prompt_snapshot is
  'What was shown, frozen. Never re-read items to re-render an old match.';

create index matches_world_ladder_status_idx on public.matches (world_slug, ladder_slug, status);
create index matches_created_idx on public.matches (created_at desc);

-- item_presentations.match_id was created FK-less because matches did not exist yet.
alter table public.item_presentations
  add constraint item_presentations_match_fk
  foreign key (match_id) references public.matches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- match_participants — two seats per match. Bots occupy a seat and are ALWAYS labeled.
-- ---------------------------------------------------------------------------
create table public.match_participants (
  match_id       uuid    not null references public.matches (id) on delete cascade,
  user_id        uuid    references auth.users (id) on delete cascade,   -- null only for a bot seat
  seat           smallint not null check (seat in (1, 2)),

  is_bot         boolean not null default false,
  bot_slug       text,                                -- named character; surfaced in the UI and the API

  submitted_at   timestamptz,
  theta_before   double precision,
  theta_after    double precision,
  rating_before  double precision,
  rating_after   double precision,
  rating_delta   double precision generated always as (rating_after - rating_before) stored,
  result         text    not null default 'pending' check (result in ('pending', 'win', 'loss', 'draw', 'void')),

  created_at     timestamptz not null default now(),
  primary key (match_id, seat),
  constraint match_participants_bot_xor_user check (
    (is_bot and user_id is null and bot_slug is not null)
    or (not is_bot and user_id is not null and bot_slug is null)
  )
);

comment on table public.match_participants is
  'One row per seat. is_bot is not nullable and a bot seat cannot carry a user_id: a client can never mistake a bot for a human.';

-- Unique per human per match, and the index the RLS predicates ride on.
create unique index match_participants_user_match_key
  on public.match_participants (user_id, match_id) where user_id is not null;
create index match_participants_user_idx on public.match_participants (user_id);

-- ---------------------------------------------------------------------------
-- Participation helpers. security definer so a policy on match_participants can ask
-- "am I in this match?" without recursing into its own RLS.
-- ---------------------------------------------------------------------------
create function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.match_participants mp
     where mp.match_id = p_match_id
       and mp.user_id = (select auth.uid())
  );
$$;

comment on function public.is_match_participant(uuid) is
  'security definer to break RLS recursion on match_participants. Reads only the caller''s own membership.';

revoke execute on function public.is_match_participant(uuid) from public;
grant execute on function public.is_match_participant(uuid) to authenticated, service_role;

-- has_own_submission() is defined below, immediately after public.submissions: a `language sql`
-- body is parsed and its relations resolved at CREATE time (check_function_bodies), so it cannot
-- be declared before the table it reads.

-- ---------------------------------------------------------------------------
-- submissions — a participant's answer. Append-only: a submission is final.
-- ---------------------------------------------------------------------------
create table public.submissions (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches (id) on delete cascade,
  user_id           uuid references auth.users (id) on delete cascade,   -- null for a bot submission
  seat              smallint not null check (seat in (1, 2)),

  content           text,                             -- DUEL/FORGE text production
  media_path        text,                              -- storage path; RECALL is playback-only, never a recording
  selected_option   text,                              -- RECALL/FORGE closed answers

  elapsed_ms        integer check (elapsed_ms is null or elapsed_ms >= 0),
  -- Integrity signals (plan doc Phase 11). Never surfaced as an accusation, only scored.
  paste_detected    boolean not null default false,
  keystroke_features jsonb,
  client_tz         text,
  integrity_flags   jsonb,

  submitted_at      timestamptz not null default now(),
  constraint submissions_one_per_seat unique (match_id, seat),
  -- The seat must exist before it can answer, and it must be the same seat this user occupies.
  constraint submissions_seat_fk foreign key (match_id, seat)
    references public.match_participants (match_id, seat) on delete cascade
);

comment on table public.submissions is
  'Append-only. No UPDATE or DELETE policy: an answer under a time limit that can be edited afterwards is not a rated answer.';
comment on column public.submissions.media_path is
  'RECALL is playback-only by design, so there is no recording upload path and no moderation surface.';

create index submissions_match_idx on public.submissions (match_id);
create index submissions_user_idx on public.submissions (user_id);

-- The reveal rule: you see your opponent's answer only after you have committed your own.
-- Declared here, not next to is_match_participant(), because it reads public.submissions and a
-- `language sql` body is validated against the catalog at CREATE time.
create function public.has_own_submission(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.submissions s
     where s.match_id = p_match_id
       and s.user_id = (select auth.uid())
  );
$$;

comment on function public.has_own_submission(uuid) is
  'security definer so the submissions SELECT policy can ask "have I committed yet?" without recursing into its own RLS.';

revoke execute on function public.has_own_submission(uuid) from public;
grant execute on function public.has_own_submission(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- judgments — comparative verdict for one match.
-- ---------------------------------------------------------------------------
create table public.judgments (
  id                    uuid primary key default gen_random_uuid(),
  match_id              uuid not null references public.matches (id) on delete cascade,

  -- === run 1: submissions presented A then B ===
  order_ab_favored_user_id uuid references auth.users (id) on delete set null,  -- null = tie
  order_ab_verdict         text not null check (order_ab_verdict in ('first', 'second', 'tie')),
  order_ab_axis_scores     jsonb,                     -- per-rubric-axis scores, as returned
  order_ab_reasoning       text,                      -- emitted BEFORE the verdict, per the pipeline
  order_ab_raw             jsonb,

  -- === run 2: the SAME pair, presented B then A ===
  order_ba_favored_user_id uuid references auth.users (id) on delete set null,
  order_ba_verdict         text not null check (order_ba_verdict in ('first', 'second', 'tie')),
  order_ba_axis_scores     jsonb,
  order_ba_reasoning       text,
  order_ba_raw             jsonb,

  -- Position bias made queryable rather than averaged away.
  position_disagreement boolean generated always as
    (order_ab_favored_user_id is distinct from order_ba_favored_user_id) stored,

  -- === aggregation ===
  bt_p_seat1_beats_seat2 double precision
    check (bt_p_seat1_beats_seat2 is null or (bt_p_seat1_beats_seat2 >= 0 and bt_p_seat1_beats_seat2 <= 1)),
  bt_score_seat1        double precision,             -- Bradley-Terry strength, logit scale
  bt_score_seat2        double precision,
  -- Ties are half a win plus half a loss (Chatbot Arena convention, 03-learning-libs 8.2).
  outcome_seat1         real check (outcome_seat1 in (0, 0.5, 1)),
  verdict               text not null check (verdict in ('seat1', 'seat2', 'draw', 'unresolved')),
  verdict_summary       text,                          -- the one line shown on the verdict screen

  -- === provenance: required, not optional ===
  judge_model           text not null,
  judge_model_version   text not null,
  judge_provider        text,
  judge_temperature     real,
  rubric_version        text not null,
  rubric_text           text not null,                -- the EXACT text shown to the judge
  rubric_hash           text generated always as (md5(rubric_text)) stored,

  prompt_tokens         integer,
  completion_tokens     integer,
  latency_ms            integer,
  cost_usd              numeric(10, 6),

  is_current            boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on table public.judgments is
  'Comparative only — there is no absolute-score column by design. Both position orderings are stored separately; reordering flipped outcomes on 66 of 80 queries in the ACL 2024 study, so the disagreement rate is a first-class metric.';
comment on column public.judgments.rubric_text is
  'Stored inline, not referenced. A rubric row could be edited later and every past judgment would silently change meaning.';
comment on column public.judgments.position_disagreement is
  'Generated. Alarm on the rate of this across judgments; it is the judge''s position-bias signal.';

create unique index judgments_one_current_per_match_idx
  on public.judgments (match_id) where is_current;
create index judgments_match_idx on public.judgments (match_id);
create index judgments_disagreement_idx on public.judgments (created_at)
  where position_disagreement;

-- ---------------------------------------------------------------------------
-- judge_gold_labels — the human-labeled calibration set. Cohen's kappa against this gates whether
-- a judge's output is ever allowed to move a user's rating. Internal tooling only.
-- ---------------------------------------------------------------------------
create table public.judge_gold_labels (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid references public.matches (id) on delete set null,
  submission_a_id  uuid not null references public.submissions (id) on delete cascade,
  submission_b_id  uuid not null references public.submissions (id) on delete cascade,

  human_verdict    text not null check (human_verdict in ('a', 'b', 'tie')),
  labeler_id       uuid references auth.users (id) on delete set null,
  labeler_kind     text not null default 'internal' check (labeler_kind in ('internal', 'native_speaker', 'contractor')),
  confidence       smallint check (confidence between 1 and 5),
  notes            text,

  -- The rubric the HUMAN saw. Kappa is only meaningful if it matches the judge's rubric_version.
  rubric_version   text not null,
  rubric_text      text not null,

  is_active        boolean not null default true,
  labeled_at       timestamptz not null default now(),
  constraint judge_gold_labels_distinct_pair check (submission_a_id <> submission_b_id),
  constraint judge_gold_labels_one_per_labeler unique (submission_a_id, submission_b_id, labeler_id)
);

comment on table public.judge_gold_labels is
  'Calibrate with Cohen''s kappa, never raw agreement. An always-pass judge must fail this gate. Not exposed to clients.';

create index judge_gold_labels_rubric_idx on public.judge_gold_labels (rubric_version) where is_active;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.matches            enable row level security;
alter table public.match_participants enable row level security;
alter table public.submissions        enable row level security;
alter table public.judgments          enable row level security;
alter table public.judge_gold_labels  enable row level security;

create policy "matches: select own matches"
  on public.matches for select to authenticated
  using (public.is_match_participant(id));

create policy "match_participants: select seats in own matches"
  on public.match_participants for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_match_participant(match_id)
  );

-- Own submission always; the opponent's only once you have committed yours. This is the reveal
-- rule from the spec ("then you see theirs") expressed as a policy rather than as UI politeness.
create policy "submissions: select own, or opponent's after committing"
  on public.submissions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (public.is_match_participant(match_id) and public.has_own_submission(match_id))
  );

create policy "submissions: insert own into own match"
  on public.submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_match_participant(match_id)
  );

-- No UPDATE and no DELETE policy on submissions: an answer is final.

create policy "judgments: select for own matches"
  on public.judgments for select to authenticated
  using (public.is_match_participant(match_id));

-- judge_gold_labels: RLS enabled with no policy = deny-all for clients.
-- Matchmaking, rating updates and judging all run server-side under the service role, so there is
-- no client INSERT policy on matches, match_participants or judgments.

grant select on public.matches to authenticated;
grant select on public.match_participants to authenticated;
grant select, insert on public.submissions to authenticated;
grant select on public.judgments to authenticated;

grant all on public.matches            to service_role;
grant all on public.match_participants to service_role;
grant all on public.submissions        to service_role;
grant all on public.judgments          to service_role;
grant all on public.judge_gold_labels  to service_role;
