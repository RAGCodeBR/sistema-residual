begin;
alter table public.clients add column if not exists commercial_city text;
alter table public.proposals add column client_id uuid references public.clients(id) on delete set null, add column service_address text;
create index proposals_customer_idx on public.proposals(client_id);
-- Somente correspondências inequívocas de CNPJ em propostas anteriores.
with matched as (
 select regexp_replace(cnpj,'[^0-9]','','g') doc, min(id::text)::uuid id from public.clients
 group by 1 having count(*)=1
)
update public.proposals p set client_id=m.id from matched m where length(m.doc)=14 and regexp_replace(p.client_cnpj,'[^0-9]','','g')=m.doc;

create view public.commercial_clients with (security_barrier=true) as
select c.id,c.name,c.legal_name,c.trade_name,c.cnpj,c.state_registration,c.municipal_registration,c.address,c.commercial_city,c.phone,c.email,c.responsible,
 array(select distinct b.address from public.client_branches b where b.client_id=c.id and b.is_active and nullif(b.address,'') is not null order by b.address) addresses
from public.clients c where (public.has_app_permission('clients') or public.has_app_permission('proposals')) and not public.has_role(auth.uid(),'client');

create function public.save_commercial_customer(details jsonb,target uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare doc text:=regexp_replace(coalesce(details->>'cnpj',''),'[^0-9]','','g'); company text:=trim(details->>'legal_name'); result uuid;
begin
 if auth.uid() is null or public.has_role(auth.uid(),'client') or not (public.has_app_permission('clients') or (target is null and public.has_app_permission('proposals'))) then raise insufficient_privilege; end if;
 if nullif(company,'') is null or octet_length(details::text)>12000 or length(doc) not in (0,14) then raise exception 'Confira a razão social e os 14 dígitos do CNPJ.'; end if;
 if doc<>'' then
 perform pg_advisory_xact_lock(hashtextextended(doc,0));
 if exists(select 1 from public.clients where regexp_replace(cnpj,'[^0-9]','','g')=doc and id is distinct from target) then raise exception 'CNPJ já cadastrado. Selecione o cliente existente.'; end if;
 end if;
 if target is null then
 insert into public.clients(name,legal_name,created_by) values(company,company,auth.uid()) returning id into result;
 else result:=target; end if;
 update public.clients set name=coalesce(nullif(details->>'trade_name',''),company),legal_name=company,trade_name=details->>'trade_name',cnpj=nullif(details->>'cnpj',''),address=details->>'address',commercial_city=details->>'commercial_city',state_registration=details->>'state_registration',municipal_registration=details->>'municipal_registration',phone=details->>'phone',email=details->>'email',responsible=details->>'responsible' where id=result;
 if not found then raise exception 'Cliente indisponível.'; end if;
 if doc<>'' then update public.proposals set client_id=result where client_id is null and regexp_replace(client_cnpj,'[^0-9]','','g')=doc; end if;
 return result;
end $$;

create function public.operational_addresses(proposal uuid) returns table(customer uuid,address text) language sql stable security definer set search_path='' as $$
 select c.id,a.address from public.operational_queue q join public.proposals p on p.id=q.id join public.clients c on c.id=p.client_id
 left join lateral (select c.address union select b.address from public.client_branches b where b.client_id=c.id and b.is_active) a on true where q.id=proposal
$$;
create function public.add_commercial_address(customer uuid, location text, proposal uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.has_role(auth.uid(),'client') or not (public.has_app_permission('clients') or public.has_app_permission('proposals') or exists(select 1 from public.operational_addresses(proposal) a where a.customer=add_commercial_address.customer)) then raise insufficient_privilege; end if;
 if nullif(trim(location),'') is null or length(location)>1000 then raise exception 'Endereço inválido.'; end if;
 perform 1 from public.clients where id=customer for update;
 if not exists(select 1 from public.client_branches b where b.client_id=customer and b.is_active and lower(trim(b.address))=lower(trim(location))) and not exists(select 1 from public.clients where id=customer and lower(trim(address))=lower(trim(location))) then
 insert into public.client_branches(client_id,name,address) values(customer,left(trim(location),120),trim(location)); end if;
end $$;
create table public.proposal_billing_dates(proposal_id uuid primary key references public.proposals on delete cascade, base_date date not null);
alter table public.proposal_billing_dates enable row level security;
revoke all on public.proposal_billing_dates from public,anon,authenticated;
create view public.approved_billing with (security_barrier=true) as
select p.id,p.year,p.number,p.client_name,p.client_cnpj,p.client_phone,p.client_contact,p.client_email,p.client_city,p.service_address,p.subject,p.template,p.content,p.client_id,c.address registered_address,c.legal_name,c.state_registration,c.municipal_registration,d.base_date
from public.proposals p left join public.clients c on c.id=p.client_id left join public.proposal_billing_dates d on d.proposal_id=p.id
where p.status='aprovada' and public.has_app_permission('finance') and not public.has_role(auth.uid(),'client');
create function public.set_billing_date(target uuid, day date) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.approved_billing where id=target) then raise insufficient_privilege; end if;
 if day is null then delete from public.proposal_billing_dates where proposal_id=target;
 else insert into public.proposal_billing_dates values(target,day) on conflict(proposal_id) do update set base_date=excluded.base_date; end if;
end $$;
revoke all on public.commercial_clients,public.approved_billing from public,anon,authenticated;
grant select on public.commercial_clients,public.approved_billing to authenticated;
revoke all on function public.save_commercial_customer(jsonb,uuid),public.operational_addresses(uuid),public.add_commercial_address(uuid,text,uuid),public.set_billing_date(uuid,date) from public,anon;
grant execute on function public.save_commercial_customer(jsonb,uuid),public.operational_addresses(uuid),public.add_commercial_address(uuid,text,uuid),public.set_billing_date(uuid,date) to authenticated;
create or replace function public.read_operational_slip(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',q.revision,'issued',q.issued,'fields',coalesce(s.fields,
   jsonb_build_object('company',p.client_name,'address',coalesce(nullif(p.service_address,''),p.content->>'site',''),
     'residue',coalesce(p.content->>'waste_summary',''),'equipment',coalesce(p.content->>'equipment',''),
     'day',(now() at time zone 'America/Sao_Paulo')::date)))
 from public.operational_queue q join public.proposals p on p.id=q.id
 left join public.operational_slips s on s.proposal_id=q.id where q.id=target
$$;
notify pgrst,'reload schema';
commit;
