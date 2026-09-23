-- ForgeFit — the social layer.
--
-- Everything before this migration was owner-only: no row in this database
-- was readable by anyone but the person it belonged to. This migration is the
-- first time that changes, so it is worth being explicit about the rules it
-- holds to, because a mistake here exposes where somebody lives.
--
--  1. NO HEALTH DATA CROSSES A USER BOUNDARY. `profiles` stays owner-only and
--     is not touched. Weight, age, sex, bodyfat, nutrition, sleep, cycle,
--     bloodwork and protocol data have no representation in any table below,
--     and cannot be reached through one. The public identity is a SEPARATE
--     table with no health columns in it, so there is no policy mistake that
--     could leak them — the columns are simply not there.
--  2. NOTHING IS SHARED UNLESS IT IS PUT HERE DELIBERATELY. There is no
--     trigger copying activities into `shared_activities`. The app writes a
--     row when the athlete chooses to share that one activity, and the
--     default visibility of a new athlete is 'private'.
--  3. ROUTES ARE TRIMMED BEFORE THEY ARRIVE. `route` holds the polyline that
--     privacy zones have already cut out of; the untrimmed track never leaves
--     the device. The database cannot verify that, so the app is the only
--     place it can be got right, and `domain/social.ts` is where it happens
--     under test.
--  4. VISIBILITY IS PER ACTIVITY, NOT JUST PER ATHLETE. A public athlete can
--     still keep one run to themselves, and the row-level policy enforces it
--     rather than the client hiding it.

create extension if not exists "citext";

-- ─────────────────────────────────────────────────────────────
-- ATHLETES — the public face. Deliberately separate from `profiles`.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.athletes (
  id uuid primary key references auth.users(id) on delete cascade,
  -- citext so "@Alice" and "@alice" cannot both exist; people read handles as
  -- case-insensitive whatever the database thinks.
  handle citext unique,
  display_name text,
  avatar_url text,
  bio text,
  -- Free text the athlete typed, never a coordinate. "Leeds" is fine to show;
  -- a lat/lon of where they run from is not, and there is nowhere to put one.
  location_text text,
  -- 'private'   — nobody can find or follow them; the default.
  -- 'followers' — visible to accepted followers; follows need approval.
  -- 'public'    — visible to any signed-in user; follows are automatic.
  visibility text not null default 'private'
    check (visibility in ('private', 'followers', 'public')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint athletes_handle_shape check (
    handle is null or handle ~ '^[a-z0-9_]{3,20}$'
  )
);

create index if not exists athletes_visibility_idx on public.athletes (visibility)
  where visibility <> 'private';

-- ─────────────────────────────────────────────────────────────
-- FOLLOWS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  -- Following yourself makes the feed query wrong and means nothing.
  constraint follows_not_self check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx on public.follows (followee_id, status);

-- ─────────────────────────────────────────────────────────────
-- SHARED ACTIVITIES
--
-- A copy, not a reference. The athlete's own activity history lives on the
-- device and in their owner-only tables; this is the subset they published,
-- with the fields they published. Deleting the share must not delete the
-- activity, and editing the activity must not silently republish it.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shared_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The app's own activity id, so a second share of the same activity
  -- replaces the first rather than stacking up.
  local_id text not null,
  kind text not null default 'run',
  title text,
  note text,
  occurred_on date not null,
  distance_m numeric,
  moving_seconds int,
  elevation_gain_m numeric,
  -- Encoded polyline, ALREADY trimmed to the athlete's privacy zones. Null is
  -- a valid and common value: a gym session has no route, and an athlete may
  -- share the numbers without the map.
  route text,
  visibility text not null default 'followers'
    check (visibility in ('private', 'followers', 'public')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, local_id)
);

create index if not exists shared_activities_feed_idx
  on public.shared_activities (user_id, occurred_on desc);

-- ─────────────────────────────────────────────────────────────
-- KUDOS and COMMENTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.kudos (
  activity_id uuid not null references public.shared_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (activity_id, user_id)
);

