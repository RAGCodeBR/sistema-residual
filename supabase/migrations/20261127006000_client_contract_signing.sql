begin;
create table public.contract_invites (
  proposal_id uuid primary key references public.residual_contracts on delete cascade,
  token_hash bytea unique not null, code_hash bytea not null, requested_by uuid not null,
  expires_at timestamptz not null
);
alter table public.contract_invites enable row level security;
revoke all on public.contract_invites from public, anon, authenticated;
alter table public.contract_signatures alter column recorded_by drop not null,
  add column electronic_receipt jsonb,
  add check (recorded_by is not null or (party='cliente' and electronic_receipt is not null));

create function public.clear_contract_invite() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.contract_invites where proposal_id=new.proposal_id;
  return new;
end $$;
create trigger clear_invite_on_revision after update of body,number on public.residual_contracts
for each row when (old.body is distinct from new.body or old.number is distinct from new.number)
execute function public.clear_contract_invite();

create function public.manage_client_signature(target uuid, revoke_only boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text; code text;
begin
  if auth.uid() is null or not public.has_app_permission('proposals') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
  perform 1 from public.residual_contracts where proposal_id=target for update;
  if not found or exists(select from public.contract_signatures where proposal_id=target and party='cliente') then raise exception 'Contrato indisponível para assinatura.'; end if;
  delete from public.contract_invites where proposal_id=target;
  if revoke_only then return null; end if;
  token:=replace(gen_random_uuid()::text,'-','');
  code:=upper(left(replace(gen_random_uuid()::text,'-',''),12));
  insert into public.contract_invites values(target,sha256(convert_to(token,'UTF8')),sha256(convert_to(code,'UTF8')),auth.uid(),now()+interval '7 days');
  return jsonb_build_object('token',token,'code',code);
end $$;

create function public.client_contract_session(access_token text, access_code text, signed_name text default null, accepted_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite public.contract_invites; doc public.residual_contracts; fingerprint text;
  receipt jsonb; instant timestamptz:=clock_timestamp(); consent constant text:='Li este contrato e concordo em assiná-lo como representante da contratante.';
begin
  if length(access_token)<>32 or length(access_code)<>12 then raise exception 'Link ou código inválido ou expirado.'; end if;
  select r.* into doc from public.residual_contracts r join public.contract_invites i using(proposal_id)
  where i.token_hash=sha256(convert_to(access_token,'UTF8')) and i.code_hash=sha256(convert_to(upper(access_code),'UTF8')) and i.expires_at>now() for update of r;
  select * into invite from public.contract_invites where proposal_id=doc.proposal_id and expires_at>now()
    and token_hash=sha256(convert_to(access_token,'UTF8')) and code_hash=sha256(convert_to(upper(access_code),'UTF8'));
  if not found then raise exception 'Link ou código inválido ou expirado.'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(doc.number,doc.body)::text,'UTF8')),'hex');
  select electronic_receipt into receipt from public.contract_signatures where proposal_id=doc.proposal_id and party='cliente';
  if found and receipt is null then raise exception 'A assinatura do cliente já foi registrada.'; end if;
  if signed_name is not null then
    if accepted_hash is distinct from fingerprint or length(trim(signed_name)) not between 3 and 180 or signed_name ~ '[[:cntrl:]]' then raise exception 'Confira o nome e a versão do contrato.'; end if;
    if receipt is null then
      receipt:=jsonb_build_object('signer',trim(signed_name),'at',instant,'hash',fingerprint,'consent',consent,'method','Link individual e código de acesso','id',gen_random_uuid());
      insert into public.contract_signatures(proposal_id,party,signer,signed_on,recorded_at,electronic_receipt)
      values(doc.proposal_id,'cliente',trim(signed_name),(instant at time zone 'America/Sao_Paulo')::date,instant,receipt);
      insert into public.notifications(user_id,type,title,body)
      select distinct recipient,'contract_signed','Cliente assinou o contrato '||doc.number,'Assinatura recebida de '||trim(signed_name)||'.'
      from (select doc.creator recipient union select invite.requested_by union select user_id from public.user_roles where role='admin') a
      where not public.has_role(recipient,'client');
    elsif receipt->>'signer' <> trim(signed_name) then raise exception 'Contrato já assinado.'; end if;
  end if;
  return jsonb_build_object('number',doc.number,'body',doc.body,'hash',fingerprint,'receipt',receipt,'consent',consent);
end $$;

create function public.contract_signature_receipt(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select electronic_receipt from public.contract_signatures where proposal_id=target and party='cliente'
  and public.has_app_permission('proposals') and not public.has_role(auth.uid(),'client');
$$;
revoke all on function public.clear_contract_invite(),public.manage_client_signature(uuid,boolean),public.client_contract_session(text,text,text,text),public.contract_signature_receipt(uuid) from public,anon,authenticated;
grant execute on function public.manage_client_signature(uuid,boolean), public.contract_signature_receipt(uuid) to authenticated;
grant execute on function public.client_contract_session(text,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
