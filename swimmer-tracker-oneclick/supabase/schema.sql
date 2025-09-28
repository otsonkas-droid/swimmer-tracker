-- Supabase schema and policies
create extension if not exists pgcrypto;
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  created_at timestamptz default now()
);
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  distance_m int not null check (distance_m >= 0),
  duration_min numeric not null check (duration_min >= 0),
  stroke text not null check (stroke in ('Free','Back','Breast','Fly','IM','Drill')),
  rpe int check (rpe between 1 and 10),
  notes text,
  created_at timestamptz default now()
);
create index if not exists workouts_user_date on workouts(user_id, date desc);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  meet text not null,
  distance_m int not null check (distance_m > 0),
  stroke text not null check (stroke in ('Free','Back','Breast','Fly','IM')),
  time_sec numeric not null check (time_sec > 0),
  location text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists competitions_user_stroke on competitions(user_id, stroke, distance_m, time_sec);

create or replace view personal_bests as
select distinct on (user_id, stroke, distance_m)
  user_id, stroke, distance_m, time_sec, date, meet
from competitions
order by user_id, stroke, distance_m, time_sec asc, date asc;

alter table profiles enable row level security;
alter table workouts enable row level security;
alter table competitions enable row level security;

drop policy if exists "Profiles are user-only" on profiles;
create policy "Profiles are user-only" on profiles for all using (id = auth.uid());

drop policy if exists "Workouts are user-only" on workouts;
create policy "Workouts are user-only" on workouts for all using (user_id = auth.uid());

drop policy if exists "Competitions are user-only" on competitions;
create policy "Competitions are user-only" on competitions for all using (user_id = auth.uid());
