begin;
create table public.contract_signatures(
 proposal_id uuid not null references public.residual_contracts(proposal_id) on delete restrict,
 party text not null check(party in ('cliente','residual')),signer text not null check(length(trim(signer)) between 1 and 180),
 signed_on date not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),primary key(proposal_id,party));
alter table public.contract_signatures enable row level security;
revoke all on public.contract_signatures from public,anon,authenticated;

create view public.contract_proposal_queue with(security_barrier=true) as
select p.id,p.year,p.number,p.client_name,p.subject,p.decided_on from public.proposals p
where p.status='aprovada' and public.has_app_permission('proposals') and not public.has_role(auth.uid(),'client') and not exists(select from public.residual_contracts r where r.proposal_id=p.id);
revoke all on public.contract_proposal_queue from public,anon,authenticated;
grant select on public.contract_proposal_queue to authenticated;
create or replace view public.contract_register with(security_barrier=true) as
select r.proposal_id,r.number,r.created_at,r.starts_on,r.ends_on,p.number proposal_number,p.year,p.client_name,p.client_cnpj,p.subject,
 substring(r.body from '(?i)vigência pelo prazo de ([0-9]{1,3})(?:\s*\([^)]*\))?\s+meses')::integer as term_months,
 substring(r.body from '(?i)CLÁUSULA SEGUNDA[^[:cntrl:]]+') as term_clause,
 case when a.party is null or b.party is null then 'assinatura' when r.starts_on is null then 'aguardando' when r.starts_on>(now() at time zone 'America/Sao_Paulo')::date then 'agendado'
 when r.ends_on<(now() at time zone 'America/Sao_Paulo')::date then 'encerrado' else 'ativo' end status,a.signer as customer_signer,a.signed_on as customer_signed_on,b.signer as residual_signer,b.signed_on as residual_signed_on
from public.residual_contracts r join public.proposals p on p.id=r.proposal_id
left join public.contract_signatures a on a.proposal_id=r.proposal_id and a.party='cliente'
left join public.contract_signatures b on b.proposal_id=r.proposal_id and b.party='residual'
where public.has_app_permission('proposals') and not public.has_role(auth.uid(),'client');

create function public.record_contract_signature(target uuid,party_name text,signer_name text,signature_day date,expected_number text,expected_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege;end if;
 perform 1 from public.residual_contracts where proposal_id=target and number=expected_number and body=expected_body for update;
 if not found then raise exception 'Contrato atualizado. Confira o documento antes de registrar a assinatura.';end if;
 if signature_day is null or signature_day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data em que o contrato foi assinado.';end if;
 insert into public.contract_signatures(proposal_id,party,signer,signed_on,recorded_by) values(target,party_name,trim(signer_name),signature_day,auth.uid());
end $$;
create function public.revise_unsigned_contract(target uuid,contract_number text,document text,expected_number text,expected_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege;end if;
 perform 1 from public.residual_contracts where proposal_id=target and number=expected_number and body=expected_body for update;
 if not found then raise exception 'Contrato alterado. Reabra para conferir a versão atual.';end if;
 if exists(select from public.contract_signatures where proposal_id=target) then raise exception 'Já existe assinatura registrada neste contrato.';end if;
 if nullif(trim(contract_number),'') is null or length(contract_number)>80 or length(trim(document)) not between 100 and 100000 then raise exception 'Confira número e texto do contrato.';end if;
 update public.residual_contracts set number=trim(contract_number),body=document where proposal_id=target;
end $$;
revoke all on function public.record_contract_signature(uuid,text,text,date,text,text),public.revise_unsigned_contract(uuid,text,text,text,text) from public,anon;
grant execute on function public.record_contract_signature(uuid,text,text,date,text,text),public.revise_unsigned_contract(uuid,text,text,text,text) to authenticated;
create or replace function public.register_contract_period(target uuid,first_day date,last_day date) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
 if first_day is null or last_day is null or last_day<first_day then raise exception 'Confira as datas de vigência.';end if;
 if (select count(*) from public.contract_signatures where proposal_id=target)<>2 then raise exception 'Registre as assinaturas do cliente e da Residual antes da vigência.';end if;
 update public.residual_contracts set starts_on=first_day,ends_on=last_day where proposal_id=target and starts_on is null;
 if not found then raise exception 'Vigência já registrada ou contrato indisponível.';end if;
end $$;
notify pgrst,'reload schema';
commit;
