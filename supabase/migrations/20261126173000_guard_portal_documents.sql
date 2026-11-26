begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'client-documents' and public = false) then
    raise exception 'Bucket privado client-documents obrigatório';
  end if;
end $$;

create function public.residual_document_session_active() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id::text = (auth.jwt() ->> 'session_id') and s.user_id = auth.uid()
  )
$$;
revoke all on function public.residual_document_session_active() from public;
grant execute on function public.residual_document_session_active() to authenticated;

create policy residual_docs_deny_anon on public.client_documents as restrictive
for all to anon using (false) with check (false);
create policy residual_files_deny_anon on storage.objects as restrictive
for all to anon using (bucket_id <> 'client-documents') with check (bucket_id <> 'client-documents');

create policy residual_docs_read_scope on public.client_documents as restrictive for select to authenticated
using (public.residual_document_session_active() and (
  (not public.has_role(auth.uid(), 'client') and public.has_app_permission('documents'))
  or (active and public.has_role(auth.uid(), 'client') and exists (
    select 1 from public.client_user_links l where l.user_id = auth.uid() and l.client_id = client_documents.client_id
  ))
));

create policy residual_files_read_scope on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'client-documents' or (
  public.residual_document_session_active() and
  ((not public.has_role(auth.uid(), 'client') and public.has_app_permission('documents'))
    or (public.has_role(auth.uid(), 'client') and storage.allow_only_operation('storage.object.get_authenticated')
        and exists (select 1 from public.client_documents d where d.storage_path = storage.objects.name)))
));

create function public.residual_document_editor() returns boolean
language sql stable security invoker set search_path = ''
as $$ select public.residual_document_session_active() and not public.has_role(auth.uid(),'client')
             and public.has_app_permission('documents') $$;
revoke all on function public.residual_document_editor() from public;
grant execute on function public.residual_document_editor() to authenticated;

create policy residual_docs_insert_scope on public.client_documents as restrictive for insert to authenticated
with check (public.residual_document_editor());
create policy residual_docs_update_scope on public.client_documents as restrictive for update to authenticated
using (public.residual_document_editor()) with check (public.residual_document_editor());
create policy residual_docs_preserve_rows on public.client_documents as restrictive for delete to authenticated using (false);
create policy residual_files_insert_scope on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'client-documents' or public.residual_document_editor());
create policy residual_files_update_scope on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'client-documents' or public.residual_document_editor())
with check (bucket_id <> 'client-documents' or public.residual_document_editor());
create policy residual_files_delete_scope on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'client-documents' or (public.residual_document_editor() and not exists (
  select 1 from public.client_documents d where d.storage_path = storage.objects.name
)));

create function public.residual_withdraw_document(document_id uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if public.residual_document_editor() is not true then raise insufficient_privilege; end if;
  update public.client_documents set active = false where id = document_id;
  if not found then raise exception 'Documento indisponível'; end if;
end $$;
revoke all on function public.residual_withdraw_document(uuid) from public;
grant execute on function public.residual_withdraw_document(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
