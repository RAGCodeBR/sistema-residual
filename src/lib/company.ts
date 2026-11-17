/**
 * Controle interno da própria empresa: documentos (da empresa ou de um
 * equipamento), equipamentos, funcionários e entregas de EPI.
 * Tabelas criadas em supabase/migrations/20261117130000_company_documents_equipment_epis.sql.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DOCS_BUCKET = "company-documents";
export const EPI_BUCKET = "epi-photos";

export type Equipment = { id: string; name: string; kind: string; identifier: string | null; notes: string | null; active: boolean; created_at: string };
export type CompanyDocument = {
  id: string;
  title: string;
  description: string | null;
  equipment_id: string | null;
  file_name: string;
  storage_path: string;
  expires_at: string | null;
  notify_days_before: number;
  created_at: string;
};
export type Employee = { id: string; full_name: string; role: string | null; active: boolean };
export type EpiDelivery = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  delivered_on: string;
  items: string | null;
  notes: string | null;
  photo_paths: string[] | null;
  created_at: string;
};

export const EQUIPMENT_KINDS = ["Veículo", "Máquina", "Equipamento", "Ferramenta", "Outro"] as const;

// O app usa tabelas novas que ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const table = (name: string) => (supabase.from as any)(name);

export const isMissingTable = (error: unknown) => {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/i.test(e.message ?? ""));
};

export function useEquipment() {
  return useQuery({
    queryKey: ["company-equipment"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("company_equipment").select("id,name,kind,identifier,notes,active,created_at").order("name");
      if (error) throw error;
      return (data ?? []) as Equipment[];
    },
  });
}

export function useCompanyDocuments() {
  return useQuery({
    queryKey: ["company-documents"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("company_documents")
        .select("id,title,description,equipment_id,file_name,storage_path,expires_at,notify_days_before,created_at")
        .order("expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CompanyDocument[];
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["company-employees"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("company_employees").select("id,full_name,role,active").order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });
}

export function useEpiDeliveries() {
  return useQuery({
    queryKey: ["epi-deliveries"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("epi_deliveries")
        .select("id,employee_id,employee_name,delivered_on,items,notes,photo_paths,created_at")
        .order("delivered_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EpiDelivery[];
    },
  });
}

/* Situação de vencimento ---------------------------------------------------- */

export type DocStatus = "overdue" | "due_soon" | "ok" | "none";
const DAY = 86_400_000;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${todayIso()}T00:00:00`)) / DAY);
export const formatDate = (value: string) => value.split("-").reverse().join("/");
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const statusOf = (doc: Pick<CompanyDocument, "expires_at" | "notify_days_before">): DocStatus => {
  if (!doc.expires_at) return "none";
  const days = daysUntil(doc.expires_at);
  if (days < 0) return "overdue";
  return days <= Number(doc.notify_days_before || 0) ? "due_soon" : "ok";
};
export const STATUS_ORDER: Record<DocStatus, number> = { overdue: 0, due_soon: 1, ok: 2, none: 3 };
export const STATUS: Record<DocStatus, { label: string; className: string; tone: string }> = {
  overdue: { label: "Vencido", className: "bg-destructive/10 text-destructive", tone: "text-destructive" },
  due_soon: { label: "Vence em breve", className: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200", tone: "text-amber-600 dark:text-amber-300" },
  ok: { label: "Em dia", className: "bg-primary/12 text-primary", tone: "text-primary" },
  none: { label: "Sem vencimento", className: "bg-muted text-muted-foreground", tone: "text-muted-foreground" },
};
export const dueText = (doc: Pick<CompanyDocument, "expires_at">) => {
  if (!doc.expires_at) return "Sem data de vencimento";
  const days = daysUntil(doc.expires_at);
  if (days < 0) return `Venceu em ${formatDate(doc.expires_at)} · há ${plural(Math.abs(days), "dia")}`;
  if (days === 0) return `Vence hoje · ${formatDate(doc.expires_at)}`;
  return `Vence em ${formatDate(doc.expires_at)} · faltam ${plural(days, "dia")}`;
};
export const shortDue = (doc: Pick<CompanyDocument, "expires_at">) => {
  if (!doc.expires_at) return "";
  const days = daysUntil(doc.expires_at);
  if (days < 0) return `há ${plural(Math.abs(days), "dia")}`;
  if (days === 0) return "hoje";
  if (days <= 60) return `em ${plural(days, "dia")}`;
  return `até ${formatDate(doc.expires_at)}`;
};
