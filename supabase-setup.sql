create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_email text,
  service text not null,
  appointment_date date not null,
  appointment_time text not null,
  created_at timestamptz default now()
);

alter table appointments enable row level security;

create policy "allow public insert" on appointments
  for insert to anon with check (true);

create policy "allow public read" on appointments
  for select to anon using (true);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text, email text, message text,
  created_at timestamptz default now()
);
alter table contact_messages enable row level security;
create policy "allow public insert contact" on contact_messages for insert to anon with check (true);
