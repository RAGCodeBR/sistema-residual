/**
 * Cadastro de Equipamentos da Residual:
 *  - Caçambas: cada caçamba física (número, tipo, situação, onde está, foto);
 *  - Veículos e máquinas: caminhões etc., com os documentos vinculados
 *    (mesmo cadastro usado em Documentos);
 *  - Tipos: catálogo usado nas propostas.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Box, Truck, Building2, Database, Loader2, MoreHorizontal, Package, Pencil, Plus, Search, Trash2, Warehouse, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isMissingTable, table, useCompanyDocuments, useEquipment } from "@/lib/company";
import { EquipmentPanel } from "@/components/company/EquipmentPanel";
import {
  DUMPSTER_BUCKET,
  DUMPSTER_STATUS,
  IDLE_ALERT_DAYS,
  daysSince,
  isIdle,
  typeLabel,
  useDumpsters,
  useEquipmentTypes,
  type Dumpster,
  type DumpsterStatus,
  type EquipmentType,
} from "@/lib/dumpsters";
import { shortDate, useProposals, type WasteContent } from "@/lib/proposals";
import { DumpsterDialog, TypeDialog } from "@/components/dumpsters/DumpsterDialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Tab = "cacambas" | "veiculos" | "tipos";
type Search = { aba?: "veiculos" | "tipos" };
export const Route = createFileRoute("/_app/equipamentos")({
  component: DumpstersPage,
  validateSearch: (s: Record<string, unknown>): Search => (s.aba === "tipos" || s.aba === "veiculos" ? { aba: s.aba } : {}),
});

type View = "all" | DumpsterStatus | "parada";

const TABS: { id: Tab; label: string; icon: typeof Box }[] = [
  { id: "cacambas", label: "Caçambas", icon: Box },
  { id: "veiculos", label: "Veículos e máquinas", icon: Truck },
  { id: "tipos", label: "Tipos", icon: Package },
];
const SUBTITLE: Record<Tab, string> = {
  cacambas: "Onde está cada caçamba e há quanto tempo.",
  veiculos: "Caminhões, máquinas e ferramentas, com a situação dos documentos de cada um.",
  tipos: "Tipos de equipamento que aparecem nas propostas.",
};

function DumpstersPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("dumpsters");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.aba ?? "cacambas";
  const typesQuery = useEquipmentTypes();
  const dumpstersQuery = useDumpsters();
  const notReady = isMissingTable(typesQuery.error) || isMissingTable(dumpstersQuery.error);
  // Veículos usam o cadastro da empresa, protegido pela permissão de Documentos.
  const canSeeVehicles = hasPermission("documents");
  const vehiclesQuery = useEquipment();
  const companyDocsQuery = useCompanyDocuments();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 max-md:space-y-3 max-md:p-3 max-md:pb-28 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold max-md:text-xl">Cadastro de Equipamentos</h1>
        <p className="text-sm text-muted-foreground max-md:hidden">
          {SUBTITLE[tab]}
        </p>
      </header>

      <div className="flex w-full rounded-full border bg-muted/40 p-0.5 sm:inline-flex sm:w-auto sm:rounded-lg sm:p-1" role="tablist" aria-label="Seção">
        {TABS.filter((t) => t.id !== "veiculos" || canSeeVehicles).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => void navigate({ search: id === "cacambas" ? {} : { aba: id }, replace: true })}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs transition sm:flex-none sm:text-sm sm:gap-2 sm:rounded-md sm:px-4 sm:py-1.5 ${tab === id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon className="h-4 w-4 shrink-0" />{label}
          </button>
        ))}
      </div>

      {tab === "veiculos" && canSeeVehicles ? (
        <EquipmentPanel
          equipment={vehiclesQuery.data ?? []}
          documents={companyDocsQuery.data ?? []}
          loading={vehiclesQuery.isLoading}
          canManage={canSeeVehicles}
          onOpenDocuments={(id) => void navigate({ to: "/documentos", search: { equipamento: id } })}
        />
      ) : notReady ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <Database className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-medium">Esta área ainda não foi ativada no banco de dados</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Rode a migração <code className="rounded bg-muted px-1 text-xs">20261120150000_create_dumpsters.sql</code> no Supabase e recarregue a página.
          </p>
        </div>
      ) : tab === "cacambas" ? (
        <DumpstersPanel dumpsters={dumpstersQuery.data ?? []} types={typesQuery.data ?? []} loading={dumpstersQuery.isLoading || typesQuery.isLoading} canManage={canManage} />
      ) : (
        <TypesPanel dumpsters={dumpstersQuery.data ?? []} types={typesQuery.data ?? []} loading={typesQuery.isLoading} canManage={canManage} />
      )}
    </div>
  );
}

/* Caçambas -------------------------------------------------------------------- */

