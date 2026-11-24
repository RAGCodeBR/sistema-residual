/**
 * Caçambas da Residual: catálogo de tipos (usado nas propostas) e cada
 * caçamba física, com número, situação e onde está.
 * Tabelas em supabase/migrations/20261120150000_create_dumpsters.sql.
 */
import { useQuery } from "@tanstack/react-query";
import { table } from "@/lib/company";

export const DUMPSTER_BUCKET = "dumpster-photos";

export type EquipmentType = {
  id: string;
  name: string;
  category: string;
  capacity: number | null;
  capacity_unit: string;
  proposal_text: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type DumpsterStatus = "patio" | "cliente" | "manutencao" | "baixada";
export type Dumpster = {
  id: string;
  code: string;
  type_id: string | null;
  cover: "aberta" | "fechada";
  status: DumpsterStatus;
  client_name: string | null;
  location_note: string | null;
  status_since: string;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const CATEGORIES = ["Caçamba", "Roll-on", "Container", "Tambor", "Bombona", "Outro"] as const;
export const CAPACITY_UNITS = ["m³", "L", "t"] as const;

/** Dias em cliente a partir dos quais a caçamba aparece como "parada" (a ata cita 30 dias). */
export const IDLE_ALERT_DAYS = 30;

export const DUMPSTER_STATUS: Record<DumpsterStatus, { label: string; short: string; className: string; tone: string }> = {
  patio: { label: "No pátio", short: "Pátio", className: "bg-primary/12 text-primary", tone: "text-primary" },
  cliente: { label: "Em cliente", short: "Cliente", className: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200", tone: "text-sky-600 dark:text-sky-300" },
  manutencao: { label: "Em manutenção", short: "Manutenção", className: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200", tone: "text-amber-600 dark:text-amber-300" },
  baixada: { label: "Baixada", short: "Baixada", className: "bg-muted text-muted-foreground", tone: "text-muted-foreground" },
};

export const typeLabel = (t: Pick<EquipmentType, "name"> | undefined | null) => t?.name ?? "Sem tipo";
export const defaultProposalText = (t: Pick<EquipmentType, "category" | "capacity" | "capacity_unit">) =>
  `${t.category === "Caçamba" ? "Caçamba estacionária" : t.category}${t.capacity ? ` com capacidade de ${String(t.capacity).replace(".", ",")} ${t.capacity_unit}` : ""}`;

const DAY = 86_400_000;
export const daysSince = (iso: string) => {
  const d = new Date();
  const today = Date.parse(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`);
  return Math.max(0, Math.round((today - Date.parse(`${iso}T00:00:00`)) / DAY));
};
export const isIdle = (d: Pick<Dumpster, "status" | "status_since">) => d.status === "cliente" && daysSince(d.status_since) >= IDLE_ALERT_DAYS;

export function useEquipmentTypes() {
  return useQuery({
    queryKey: ["equipment-types"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("equipment_types").select("id,name,category,capacity,capacity_unit,proposal_text,notes,active,created_at").order("category").order("capacity", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EquipmentType[];
    },
  });
}

export function useDumpsters() {
  return useQuery({
    queryKey: ["dumpsters"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await table("dumpsters").select("id,code,type_id,cover,status,client_name,location_note,status_since,photo_path,notes,created_at,updated_at");
      if (error) throw error;
      // Ordena pelo número de forma natural (2 antes de 10).
      return ((data ?? []) as Dumpster[]).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    },
  });
}
