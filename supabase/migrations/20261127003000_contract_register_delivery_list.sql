begin;
create or replace view public.delivery_workspace with(security_barrier=true) as
select q.*, c.address as registered_address,p.client_contact,p.client_phone,e.id is not null as delivered,
 e.service_day as delivery_day,e.fields->>'address' as delivered_address,e.fields->>'equipment' as delivered_equipment
from public.equipment_queue q join public.proposals p on p.id=q.id left join public.clients c on c.id=p.client_id
left join public.equipment_events e on e.proposal_id=q.id and e.kind='entrega';

alter table public.residual_contracts add column starts_on date, add column ends_on date,
 add constraint contract_period check ((starts_on is null)=(ends_on is null) and ends_on>=starts_on);
create view public.contract_register with(security_barrier=true) as
select r.proposal_id,r.number,r.created_at,r.starts_on,r.ends_on,p.number proposal_number,p.year,p.client_name,p.client_cnpj,p.subject,
 substring(r.body from '(?i)vigência pelo prazo de ([0-9]{1,3})(?:\s*\([^)]*\))?\s+meses')::integer as term_months,
 substring(r.body from '(?i)CLÁUSULA SEGUNDA[^[:cntrl:]]+') as term_clause,
 case when r.starts_on is null then 'aguardando' when r.starts_on>(now() at time zone 'America/Sao_Paulo')::date then 'agendado'
 when r.ends_on<(now() at time zone 'America/Sao_Paulo')::date then 'encerrado' else 'ativo' end status
from public.residual_contracts r join public.proposals p on p.id=r.proposal_id
where public.has_app_permission('proposals') and not public.has_role(auth.uid(),'client');
create function public.register_contract_period(target uuid,first_day date,last_day date) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
 if first_day is null or last_day is null or last_day<first_day then raise exception 'Confira as datas de vigência.'; end if;
 update public.residual_contracts set starts_on=first_day,ends_on=last_day where proposal_id=target and starts_on is null;
 if not found then raise exception 'Vigência já registrada ou contrato indisponível.'; end if;
end $$;
revoke all on public.contract_register from public,anon,authenticated;
grant select on public.contract_register to authenticated;
revoke all on function public.register_contract_period(uuid,date,date) from public,anon;
grant execute on function public.register_contract_period(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
