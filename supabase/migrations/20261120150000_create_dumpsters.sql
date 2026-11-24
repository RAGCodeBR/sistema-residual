-- Caçambas da Residual (cadastro próprio, independente das tabelas herdadas
-- da Jacoby, como waste_equipment).
--  * equipment_types: catálogo de tipos (Caçamba 5 m³, Caçamba 26 m³, Tambor…)
--    — é o que a proposta escolhe e precifica.
--  * dumpsters: cada caçamba física, com número, situação e onde está —
--    base das futuras movimentações (entrega/retirada) e dos alertas de
--    caçamba parada.
-- Acesso: permissão de tela "dumpsters" (Cadastro de Equipamentos). Quem tem "proposals"
-- também lê o catálogo para montar as propostas.

-- Catálogo de tipos ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  category text NOT NULL DEFAULT 'Caçamba',
  capacity numeric CHECK (capacity IS NULL OR capacity > 0),
  capacity_unit text NOT NULL DEFAULT 'm³',
  -- Frase usada na proposta (ex.: "Caçamba estacionária com capacidade de 5 m³").
  proposal_text text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Caçambas (unidades) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dumpsters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Número pintado na caçamba.
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  type_id uuid REFERENCES public.equipment_types(id) ON DELETE SET NULL,
  cover text NOT NULL DEFAULT 'aberta' CHECK (cover IN ('aberta', 'fechada')),
  status text NOT NULL DEFAULT 'patio' CHECK (status IN ('patio', 'cliente', 'manutencao', 'baixada')),
  -- Onde está quando em cliente (por enquanto texto; vira vínculo com o
  -- cadastro de clientes junto com as movimentações).
  client_name text,
  location_note text,
  -- Desde quando está na situação atual (base do "parada há X dias").
  status_since date NOT NULL DEFAULT current_date,
  photo_path text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dumpsters_status_idx ON public.dumpsters(status, status_since);
CREATE INDEX IF NOT EXISTS dumpsters_type_idx ON public.dumpsters(type_id);

CREATE OR REPLACE FUNCTION public.dumpsters_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dumpsters_touch_updated_at ON public.dumpsters;
CREATE TRIGGER dumpsters_touch_updated_at
  BEFORE UPDATE ON public.dumpsters
  FOR EACH ROW EXECUTE FUNCTION public.dumpsters_touch_updated_at();

-- Permissões ----------------------------------------------------------------
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dumpsters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_types_read ON public.equipment_types;
CREATE POLICY equipment_types_read ON public.equipment_types
  FOR SELECT TO authenticated
  USING (public.has_app_permission('dumpsters') OR public.has_app_permission('proposals'));

DROP POLICY IF EXISTS equipment_types_manage ON public.equipment_types;
CREATE POLICY equipment_types_manage ON public.equipment_types
  FOR ALL TO authenticated
  USING (public.has_app_permission('dumpsters'))
  WITH CHECK (public.has_app_permission('dumpsters'));

DROP POLICY IF EXISTS dumpsters_manage ON public.dumpsters;
CREATE POLICY dumpsters_manage ON public.dumpsters
  FOR ALL TO authenticated
  USING (public.has_app_permission('dumpsters'))
  WITH CHECK (public.has_app_permission('dumpsters'));

-- Fotos (bucket privado; o app lê por links temporários) ---------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('dumpster-photos', 'dumpster-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS dumpster_photos_read ON storage.objects;
CREATE POLICY dumpster_photos_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dumpster-photos' AND public.has_app_permission('dumpsters'));
DROP POLICY IF EXISTS dumpster_photos_create ON storage.objects;
CREATE POLICY dumpster_photos_create ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dumpster-photos' AND public.has_app_permission('dumpsters'));
DROP POLICY IF EXISTS dumpster_photos_delete ON storage.objects;
CREATE POLICY dumpster_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'dumpster-photos' AND public.has_app_permission('dumpsters'));

-- Tipo inicial, o que aparece nas propostas atuais ---------------------------
INSERT INTO public.equipment_types (name, category, capacity, capacity_unit, proposal_text)
SELECT 'Caçamba 5 m³', 'Caçamba', 5, 'm³', 'Caçamba estacionária com capacidade de 5 m³'
WHERE NOT EXISTS (SELECT 1 FROM public.equipment_types);

NOTIFY pgrst, 'reload schema';
