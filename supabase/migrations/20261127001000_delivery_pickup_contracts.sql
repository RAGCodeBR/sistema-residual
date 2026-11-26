begin;
create table public.equipment_events(
 id uuid primary key, proposal_id uuid not null references public.proposals on delete restrict,
 seq integer not null, kind text not null check(kind in ('entrega','troca','retirada')),
 service_day date not null, fields jsonb not null, amount numeric(12,2), actor uuid not null,
 commercial_snapshot jsonb,
 unique(proposal_id,seq), check((kind='troca')=(amount is not null)),check(amount>=0));
alter table public.equipment_events enable row level security;
revoke all on public.equipment_events from public,anon,authenticated;

create view public.equipment_queue with(security_barrier=true) as
select q.*,p.service_address,p.content->>'site' site,p.content->>'equipment' equipment,p.content->>'waste_summary' residue,
 (select case when count(*)=1 then min((i->>'price')::numeric) end
  from jsonb_array_elements(p.content->'groups') g cross join lateral jsonb_array_elements(g->'items') i
  where i->>'description' ~* '\mtroca\M' and jsonb_typeof(i->'price')='number') exchange_price
from public.operational_queue q join public.proposals p on p.id=q.id;

create function public.equipment_history(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'seq',e.seq,'kind',e.kind,'fields',e.fields,'amount',e.amount) order by seq),'[]')
 from public.equipment_events e join public.operational_queue q on q.id=e.proposal_id where q.id=target
$$;
create function public.complete_equipment_event(target uuid, request_id uuid, previous integer, action text, details jsonb, agreed numeric)
returns void language plpgsql security definer set search_path='' as $$
declare last_event public.equipment_events; day date; key text;
begin
 if auth.uid() is null or not public.has_app_permission('operations') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
 perform 1 from public.proposals where id=target and status='aprovada' for update;
 if not found then raise exception 'A proposta precisa estar aprovada.'; end if;
 if exists(select from public.equipment_events where id=request_id and proposal_id=target and kind=action and fields=details and amount is not distinct from agreed) then return; end if;
 select * into last_event from public.equipment_events where proposal_id=target order by seq desc limit 1;
 if coalesce(last_event.seq,0)<>previous then raise exception 'A ficha foi atualizada. Reabra a operação.'; end if;
 if (last_event.id is null and action<>'entrega') or (last_event.id is not null and (action='entrega' or last_event.kind='retirada')) then raise exception 'Operação fora de sequência.'; end if;
 if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>240000 then raise exception 'Ficha inválida.'; end if;
 for key in select jsonb_object_keys(details) loop
 if jsonb_typeof(details->key)<>'string' then raise exception 'Campo inválido.'; end if;
 if key in ('driverSignature','clientSignature') then
 if details->>key<>'' and (length(details->>key)>100000 or details->>key !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$') then raise exception 'Assinatura inválida.'; end if;
 elsif key not in ('company','address','equipment','day','residue','notes','driver','clientSigner','replacement') or length(details->>key)>1000 then raise exception 'Campo inválido.'; end if;
 end loop;
 foreach key in array array['company','equipment','address','day'] loop
 if nullif(trim(details->>key),'') is null then raise exception 'Preencha empresa, equipamento, endereço e data.'; end if; end loop;
 day:=(details->>'day')::date;
 if day> (now() at time zone 'America/Sao_Paulo')::date or day<last_event.service_day then raise exception 'Confira a data da execução.'; end if;
 if action='troca' and (agreed is null or agreed<0 or agreed<>round(agreed,2) or nullif(trim(details->>'replacement'),'') is null) then raise exception 'Informe o equipamento entregue na troca e o valor acordado.'; end if;
 insert into public.equipment_events values(request_id,target,coalesce(last_event.seq,0)+1,action,day,details,agreed,auth.uid(),
 case when action='retirada' then (select to_jsonb(p) - 'history' from public.proposals p where p.id=target) end);
end $$;
create or replace view public.approved_billing with(security_barrier=true) as
select p.id,p.year,p.number,p.client_name,p.client_cnpj,p.client_phone,p.client_contact,p.client_email,p.client_city,p.service_address,p.subject,p.template,p.content,p.client_id,c.address registered_address,c.legal_name,c.state_registration,c.municipal_registration,
 case when p.template='assessoria' then d.base_date else e.service_day end base_date,e.service_day pickup_day,
 coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'day',x.service_day,'amount',x.amount) order by x.seq) from public.equipment_events x where x.proposal_id=p.id and x.kind='troca'),'[]') exchanges
from public.equipment_events e cross join lateral jsonb_populate_record(null::public.proposals,e.commercial_snapshot) p
left join public.clients c on c.id=p.client_id left join public.proposal_billing_dates d on d.proposal_id=p.id
where e.kind='retirada' and public.has_app_permission('finance') and not public.has_role(auth.uid(),'client');
create or replace function public.set_billing_date(target uuid,day date) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from public.approved_billing where id=target and template='assessoria') then raise insufficient_privilege; end if;
 if day is null then delete from public.proposal_billing_dates where proposal_id=target;
 else insert into public.proposal_billing_dates values(target,day) on conflict(proposal_id) do update set base_date=excluded.base_date; end if;
end $$;
create table public.residual_contracts(proposal_id uuid primary key references public.proposals on delete restrict, number text not null unique, body text not null, created_at timestamptz not null default now(), creator uuid not null);
alter table public.residual_contracts enable row level security;
revoke all on public.residual_contracts from public,anon,authenticated;
grant select on public.residual_contracts to authenticated;
create policy contract_read on public.residual_contracts for select to authenticated using(public.has_app_permission('proposals') and not public.has_role(auth.uid(),'client'));
create function public.issue_residual_contract(target uuid, contract_number text, document text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
 perform 1 from public.proposals where id=target and status='aprovada' for update;
 if not found or length(trim(document)) not between 100 and 100000 or nullif(trim(contract_number),'') is null or length(contract_number)>80 then raise exception 'Confira os dados e a aprovação da proposta.'; end if;
 insert into public.residual_contracts(proposal_id,number,body,creator) values(target,trim(contract_number),document,auth.uid());
end $$;
revoke all on public.equipment_queue from public,anon,authenticated;
grant select on public.equipment_queue to authenticated;
revoke all on function public.equipment_history(uuid), public.complete_equipment_event(uuid,uuid,integer,text,jsonb,numeric), public.issue_residual_contract(uuid,text,text) from public,anon;
grant execute on function public.equipment_history(uuid), public.complete_equipment_event(uuid,uuid,integer,text,jsonb,numeric), public.issue_residual_contract(uuid,text,text) to authenticated;
-- Fichas históricas continuam legíveis; clientes antigos não devem emitir romaneio ao aprovar.
revoke execute on function public.save_operational_slip(uuid,integer,boolean,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
