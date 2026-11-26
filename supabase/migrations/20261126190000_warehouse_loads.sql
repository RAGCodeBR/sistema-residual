begin;
create table public.warehouse_loads (
  id uuid primary key default gen_random_uuid(),
  client_name text not null check (length(trim(client_name)) between 1 and 240),
  waste_type text not null check (length(trim(waste_type)) between 1 and 500),
  arrived_on date not null,
  departed_on date check (departed_on >= arrived_on),
  photo text check (photo is null or (length(photo) <= 4000000 and photo like 'data:image/jpeg;base64,/9j/%')),
  has_photo boolean generated always as (photo is not null) stored,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index warehouse_loads_arrivals on public.warehouse_loads(arrived_on desc,id desc);
alter table public.warehouse_loads enable row level security;
revoke all on public.warehouse_loads from public, anon, authenticated;
grant select, insert(id,client_name,waste_type,arrived_on,photo), update(departed_on) on public.warehouse_loads to authenticated;
create policy warehouse_team on public.warehouse_loads as restrictive for all to authenticated
  using (public.has_app_permission('warehouse') and not public.has_role(auth.uid(),'client'))
  with check (public.has_app_permission('warehouse') and not public.has_role(auth.uid(),'client'));
create policy warehouse_read on public.warehouse_loads for select to authenticated using (true);
create policy warehouse_arrive on public.warehouse_loads for insert to authenticated with check (created_by=auth.uid() and departed_on is null);
create policy warehouse_depart on public.warehouse_loads for update to authenticated using (departed_on is null) with check (departed_on is not null);
notify pgrst, 'reload schema';
commit;
