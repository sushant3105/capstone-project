create table if not exists public.trips (
  id uuid primary key,
  preferences jsonb not null,
  itinerary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;

-- Authentication is intentionally deferred for the MVP. The backend service
-- role should be used for these operations; do not expose this table directly
-- to an anonymous browser client.
