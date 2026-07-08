-- Property Wealth OS — pre-approval engine schema
-- See docs/property-pre-approval-engine/SKILL.md (build-mode notes) and
-- references/data-sources.md for the rationale: raw control lookups are
-- stored separately from derived scores because scores are recomputable
-- and raw evidence is not.

create extension if not exists "pgcrypto";

create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  address text not null,
  lot_dp text,
  lga text not null,
  epi_name text not null,
  epi_amendment_date date,
  lot_size_sqm numeric,
  frontage_m numeric,
  depth_m numeric,
  is_corner_lot boolean,
  registration_status text not null check (registration_status in ('registered', 'unregistered')),
  created_at timestamptz not null default now()
);

create index if not exists lots_user_id_idx on lots (user_id);
create index if not exists lots_lga_idx on lots (lga);

-- Raw control/constraint lookups, kept separate from derived assessments.
-- Every fact carries provenance per references/data-sources.md ("General rules").
create table if not exists control_lookups (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots (id) on delete cascade,
  stage text not null, -- e.g. 'planning_controls', 'constraints', 'topography', 'da_stats'
  payload jsonb not null,
  source text not null,
  layer_or_epi text,
  retrieved_at timestamptz not null default now()
);

create index if not exists control_lookups_lot_id_idx on control_lookups (lot_id);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  record jsonb, -- full AssessmentRecord (types/assessment.ts) once complete
  score int,
  band_low text,
  band_high text,
  is_banded boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists assessments_lot_id_idx on assessments (lot_id);
create index if not exists assessments_user_id_idx on assessments (user_id);

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  assessment_id uuid references assessments (id) on delete set null,
  mode text not null check (mode in ('property_grounded', 'general')),
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_id_idx on chat_sessions (user_id);
create index if not exists chat_sessions_assessment_id_idx on chat_sessions (assessment_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on chat_messages (session_id);

-- Row Level Security: every table scoped to the owning user.
alter table lots enable row level security;
alter table control_lookups enable row level security;
alter table assessments enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "lots_owner_all" on lots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "control_lookups_owner_all" on control_lookups
  for all using (
    exists (select 1 from lots where lots.id = control_lookups.lot_id and lots.user_id = auth.uid())
  ) with check (
    exists (select 1 from lots where lots.id = control_lookups.lot_id and lots.user_id = auth.uid())
  );

create policy "assessments_owner_all" on assessments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_sessions_owner_all" on chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages_owner_all" on chat_messages
  for all using (
    exists (select 1 from chat_sessions where chat_sessions.id = chat_messages.session_id and chat_sessions.user_id = auth.uid())
  ) with check (
    exists (select 1 from chat_sessions where chat_sessions.id = chat_messages.session_id and chat_sessions.user_id = auth.uid())
  );
