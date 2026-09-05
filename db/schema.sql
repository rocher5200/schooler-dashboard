create table if not exists dashboard_records (
  month text not null,
  code text not null,
  course text not null,
  price integer not null default 0,
  quantity integer not null default 0,
  paid integer not null default 0,
  refunds integer not null default 0,
  net_paid integer generated always as (paid - refunds) stored,
  source_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (month, code, course)
);

create index if not exists dashboard_records_month_idx on dashboard_records (month);
create index if not exists dashboard_records_paid_idx on dashboard_records (net_paid desc);

create table if not exists sync_runs (
  id bigserial primary key,
  status text not null check (status in ('previewed', 'published', 'blocked', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  added_months jsonb not null default '[]'::jsonb,
  changed_months jsonb not null default '[]'::jsonb,
  new_courses jsonb not null default '[]'::jsonb,
  paid_delta integer not null default 0,
  refund_delta integer not null default 0,
  net_paid_delta integer not null default 0,
  record_count integer not null default 0,
  qa jsonb not null default '{"issues":[]}'::jsonb,
  error text,
  summary_text text
);

create index if not exists sync_runs_started_at_idx on sync_runs (started_at desc);
