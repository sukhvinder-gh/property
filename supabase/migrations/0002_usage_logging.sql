-- Usage logging: every address search and every uploaded design, so we can
-- see which searches fail (and why) and what kinds of plans people check.
-- Written only by the server (service role); RLS is on with no policies, so
-- nothing is readable or writable with the public anon key.

-- One row per address search (POST /api/assess).
create table if not exists search_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Random per-browser-tab id; groups one visitor's searches. Not linked to identity.
  session_id text,
  -- Exactly what was submitted, and whether it came from an autocomplete pick or was typed.
  query text not null,
  source text check (source in ('autocomplete', 'typed')),
  resolved boolean not null,
  unresolved_reason text,
  assessment_id uuid,
  matched_address text,
  lot_dp text,
  lga text,
  council_name text,
  zone text,
  instrument text,
  pathway text,
  score integer,
  band text,
  duration_ms integer,
  error text
);

create index if not exists search_events_created_at_idx on search_events (created_at desc);
create index if not exists search_events_resolved_idx on search_events (resolved);

-- One row per uploaded design (POST /api/design-check). The file itself is in
-- the private "designs" storage bucket at file_path.
create table if not exists design_uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  assessment_id uuid,
  address text,
  file_path text,
  file_name text,
  file_type text,
  file_size_bytes integer,
  verdict text,
  failing_checks integer,
  unknown_checks integer,
  extracted jsonb,
  result jsonb,
  duration_ms integer,
  error text
);

create index if not exists design_uploads_created_at_idx on design_uploads (created_at desc);

alter table search_events enable row level security;
alter table design_uploads enable row level security;

-- Private bucket for uploaded plans (no public URLs; view via the dashboard
-- or signed URLs).
insert into storage.buckets (id, name, public)
values ('designs', 'designs', false)
on conflict (id) do nothing;

-- Searches that didn't match a lot, most frequent first — the list to work
-- through when improving the address search.
create or replace view unresolved_searches as
select
  lower(trim(query)) as query,
  count(*) as times_searched,
  max(created_at) as last_searched,
  max(unresolved_reason) as reason,
  bool_or(source = 'autocomplete') as picked_from_autocomplete
from search_events
where not resolved
group by lower(trim(query))
order by times_searched desc, last_searched desc;
