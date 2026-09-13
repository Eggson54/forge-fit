-- ForgeFit — initial schema with Row Level Security.
-- Every table is scoped to auth.uid(); users can only read/write their own rows.
-- Health data is treated as sensitive: no cross-user access is ever granted.

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Helper: updated_at trigger
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────
-- PROFILES (1:1 with auth.users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  sex text default 'prefer_not_say',
  age int,
  height_cm numeric,
  weight_kg numeric,
  target_weight_kg numeric,
  goal text default 'recomposition',
  activity_level text default 'moderate',
  experience text default 'beginner',
  training_days_per_week int default 4,
  preferred_workout_minutes int default 45,
  equipment text[] default '{bodyweight}',
  dietary_preferences text[] default '{none}',
  units text default 'imperial',
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Targets + coach + discipline settings (kept 1:1 with a profile)
create table if not exists public.goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calories int default 2200,
  protein_g int default 150,
  carbs_g int default 220,
  fat_g int default 70,
  water_oz int default 100,
  steps int default 10000,
  sleep_minutes int default 480,
  discipline_weights jsonb default '{"workout":25,"nutrition":25,"protein":20,"steps":10,"water":10,"sleep":10}',
  updated_at timestamptz default now()
);

create table if not exists public.coach_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  personality text default 'motivational',
  aggression int default 50,
  allow_aggressive_language boolean default true,
  enabled boolean default true,
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- EXERCISES (custom, per-user; the base library ships in the app)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] default '{}',
  equipment text default 'full_gym',
  category text default 'compound',
  difficulty text default 'beginner',
  instructions text[] default '{}',
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- WORKOUTS / WORKOUT_EXERCISES / SETS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text default 'planned',
  date date not null,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds int,
  focus text[] default '{}',
  notes text,
  created_at timestamptz default now()
);
create index if not exists workouts_user_date on public.workouts(user_id, date desc);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null,
  name text not null,
  primary_muscle text,
  rest_seconds int default 120,
  target_reps int,
  position int default 0,
  notes text
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric,
  reps int,
  rpe numeric,
  completed boolean default false,
  is_warmup boolean default false,
  is_pr boolean default false,
  position int default 0
);

-- ─────────────────────────────────────────────────────────────
-- NUTRITION
-- ─────────────────────────────────────────────────────────────
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  serving_label text default '1 serving',
  calories numeric default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fiber_g numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  slot text default 'snack',
  name text not null,
  quantity numeric default 1,
  serving_label text,
  calories numeric default 0,
  protein_g numeric default 0,
  carbs_g numeric default 0,
  fat_g numeric default 0,
  fiber_g numeric default 0,
  source text default 'manual',
  is_estimate boolean default false,
  logged_at timestamptz default now()
);
create index if not exists nutrition_user_date on public.nutrition_logs(user_id, date desc);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  amount_oz numeric not null,
  logged_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- BODY & ACTIVITY
-- ─────────────────────────────────────────────────────────────
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric not null,
  logged_at timestamptz default now(),
  unique (user_id, date)
);

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  minutes int not null,
  quality int,
  unique (user_id, date)
);

create table if not exists public.steps_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  steps int not null,
  source text default 'manual',
  unique (user_id, date)
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  chest_cm numeric, waist_cm numeric, hips_cm numeric,
  arm_cm numeric, thigh_cm numeric, neck_cm numeric,
  body_fat_pct numeric
);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  pose text default 'front',
  storage_path text not null, -- path in the private 'progress-photos' storage bucket
  weight_kg numeric,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- REMINDERS / STREAKS / ACHIEVEMENTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  time text not null,
  days int[] default '{0,1,2,3,4,5,6}',
  enabled boolean default true
);

create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workout int default 0,
  protein int default 0,
  nutrition int default 0,
  hydration int default 0,
  daily int default 0,
  longest_daily int default 0,
  last_active_date date
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz default now(),
  unique (user_id, achievement_id)
);

-- ─────────────────────────────────────────────────────────────
-- PROTOCOLS (personal record-keeping only)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.protocols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose numeric,
  unit text default '',
  frequency text default 'daily',
  time_of_day text,
  notes text,
  reminder_enabled boolean default false,
  started_at date default current_date,
  active boolean default true
);

create table if not exists public.protocol_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  date date not null,
  time text,
  taken boolean default true,
  dose numeric,
  unit text,
  notes text
);

-- ─────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS (billing state mirror; source of truth is RevenueCat/store)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text default 'free',
  product_id text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY: enable + owner-only policies on every table
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
  col text;
begin
  foreach t in array array[
    'profiles','goals','coach_settings','exercises','workouts','workout_exercises','sets',
    'foods','nutrition_logs','water_logs','weight_logs','sleep_logs','steps_logs','measurements',
    'progress_photos','reminders','streaks','achievements','protocols','protocol_logs','subscriptions'
  ] loop
    -- The owner column is `id` on profiles, `user_id` everywhere else.
    col := case when t = 'profiles' then 'id' else 'user_id' end;
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "owner_all" on public.%I;', t);
    execute format(
      'create policy "owner_all" on public.%1$I for all using (%2$I = auth.uid()) with check (%2$I = auth.uid());',
      t, col
    );
  end loop;
end $$;

-- updated_at triggers
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Auto-provision a profile row when a new auth user is created
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.goals (user_id) values (new.id) on conflict do nothing;
  insert into public.coach_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