function DumpstersPanel({ dumpsters, types, loading, canManage }: { dumpsters: Dumpster[]; types: EquipmentType[]; loading: boolean; canManage: boolean }) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("all");
  const [term, setTerm] = useState("");
  const [dialog, setDialog] = useState<{ editing: Dumpster | null } | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  // Links temporários das fotos.
  const photoPaths = useMemo(() => dumpsters.map((d) => d.photo_path).filter(Boolean) as string[], [dumpsters]);
  useEffect(() => {
    if (!photoPaths.length) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.storage.from(DUMPSTER_BUCKET).createSignedUrls(photoPaths, 60 * 60);
      if (!alive || !data) return;
      const rows = data as { path: string | null; signedUrl: string }[];
      setPhotos(Object.fromEntries(rows.filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl])));
    })();
    return () => {
      alive = false;
    };
  }, [photoPaths]);

  const counts = useMemo(() => {
    const c: Record<View, number> = { all: 0, patio: 0, cliente: 0, manutencao: 0, baixada: 0, parada: 0 };
    for (const d of dumpsters) {
      c[d.status] += 1;
      if (d.status !== "baixada") c.all += 1;
      if (isIdle(d)) c.parada += 1;
    }
    return c;
  }, [dumpsters]);

  const visible = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("pt-BR");
    return dumpsters
      .filter((d) => (view === "all" ? d.status !== "baixada" : view === "parada" ? isIdle(d) : d.status === view))
      .filter((d) => !q || [d.code, d.client_name ?? "", d.location_note ?? "", typeLabel(d.type_id ? typeById.get(d.type_id) : null), d.notes ?? ""].some((t) => t.toLocaleLowerCase("pt-BR").includes(q)))
      .sort((a, b) => (view === "parada" || view === "cliente" ? a.status_since.localeCompare(b.status_since) : 0));
  }, [dumpsters, view, term, typeById]);

  const remove = async (d: Dumpster) => {
    if (!confirm(`Excluir a caçamba ${d.code}? Para tirar de uso sem perder o histórico, prefira marcar como "Baixada".`)) return;
    const { error } = await table("dumpsters").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    if (d.photo_path) await supabase.storage.from(DUMPSTER_BUCKET).remove([d.photo_path]);
    await qc.invalidateQueries({ queryKey: ["dumpsters"] });
    toast.success("Caçamba excluída.");
  };
  const toggle = (v: View) => setView(view === v ? "all" : v);

  return (
    <div className="space-y-6 max-md:space-y-3">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-4 max-md:gap-0 max-md:divide-x max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:bg-card lg:grid-cols-4">
        <Metric icon={Warehouse} label="No pátio" value={counts.patio} hint="Disponíveis para entrega" tone={DUMPSTER_STATUS.patio.tone} active={view === "patio"} onClick={() => toggle("patio")} />
        <Metric icon={Building2} label="Em clientes" value={counts.cliente} hint="Entregues e em uso" tone={DUMPSTER_STATUS.cliente.tone} active={view === "cliente"} onClick={() => toggle("cliente")} />
        <Metric icon={AlertTriangle} label="Paradas" value={counts.parada} hint={`Em cliente há ${IDLE_ALERT_DAYS}+ dias`} tone="text-destructive" urgent={counts.parada > 0} active={view === "parada"} onClick={() => toggle("parada")} />
        <Metric icon={Wrench} label="Manutenção" value={counts.manutencao} hint="Fora de operação" tone={DUMPSTER_STATUS.manutencao.tone} active={view === "manutencao"} onClick={() => toggle("manutencao")} />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm max-md:rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por número, cliente ou tipo" className="pl-9 max-md:h-11" aria-label="Buscar caçambas" />
          </div>
          {canManage && <Button onClick={() => setDialog({ editing: null })} className="max-md:hidden"><Plus className="h-4 w-4" />Nova caçamba</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 max-md:hidden">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Situação">
            {(["all", "patio", "cliente", "parada", "manutencao", "baixada"] as View[]).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
                {id === "all" ? "Em operação" : id === "parada" ? "Paradas" : DUMPSTER_STATUS[id].label} <span className="tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Exibindo <strong className="tabular-nums text-foreground">{visible.length}</strong></p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando caçambas…</div>
        ) : !visible.length ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Box className="h-8 w-8 text-muted-foreground/60" />
            <div>
              <p className="font-medium">{dumpsters.length ? "Nenhuma caçamba com esses filtros" : "Nenhuma caçamba cadastrada ainda"}</p>
              <p className="text-sm text-muted-foreground">{dumpsters.length ? "Tente outra situação ou limpe a busca." : "Cadastre cada caçamba pelo número pintado nela."}</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((d) => {
              const meta = DUMPSTER_STATUS[d.status];
              const idle = isIdle(d);
              const days = daysSince(d.status_since);
              const t = d.type_id ? typeById.get(d.type_id) : undefined;
              const photo = d.photo_path ? photos[d.photo_path] : undefined;
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 max-md:px-3">
                  <button type="button" disabled={!canManage} onClick={() => setDialog({ editing: d })} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
                    {photo ? (
                      <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums ${meta.className}`}>{d.code.slice(0, 4)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold tabular-nums">Nº {d.code}</span>
                        <span className="truncate text-sm text-muted-foreground">{typeLabel(t)} · {d.cover}</span>
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${idle ? "bg-destructive/10 text-destructive" : meta.className}`}>{idle ? "Parada" : meta.label}</span>
                        <span className={`truncate ${idle ? "text-destructive" : "text-muted-foreground"}`}>
                          {d.status === "cliente" ? `${d.client_name} · há ${days} ${days === 1 ? "dia" : "dias"}` : `desde ${shortDate(d.status_since)}`}
                          {d.location_note ? ` · ${d.location_note}` : ""}
                        </span>
                      </span>
                    </span>
                  </button>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-muted-foreground" aria-label="Mais ações"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setDialog({ editing: d })} className="min-h-10"><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void remove(d)} className="min-h-10 text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage && (
        <Button onClick={() => setDialog({ editing: null })} className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full pl-5 pr-6 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] md:hidden">
          <Plus className="h-5 w-5" />Caçamba
        </Button>
      )}
      <DumpsterDialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)} editing={dialog?.editing ?? null} types={types} photoUrl={dialog?.editing?.photo_path ? photos[dialog.editing.photo_path] : null} />
    </div>
  );
}

