-- Wayfarer schema. Run the entire file in Supabase Dashboard > SQL Editor.
-- All shared-trip data is protected by Row Level Security (RLS).

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  budget numeric(14, 2) not null default 0 check (budget >= 0),
  currency text not null default 'INR' check (char_length(currency) = 3),
  travel_style text not null default 'balanced',
  interests text[] not null default '{}',
  group_size integer not null default 1 check (group_size between 1 and 30),
  itinerary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_order check (end_date >= start_date)
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists trips_owner_updated_idx on public.trips(owner_id, updated_at desc);
create index if not exists trip_members_user_idx on public.trip_members(user_id, trip_id);
create index if not exists trip_invites_code_expiry_idx on public.trip_invites(code, expires_at);

-- Membership checks run as this function's owner to avoid recursive RLS queries.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

-- Automatically register the creator as the trip owner.
create or replace function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trips_add_owner_member on public.trips;
create trigger trips_add_owner_member
after insert on public.trips
for each row execute function public.add_trip_owner_member();

-- Ownership is immutable in this simple app, even for editors.
create or replace function public.prevent_trip_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Trip ownership cannot be changed from the editor.';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_prevent_owner_change on public.trips;
create trigger trips_prevent_owner_change
before update of owner_id on public.trips
for each row execute function public.prevent_trip_owner_change();

create or replace function public.touch_trip_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
before update on public.trips
for each row execute function public.touch_trip_updated_at();

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;

drop policy if exists "Members can read trips" on public.trips;
create policy "Members can read trips"
on public.trips for select to authenticated
using (owner_id = auth.uid() or public.is_trip_member(id));

drop policy if exists "Users create trips for themselves" on public.trips;
create policy "Users create trips for themselves"
on public.trips for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Members can edit trips" on public.trips;
create policy "Members can edit trips"
on public.trips for update to authenticated
using (public.is_trip_member(id))
with check (public.is_trip_member(id));

drop policy if exists "Only owners can delete trips" on public.trips;
create policy "Only owners can delete trips"
on public.trips for delete to authenticated
using (owner_id = auth.uid());

drop policy if exists "Members can view trip membership" on public.trip_members;
create policy "Members can view trip membership"
on public.trip_members for select to authenticated
using (public.is_trip_member(trip_id));

-- Invite rows cannot be selected or modified directly. The RPC functions below
-- are the only supported way to create or consume a trip invite.
revoke all on table public.trip_invites from anon, authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select on table public.trip_members to authenticated;
revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

create or replace function public.create_trip_invite(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a trip invite.';
  end if;
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.owner_id = auth.uid()
  ) then
    raise exception 'Only the trip owner can create invite links.';
  end if;

  invite_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.trip_invites (trip_id, code, created_by, expires_at)
  values (p_trip_id, invite_code, auth.uid(), now() + interval '7 days');
  return invite_code;
end;
$$;

create or replace function public.join_trip_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a shared trip.';
  end if;
  if p_code is null or length(trim(p_code)) < 32 or length(trim(p_code)) > 100 then
    raise exception 'This invite link is invalid.';
  end if;

  select ti.trip_id into target_trip_id
  from public.trip_invites ti
  where ti.code = trim(p_code)
    and ti.expires_at > now()
  order by ti.created_at desc
  limit 1;

  if target_trip_id is null then
    raise exception 'This invite link has expired or is invalid.';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (target_trip_id, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do nothing;

  return target_trip_id;
end;
$$;

revoke all on function public.create_trip_invite(uuid) from public;
revoke all on function public.join_trip_by_code(text) from public;
grant execute on function public.create_trip_invite(uuid) to authenticated;
grant execute on function public.join_trip_by_code(text) to authenticated;

-- Enable Realtime updates for shared itinerary editing (safe to re-run).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'trips'
     ) then
    execute 'alter publication supabase_realtime add table public.trips';
  end if;
end;
$$;
