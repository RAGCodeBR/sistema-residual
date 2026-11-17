-- Controle interno da própria empresa: documentos (da empresa ou de um
-- equipamento), equipamentos (veículos, máquinas, ferramentas…),
-- funcionários e entregas de EPI com fotos.
-- Acesso: administradores e quem tem a permissão de tela "documents".

-- Equipamentos (veículos, máquinas, ferramentas…) ----------------------------
CREATE TABLE IF NOT EXISTS public.company_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  kind text NOT NULL DEFAULT 'Veículo',
  -- Placa, número de série ou patrimônio.
  identifier text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Funcionários --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  role text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Documentos ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  equipment_id uuid REFERENCES public.company_equipment(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  expires_at date,
  notify_days_before integer NOT NULL DEFAULT 30 CHECK (notify_days_before >= 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_documents_equipment_idx ON public.company_documents(equipment_id);
CREATE INDEX IF NOT EXISTS company_documents_expires_idx ON public.company_documents(expires_at);

-- Entregas de EPI -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epi_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.company_employees(id) ON DELETE SET NULL,
  -- Nome guardado no registro para preservar o histórico.
  employee_name text NOT NULL CHECK (length(btrim(employee_name)) > 0),
  delivered_on date NOT NULL DEFAULT current_date,
  items text,
  notes text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS epi_deliveries_employee_idx ON public.epi_deliveries(employee_id, delivered_on DESC);

-- Permissões (mesma regra para as quatro tabelas) ----------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_equipment','company_employees','company_documents','epi_deliveries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_documents_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_app_permission(''documents'')) WITH CHECK (public.has_app_permission(''documents''))',
      t || '_documents_all', t);
  END LOOP;
END $$;

-- Arquivos privados (o app lê por links temporários) -------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('company-documents', 'company-documents', false),
  ('epi-photos', 'epi-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS company_files_documents_read ON storage.objects;
CREATE POLICY company_files_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('company-documents','epi-photos') AND public.has_app_permission('documents'));

DROP POLICY IF EXISTS company_files_documents_create ON storage.objects;
CREATE POLICY company_files_documents_create ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('company-documents','epi-photos') AND public.has_app_permission('documents'));

DROP POLICY IF EXISTS company_files_documents_delete ON storage.objects;
CREATE POLICY company_files_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('company-documents','epi-photos') AND public.has_app_permission('documents'));

NOTIFY pgrst, 'reload schema';
