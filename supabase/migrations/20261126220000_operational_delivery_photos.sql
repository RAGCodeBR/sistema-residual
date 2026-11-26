begin;
create table public.operational_delivery_photos (
  id uuid primary key,
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  captured_at timestamptz not null,
  located_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision not null check (accuracy_m between 0 and 20000000),
  photo text not null check (length(photo) between 30 and 4000000 and photo like 'data:image/jpeg;base64,/9j/%'),
  recorded_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),
  check (abs(extract(epoch from located_at-captured_at)) <= 60)
);
create index operational_delivery_photos_order on public.operational_delivery_photos(proposal_id,captured_at desc);
alter table public.operational_delivery_photos enable row level security;
revoke all on public.operational_delivery_photos from public, anon, authenticated;
grant select, insert(id,proposal_id,captured_at,located_at,latitude,longitude,accuracy_m,photo) on public.operational_delivery_photos to authenticated;
create policy delivery_photo_read on public.operational_delivery_photos for select to authenticated using (
  exists (select 1 from public.operational_queue q where q.id=proposal_id)
);
create policy delivery_photo_insert on public.operational_delivery_photos for insert to authenticated with check (
  recorded_by=auth.uid() and exists (select 1 from public.operational_queue q where q.id=proposal_id)
);
notify pgrst, 'reload schema';
commit;