create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.shared_activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz default now()
);

create index if not exists activity_comments_activity_idx
  on public.activity_comments (activity_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- CLUBS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 60),
  slug citext unique,
  description text,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  created_at timestamptz default now(),
  constraint clubs_slug_shape check (slug is null or slug ~ '^[a-z0-9-]{3,40}$')
);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz default now(),
  primary key (club_id, user_id)
);

create index if not exists club_members_user_idx on public.club_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- VISIBILITY HELPERS
--
-- All SECURITY DEFINER and STABLE. They have to be: a policy on `follows`
-- that asks "is there an accepted follow?" by selecting from `follows` would
-- re-enter that same policy and recurse forever. Running as the definer reads
-- the base table directly, which is the documented way out.
--
-- `search_path` is pinned on every one of them. Without it, a caller can
-- prepend a schema of their own and have these resolve to their tables
-- instead — which on a SECURITY DEFINER function is a privilege escalation,
-- not a style point.
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_accepted_follower(follower uuid, followee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = follower
      and f.followee_id = followee
      and f.status = 'accepted'
  );
$$;

create or replace function public.athlete_visibility(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select a.visibility from public.athletes a where a.id = target), 'private');
$$;

/**
 * Whether the calling user may see anything at all about `target`.
 *
 * Yourself always. A public athlete to any signed-in user. A 'followers'
 * athlete only to somebody whose follow they accepted. A private athlete to
 * nobody — including people who followed them before they went private, which
 * is the behaviour somebody flipping that switch is asking for.
 */
create or replace function public.can_view_athlete(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when auth.uid() = target then true
    when public.athlete_visibility(target) = 'public' then true
    when public.athlete_visibility(target) = 'followers'
      then public.is_accepted_follower(auth.uid(), target)
    else false
  end;
$$;

/**
 * Whether the calling user may see one shared activity.
 *
 * The athlete-level gate is applied first and then the activity's own, so a
 * 'public' activity belonging to an athlete who has since gone private stops
 * being visible. Going private has to mean it retroactively, or the switch is
 * a lie.
 */
create or replace function public.can_view_activity(activity uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_activities s
    where s.id = activity
      and (
        s.user_id = auth.uid()
        or (
          public.can_view_athlete(s.user_id)
          and (
            s.visibility = 'public'
            or (s.visibility = 'followers' and public.is_accepted_follower(auth.uid(), s.user_id))
          )
        )
      )
  );
$$;

create or replace function public.is_club_member(club uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members m where m.club_id = club and m.user_id = who
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table public.athletes enable row level security;
alter table public.follows enable row level security;
alter table public.shared_activities enable row level security;
alter table public.kudos enable row level security;
alter table public.activity_comments enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

-- ---- athletes ----
drop policy if exists "athletes_select" on public.athletes;
create policy "athletes_select" on public.athletes
  for select using (id = auth.uid() or public.can_view_athlete(id));

drop policy if exists "athletes_write_own" on public.athletes;
create policy "athletes_write_own" on public.athletes
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ---- follows ----
-- Both ends of a follow can see it: the follower needs to know the request is
-- still pending, and the followee needs to be able to act on it.
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows
  for select using (follower_id = auth.uid() or followee_id = auth.uid());

-- You may create a follow only as yourself, and only towards somebody who is
-- findable at all. Requests to a private athlete are refused at the database,
-- not merely hidden in the UI.
drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows
  for insert with check (
    follower_id = auth.uid()
    and public.athlete_visibility(followee_id) in ('public', 'followers')
  );

-- Only the person being followed can accept. The follower updating their own
-- row to 'accepted' would be self-approval, so their policy is delete-only.
drop policy if exists "follows_update_followee" on public.follows;
create policy "follows_update_followee" on public.follows
  for update using (followee_id = auth.uid()) with check (followee_id = auth.uid());

-- Either side can end it: unfollow, or remove a follower.
drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows
  for delete using (follower_id = auth.uid() or followee_id = auth.uid());

-- ---- shared activities ----
drop policy if exists "shared_activities_select" on public.shared_activities;
create policy "shared_activities_select" on public.shared_activities
  for select using (
    user_id = auth.uid()
    or (
      public.can_view_athlete(user_id)
      and (
        visibility = 'public'
        or (visibility = 'followers' and public.is_accepted_follower(auth.uid(), user_id))
      )
    )
  );

drop policy if exists "shared_activities_write_own" on public.shared_activities;
create policy "shared_activities_write_own" on public.shared_activities
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- kudos ----
drop policy if exists "kudos_select" on public.kudos;
create policy "kudos_select" on public.kudos
  for select using (public.can_view_activity(activity_id));

-- Giving kudos requires being able to see the activity — otherwise the table
-- becomes a way to probe which activity ids exist.
drop policy if exists "kudos_insert" on public.kudos;
create policy "kudos_insert" on public.kudos
  for insert with check (user_id = auth.uid() and public.can_view_activity(activity_id));

drop policy if exists "kudos_delete" on public.kudos;
create policy "kudos_delete" on public.kudos
  for delete using (user_id = auth.uid());

-- ---- comments ----
drop policy if exists "activity_comments_select" on public.activity_comments;
create policy "activity_comments_select" on public.activity_comments
  for select using (public.can_view_activity(activity_id));

drop policy if exists "activity_comments_insert" on public.activity_comments;
create policy "activity_comments_insert" on public.activity_comments
  for insert with check (user_id = auth.uid() and public.can_view_activity(activity_id));

-- The comment's author can delete it; so can the owner of the activity it is
-- on, which is the only moderation tool a small app needs.
drop policy if exists "activity_comments_delete" on public.activity_comments;
create policy "activity_comments_delete" on public.activity_comments
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.shared_activities s
      where s.id = activity_id and s.user_id = auth.uid()
    )
  );

