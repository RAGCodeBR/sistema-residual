begin;
create table public.operational_slips (
  proposal_id uuid primary key references public.proposals(id) on delete restrict,
  revision integer not null default 1,
  issued boolean not null,
  fields jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);
alter table public.operational_slips enable row level security;
revoke all on public.operational_slips from public, anon, authenticated;

-- A equipe operacional vê o pedido aprovado, sem acesso aos preços comerciais.
create view public.operational_queue with (security_barrier=true) as
select p.id, p.year, p.number, p.client_name, p.subject,
       coalesce(s.issued,false) as issued, coalesce(s.revision,0) as revision
from public.proposals p left join public.operational_slips s on s.proposal_id=p.id
where p.status='aprovada' and public.has_app_permission('operations')
  and not public.has_role(auth.uid(),'client');
revoke all on public.operational_queue from public, anon, authenticated;
grant select on public.operational_queue to authenticated;

create function public.read_operational_slip(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',q.revision,'issued',q.issued,'fields',coalesce(s.fields,
   jsonb_build_object('company',p.client_name,'address',coalesce(p.content->>'site',''),
     'residue',coalesce(p.content->>'waste_summary',''),'equipment',coalesce(p.content->>'equipment',''),
     'day',(now() at time zone 'America/Sao_Paulo')::date)))
 from public.operational_queue q join public.proposals p on p.id=q.id
 left join public.operational_slips s on s.proposal_id=q.id where q.id=target
$$;

create function public.save_operational_slip(target uuid, expected_revision integer, issue boolean, details jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare saved_revision integer; k text;
begin
 if auth.uid() is null or not public.has_app_permission('operations') or public.has_role(auth.uid(),'client') then raise insufficient_privilege; end if;
 perform 1 from public.proposals where id=target and status='aprovada' for update;
 if not found then raise exception 'A proposta precisa estar aprovada.'; end if;
 if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>240000 then raise exception 'Ficha inválida.'; end if;
 for k in select jsonb_object_keys(details) loop
   if k not in ('company','address','day','residue','equipment','cover','service','delivery','pickup','notes','clientSigner','driver','clientSignature','driverSignature')
      or jsonb_typeof(details->k)<>'string' then raise exception 'Campo inválido.'; end if;
   if k in ('clientSignature','driverSignature') then
     if details->>k <> '' and (length(details->>k)>100000 or details->>k !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$') then raise exception 'Assinatura inválida.'; end if;
   elsif length(details->>k)>1000 then raise exception 'Campo longo demais.'; end if;
 end loop;
 if issue and (nullif(trim(details->>'company'),'') is null or nullif(trim(details->>'address'),'') is null
   or nullif(details->>'day','') is null or nullif(trim(details->>'equipment'),'') is null) then
   raise exception 'Preencha empresa, endereço, data e equipamento para gerar o romaneio.'; end if;
 foreach k in array array['day','delivery','pickup'] loop
   if nullif(details->>k,'') is not null then perform (details->>k)::date; end if;
 end loop;
 if nullif(details->>'pickup','')::date < nullif(details->>'delivery','')::date then raise exception 'Retirada anterior à entrega.'; end if;
 if expected_revision=0 then
   insert into public.operational_slips(proposal_id,issued,fields,updated_by) values(target,issue,details,auth.uid())
     on conflict do nothing returning revision into saved_revision;
 else
   update public.operational_slips set issued=issue,fields=details,revision=revision+1,updated_at=now(),updated_by=auth.uid()
   where proposal_id=target and revision=expected_revision returning revision into saved_revision;
 end if;
 if saved_revision is null then raise exception 'Outra pessoa atualizou a ficha. Reabra para ver a versão atual.'; end if;
 return saved_revision;
end $$;
revoke all on function public.read_operational_slip(uuid), public.save_operational_slip(uuid,integer,boolean,jsonb) from public, anon;
grant execute on function public.read_operational_slip(uuid), public.save_operational_slip(uuid,integer,boolean,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
