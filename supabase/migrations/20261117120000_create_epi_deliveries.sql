-- Entregas de EPI por funcionário, com fotos tiradas no momento da entrega.
-- Quem tem a permissão de tela "documents" (e os administradores) pode
-- consultar, registrar, corrigir e excluir entregas. As fotos ficam no bucket
-- privado "epi-photos", em <cliente>/<entrega>/<arquivo>.

CREATE TABLE IF NOT EXISTS public.epi_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.client_department_employees(id) ON DELETE SET NULL,
  -- Nome guardado no registro: preserva o histórico mesmo que o funcionário
  -- saia do organograma, e permite registrar quem ainda não foi cadastrado.
  employee_name text NOT NULL CHECK (length(btrim(employee_name)) > 0),
  delivered_on date NOT NULL DEFAULT current_date,
  items text,
  notes text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS epi_deliveries_client_idx ON public.epi_deliveries(client_id, delivered_on DESC);
CREATE INDEX IF NOT EXISTS epi_deliveries_employee_idx ON public.epi_deliveries(employee_id);

ALTER TABLE public.epi_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS epi_deliveries_documents_read ON public.epi_deliveries;
CREATE POLICY epi_deliveries_documents_read ON public.epi_deliveries
  FOR SELECT TO authenticated
  USING (public.has_app_permission('documents'));

DROP POLICY IF EXISTS epi_deliveries_documents_create ON public.epi_deliveries;
CREATE POLICY epi_deliveries_documents_create ON public.epi_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('documents'));

DROP POLICY IF EXISTS epi_deliveries_documents_update ON public.epi_deliveries;
CREATE POLICY epi_deliveries_documents_update ON public.epi_deliveries
  FOR UPDATE TO authenticated
  USING (public.has_app_permission('documents'))
  WITH CHECK (public.has_app_permission('documents'));

DROP POLICY IF EXISTS epi_deliveries_documents_delete ON public.epi_deliveries;
CREATE POLICY epi_deliveries_documents_delete ON public.epi_deliveries
  FOR DELETE TO authenticated
  USING (public.has_app_permission('documents'));

-- Fotos das entregas (privadas; o app lê por links temporários).
INSERT INTO storage.buckets (id, name, public)
VALUES ('epi-photos', 'epi-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS epi_photos_documents_read ON storage.objects;
CREATE POLICY epi_photos_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'epi-photos' AND public.has_app_permission('documents'));

DROP POLICY IF EXISTS epi_photos_documents_create ON storage.objects;
CREATE POLICY epi_photos_documents_create ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'epi-photos' AND public.has_app_permission('documents'));

DROP POLICY IF EXISTS epi_photos_documents_delete ON storage.objects;
CREATE POLICY epi_photos_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'epi-photos' AND public.has_app_permission('documents'));

NOTIFY pgrst, 'reload schema';
