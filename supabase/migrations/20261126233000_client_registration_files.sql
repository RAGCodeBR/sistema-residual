begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('client-registration','client-registration',false,10485760,array['application/pdf','image/jpeg','image/png']);

create function public.can_access_registration_file(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_app_permission('clients') and not public.has_role(auth.uid(),'client') and
 exists(select 1 from public.clients c where c.id::text=split_part(object_name,'/',1) and object_name=c.id::text||'/ficha')
$$;
revoke all on function public.can_access_registration_file(text) from public,anon;
grant execute on function public.can_access_registration_file(text) to authenticated;

create policy registration_access_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'client-registration' or public.can_access_registration_file(name))
with check(bucket_id<>'client-registration' or public.can_access_registration_file(name));
create policy registration_anon_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'client-registration') with check(bucket_id<>'client-registration');
create policy registration_read on storage.objects for select to authenticated using(bucket_id='client-registration');
create policy registration_insert on storage.objects for insert to authenticated with check(bucket_id='client-registration');
create policy registration_update on storage.objects for update to authenticated using(bucket_id='client-registration') with check(bucket_id='client-registration');

create or replace view public.commercial_clients with (security_barrier=true) as
select c.id,c.name,c.legal_name,c.trade_name,c.cnpj,c.state_registration,c.municipal_registration,c.address,c.commercial_city,c.phone,c.email,c.responsible,
 array(select distinct b.address from public.client_branches b where b.client_id=c.id and b.is_active and nullif(b.address,'') is not null order by b.address) addresses,
 public.has_app_permission('clients') and exists(select 1 from storage.objects o where o.bucket_id='client-registration' and o.name=c.id::text||'/ficha') as has_registration_file
from public.clients c where (public.has_app_permission('clients') or public.has_app_permission('proposals')) and not public.has_role(auth.uid(),'client');
notify pgrst,'reload schema';
commit;
