begin;
-- Keep legacy slips and photos attached to their original proposal UUID.
alter table public.proposals drop constraint proposals_status_check,
  add constraint proposals_status_check check(status in ('rascunho','enviada','aprovada','recusada','excluida'));
create unique index proposals_current_number on public.proposals(year,number) where status <> 'excluida';
alter table public.proposals drop constraint proposals_year_number_key;
create policy visible_proposals on public.proposals as restrictive for all to authenticated
  using (status <> 'excluida') with check (status <> 'excluida');

create function public.remove_initial_proposal(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
  perform 1 from public.proposals where id=target and status <> 'excluida' for update;
  if not found then return; end if;
  if exists(select from public.equipment_events where proposal_id=target)
    or exists(select from public.proposal_billing_dates where proposal_id=target) then
    raise exception 'A proposta já tem movimentação operacional ou faturamento registrado e precisa permanecer no histórico.';
  end if;
  if exists(select from public.residual_contracts where proposal_id=target) then
    if exists(select from public.contract_signatures where proposal_id=target)
      or exists(select from public.residual_contracts where proposal_id=target and starts_on is not null) then
      raise exception 'A proposta possui contrato com assinatura ou vigência registrada.';
    end if;
    raise exception 'Em Contratos → Assinaturas, desfaça a emissão antes de excluir a proposta.';
  end if;
  update public.proposals set status='excluida',
    history=history || jsonb_build_array(jsonb_build_object('previous_status',status,'action','exclusao','actor',auth.uid(),'at',now()))
    where id=target;
end $$;

create function public.undo_unsigned_contract(target uuid, issued_at timestamptz, expected_number text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
  perform 1 from public.proposals where id=target for update;
  perform 1 from public.residual_contracts where proposal_id=target and created_at=issued_at and number=expected_number for update;
  if not found then raise exception 'A emissão mudou. Atualize a lista de contratos.'; end if;
  if exists(select from public.contract_signatures where proposal_id=target)
    or exists(select from public.residual_contracts where proposal_id=target and starts_on is not null) then
    raise exception 'Já existe assinatura ou vigência registrada neste contrato.';
  end if;
  delete from public.residual_contracts where proposal_id=target;
end $$;
revoke all on function public.remove_initial_proposal(uuid),public.undo_unsigned_contract(uuid,timestamptz,text) from public,anon;
grant execute on function public.remove_initial_proposal(uuid),public.undo_unsigned_contract(uuid,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
commit;
