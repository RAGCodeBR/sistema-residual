-- Propostas comerciais (RESD nnn/aa): emissão pelo sistema e controle de
-- aprovação. Três modelos: resíduos por peso/volume, resíduos por caçamba e
-- assessoria ambiental. O conteúdo específico de cada modelo fica em
-- `content` (jsonb); os dados do cliente ficam gravados na própria proposta
-- para preservar o documento como foi enviado.
-- Acesso: administradores e quem tem a permissão de tela "proposals".

CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  number integer NOT NULL CHECK (number > 0),
  template text NOT NULL CHECK (template IN ('residuos_peso', 'residuos_cacamba', 'assessoria')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aprovada', 'recusada')),
  issued_on date NOT NULL DEFAULT current_date,
  issue_city text NOT NULL DEFAULT 'Cubatão',
  validity_days integer NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  subject text NOT NULL DEFAULT '',
  -- Cliente (cópia no momento da proposta)
  client_name text NOT NULL CHECK (length(btrim(client_name)) > 0),
  client_cnpj text,
  client_city text,
  client_phone text,
  client_email text,
  client_contact text,
  -- Conteúdo do modelo (itens de preço, escopo, condições…)
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Controle
  sent_on date,
  decided_on date,
  decision_note text,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, number)
);

CREATE INDEX IF NOT EXISTS proposals_status_idx ON public.proposals(status, issued_on DESC);
CREATE INDEX IF NOT EXISTS proposals_client_idx ON public.proposals(lower(client_name));

CREATE OR REPLACE FUNCTION public.proposals_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS proposals_touch_updated_at ON public.proposals;
CREATE TRIGGER proposals_touch_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.proposals_touch_updated_at();

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposals_permission_all ON public.proposals;
CREATE POLICY proposals_permission_all ON public.proposals
  FOR ALL TO authenticated
  USING (public.has_app_permission('proposals'))
  WITH CHECK (public.has_app_permission('proposals'));

NOTIFY pgrst, 'reload schema';