/* Tipos ------------------------------------------------------------------------ */

function TypesPanel({ dumpsters, types, loading, canManage }: { dumpsters: Dumpster[]; types: EquipmentType[]; loading: boolean; canManage: boolean }) {
  const qc = useQueryClient();
  const proposals = useProposals();
  const [dialog, setDialog] = useState<{ editing: EquipmentType | null } | null>(null);

  // Por tipo: quantas caçambas em cada situação e em quantas propostas aprovadas ele aparece.
  const stats = useMemo(() => {
    const m = new Map<string, { patio: number; cliente: number; outros: number; aprovadas: number }>();
    const get = (id: string) => m.get(id) ?? (m.set(id, { patio: 0, cliente: 0, outros: 0, aprovadas: 0 }), m.get(id)!);
    for (const d of dumpsters) if (d.type_id && d.status !== "baixada") get(d.type_id)[d.status === "patio" ? "patio" : d.status === "cliente" ? "cliente" : "outros"] += 1;
    for (const p of proposals.data ?? []) {
      const typeId = p.template !== "assessoria" ? (p.content as WasteContent).equipment_type_id : null;
      if (typeId && p.status === "aprovada") get(typeId).aprovadas += 1;
    }
    return m;
  }, [dumpsters, proposals.data]);

  const remove = async (t: EquipmentType) => {
    if (!confirm(`Excluir o tipo "${t.name}"? As caçambas desse tipo ficam "sem tipo". Para só esconder das propostas, edite e desmarque "Tipo em uso".`)) return;
    const { error } = await table("equipment_types").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    await Promise.all([qc.invalidateQueries({ queryKey: ["equipment-types"] }), qc.invalidateQueries({ queryKey: ["dumpsters"] })]);
    toast.success("Tipo excluído.");
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm max-md:rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <p className="text-sm text-muted-foreground">Escolhidos na proposta (seção Equipamento) e no cadastro de cada caçamba.</p>
        {canManage && <Button onClick={() => setDialog({ editing: null })} className="shrink-0"><Plus className="h-4 w-4" />Novo tipo</Button>}
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
      ) : !types.length ? (
        <p className="p-12 text-center text-sm text-muted-foreground">Nenhum tipo cadastrado. Ex.: Caçamba 5 m³, Caçamba 26 m³, Tambor 200 L.</p>
      ) : (
        <ul className="divide-y">
          {types.map((t) => {
            const s = stats.get(t.id) ?? { patio: 0, cliente: 0, outros: 0, aprovadas: 0 };
            return (
              <li key={t.id} className={`flex items-center gap-3 px-4 py-3 max-md:px-3 ${t.active ? "" : "opacity-60"}`}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Package className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}{!t.active && <span className="ml-2 text-xs font-normal text-muted-foreground">fora de uso</span>}</p>
                  <p className="truncate text-sm text-muted-foreground">{t.proposal_text || t.category}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {s.patio} no pátio · {s.cliente} em clientes{s.outros ? ` · ${s.outros} em manutenção` : ""} · {s.aprovadas} {s.aprovadas === 1 ? "proposta aprovada" : "propostas aprovadas"}
                  </p>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-muted-foreground" aria-label="Mais ações"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setDialog({ editing: t })} className="min-h-10"><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void remove(t)} className="min-h-10 text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TypeDialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)} editing={dialog?.editing ?? null} />
    </section>
  );
}

function Metric({ icon: Icon, label, value, hint, tone, onClick, active, urgent }: { icon: typeof Box; label: string; value: number; hint: string; tone: string; onClick: () => void; active: boolean; urgent?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:rounded-none max-md:border-0 max-md:px-2 max-md:py-2.5 max-md:text-center max-md:shadow-none max-md:hover:translate-y-0 max-md:aria-pressed:bg-accent/60 ${active ? "md:border-primary/50 md:ring-2 md:ring-primary/15" : urgent ? "md:border-destructive/40" : ""}`}>
      <span className="flex items-start justify-between gap-2 max-md:block">
        <span className="max-md:flex max-md:flex-col max-md:items-center max-md:gap-0.5">
          <span className="block text-sm text-muted-foreground max-md:order-2 max-md:text-[11px] max-md:leading-tight">{label}</span>
          <span className={`mt-1 block text-2xl font-bold tabular-nums max-md:mt-0 max-md:text-xl ${tone}`}>{value}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground max-md:hidden">{hint}</span>
        </span>
        <Icon className={`h-5 w-5 max-md:hidden ${tone}`} />
      </span>
    </button>
  );
}
