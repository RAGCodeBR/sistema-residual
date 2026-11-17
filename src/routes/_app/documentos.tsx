import { createFileRoute } from "@tanstack/react-router";
import { Database, FileText, HardHat, Truck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isMissingTable, useCompanyDocuments, useEquipment } from "@/lib/company";
import { ALL, CompanyDocumentsPanel } from "@/components/company/CompanyDocumentsPanel";
import { EquipmentPanel } from "@/components/company/EquipmentPanel";
import { EpiPanel } from "@/components/company/EpiPanel";

type Tab = "documentos" | "equipamentos" | "epis";
type Search = { aba?: Exclude<Tab, "documentos">; equipamento?: string };

export const Route = createFileRoute("/_app/documentos")({
  component: CompanyDocumentsPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(s.aba === "equipamentos" || s.aba === "epis" ? { aba: s.aba } : {}),
    ...(typeof s.equipamento === "string" && s.equipamento ? { equipamento: s.equipamento } : {}),
  }),
});

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "equipamentos", label: "Equipamentos", icon: Truck },
  { id: "epis", label: "EPIs", icon: HardHat },
];
const SUBTITLE: Record<Tab, string> = {
  documentos: "Documentos da empresa e dos equipamentos, com os vencimentos em destaque.",
  equipamentos: "Veículos, máquinas e ferramentas, com a situação dos documentos de cada um.",
  epis: "Entregas de EPI por funcionário, com as fotos de cada entrega.",
};

function CompanyDocumentsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("documents");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.aba ?? "documentos";
  const equipmentFilter = search.equipamento ?? ALL;
  const go = (next: Search) => void navigate({ search: next, replace: true });

  const docsQuery = useCompanyDocuments();
  const equipmentQuery = useEquipment();
  const notReady = isMissingTable(docsQuery.error) || isMissingTable(equipmentQuery.error);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 max-md:space-y-3 max-md:p-3 max-md:pb-28 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold max-md:text-xl">Documentos</h1>
        <p className="text-sm text-muted-foreground max-md:hidden">{SUBTITLE[tab]}</p>
      </header>

      <div className="flex w-full rounded-full border bg-muted/40 p-0.5 sm:inline-flex sm:w-auto sm:rounded-lg sm:p-1" role="tablist" aria-label="Seção">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => go(id === "documentos" ? {} : { aba: id })}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-sm transition sm:flex-none sm:gap-2 sm:rounded-md sm:px-4 sm:py-1.5 ${tab === id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4 shrink-0" />{label}
          </button>
        ))}
      </div>

      {notReady ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <Database className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-medium">Esta área ainda não foi ativada no banco de dados</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Rode a migração <code className="rounded bg-muted px-1 text-xs">20261117130000_company_documents_equipment_epis.sql</code> no Supabase e recarregue a página.
          </p>
        </div>
      ) : tab === "documentos" ? (
        <CompanyDocumentsPanel
          documents={docsQuery.data ?? []}
          equipment={equipmentQuery.data ?? []}
          loading={docsQuery.isLoading || equipmentQuery.isLoading}
          canManage={canManage}
          equipmentFilter={equipmentFilter}
          onEquipmentFilterChange={(value) => go(value === ALL ? {} : { equipamento: value })}
        />
      ) : tab === "equipamentos" ? (
        <EquipmentPanel
          equipment={equipmentQuery.data ?? []}
          documents={docsQuery.data ?? []}
          loading={equipmentQuery.isLoading}
          canManage={canManage}
          onOpenDocuments={(id) => go({ equipamento: id })}
        />
      ) : (
        <EpiPanel canManage={canManage} />
      )}
    </div>
  );
}
