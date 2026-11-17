-- Classes run by artists (self-makeup, mehendi): listed publicly, seats requested with a name and a mobile number.
create table mkt.classes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references mkt.vendors(id) on delete cascade,
  title text not null check (length(title) between 4 and 90),
  summary text not null default '',
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'pro')),
  mode text not null default 'in_person' check (mode in ('in_person', 'online')),
  city_id int references mkt.cities(id),
  venue text not null default '',
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 30 and 2880),
  seats int not null check (seats between 1 and 500),
  fee_inr int not null check (fee_inr between 0 and 500000),
  includes text not null default '',
  status text not null default 'live' check (status in ('live', 'hidden', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classes_upcoming on mkt.classes (starts_at) where status = 'live';
create index classes_vendor on mkt.classes (vendor_id, starts_at desc);

create table mkt.class_signups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references mkt.classes(id) on delete cascade,
  name text not null,
  phone text not null,
  note text not null default '',
  status text not null default 'new' check (status in ('new', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (class_id, phone)
);

alter table mkt.classes enable row level security;
alter table mkt.class_signups enable row level security;

alter table mkt.captures drop constraint if exists captures_source_check;
alter table mkt.captures add constraint captures_source_check check (source in ('slip', 'exit', 'chat', 'shortlist', 'dock', 'signup', 'class'));
