begin;
create view public.delivery_workspace with (security_barrier=true) as
select q.*, c.address as registered_address, p.client_contact,p.client_phone,
 exists(select from public.equipment_events e where e.proposal_id=q.id and e.kind='entrega') as delivered
from public.equipment_queue q join public.proposals p on p.id=q.id left join public.clients c on c.id=p.client_id;
revoke all on public.delivery_workspace from public,anon,authenticated;
grant select on public.delivery_workspace to authenticated;
notify pgrst,'reload schema';
commit;