-- ---- clubs ----
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs
  for select using (visibility = 'public' or public.is_club_member(id, auth.uid()));

drop policy if exists "clubs_write_owner" on public.clubs;
create policy "clubs_write_owner" on public.clubs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---- club members ----
-- A member list is visible to members, and to anyone who can see a public
-- club. A private club's roster stays inside it.
drop policy if exists "club_members_select" on public.club_members;
create policy "club_members_select" on public.club_members
  for select using (
    user_id = auth.uid()
    or public.is_club_member(club_id, auth.uid())
    or exists (select 1 from public.clubs c where c.id = club_id and c.visibility = 'public')
  );

-- Joining is self-service for a public club; a private club's members are
-- added by its owner.
drop policy if exists "club_members_join" on public.club_members;
create policy "club_members_join" on public.club_members
  for insert with check (
    (user_id = auth.uid() and exists (
      select 1 from public.clubs c where c.id = club_id and c.visibility = 'public'
    ))
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

-- Leave a club yourself, or be removed by its owner.
drop policy if exists "club_members_leave" on public.club_members;
create policy "club_members_leave" on public.club_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────
create trigger athletes_updated before update on public.athletes
  for each row execute function public.set_updated_at();

create trigger shared_activities_updated before update on public.shared_activities
  for each row execute function public.set_updated_at();

-- A new user gets a private athlete row so the rest of the app can assume one
-- exists. Private means it changes nothing until they choose otherwise.
create or replace function public.handle_new_athlete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.athletes (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_athlete on auth.users;
create trigger on_auth_user_created_athlete after insert on auth.users
  for each row execute function public.handle_new_athlete();

-- Existing users predate the trigger above and would otherwise have no row.
insert into public.athletes (id)
select u.id from auth.users u
on conflict do nothing;

-- A club's owner is a member of it, with the owner role.
create or replace function public.handle_new_club()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_members (club_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_club_created on public.clubs;
create trigger on_club_created after insert on public.clubs
  for each row execute function public.handle_new_club();
