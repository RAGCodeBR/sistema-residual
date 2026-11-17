/**
 * Documentos da empresa: contadores de vencimento, busca, filtro por
 * equipamento e lista agrupada (Empresa → cada equipamento).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Download, Eye, FileText, Infinity as InfinityIcon, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { canPreviewInline, usePdfPreview } from "@/components/PdfPreviewDialog";
import { DOCS_BUCKET, STATUS, STATUS_ORDER, dueText, plural, shortDue, statusOf, table, type CompanyDocument, type DocStatus, type Equipment } from "@/lib/company";
import { EquipmentIcon } from "@/components/company/EquipmentIcon";
import { CompanyDocumentDialog } from "@/components/company/CompanyDocumentDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type View = "all" | DocStatus;
export const ALL = "all";
export const COMPANY_ONLY = "empresa";

export function CompanyDocumentsPanel({
  documents,
  equipment,
  loading,
  canManage,
  equipmentFilter,
  onEquipmentFilterChange,
}: {
  documents: CompanyDocument[];
  equipment: Equipment[];
  loading: boolean;
  canManage: boolean;
  equipmentFilter: string;
  onEquipmentFilterChange: (value: string) => void;
}) {
  const qc = useQueryClient();
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ editing?: CompanyDocument | null } | null>(null);

  const equipmentById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const scoped = useMemo(
    () =>
      equipmentFilter === ALL
        ? documents
        : equipmentFilter === COMPANY_ONLY
          ? documents.filter((d) => !d.equipment_id)
          : documents.filter((d) => d.equipment_id === equipmentFilter),
    [documents, equipmentFilter],
  );
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: scoped.length, overdue: 0, due_soon: 0, ok: 0, none: 0 };
    for (const doc of scoped) result[statusOf(doc)] += 1;
    return result;
  }, [scoped]);

  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const visible = scoped.filter((doc) => {
      if (view !== "all" && statusOf(doc) !== view) return false;
      if (!term) return true;
      const eq = doc.equipment_id ? equipmentById.get(doc.equipment_id) : undefined;
      return [doc.title, doc.file_name, doc.description ?? "", eq?.name ?? "", eq?.identifier ?? ""].some((t) => t.toLocaleLowerCase("pt-BR").includes(term));
    });
    const byKey = new Map<string, CompanyDocument[]>();
    for (const doc of visible) {
      const key = doc.equipment_id && equipmentById.has(doc.equipment_id) ? doc.equipment_id : COMPANY_ONLY;
      byKey.set(key, [...(byKey.get(key) ?? []), doc]);
    }
    const sortDocs = (list: CompanyDocument[]) =>
      [...list].sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] || (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999") || a.title.localeCompare(b.title, "pt-BR"));
    return [...byKey.entries()]
      .map(([key, docs]) => ({ key, equipment: key === COMPANY_ONLY ? null : equipmentById.get(key)!, docs: sortDocs(docs) }))
      .sort((a, b) => (a.key === COMPANY_ONLY ? -1 : b.key === COMPANY_ONLY ? 1 : a.equipment!.name.localeCompare(b.equipment!.name, "pt-BR")));
  }, [scoped, view, search, equipmentById]);
  const visibleCount = groups.reduce((n, g) => n + g.docs.length, 0);

  const signedUrl = async (doc: CompanyDocument, download?: boolean) => {
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 600, download ? { download: doc.file_name } : undefined);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível acessar o documento.");
    return data.signedUrl;
  };
  const download = async (doc: CompanyDocument) => {
    try {
      const link = document.createElement("a");
      link.href = await signedUrl(doc, true);
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o documento.");
    }
  };
  const preview = async (doc: CompanyDocument) => {
    if (!canPreviewInline(doc.file_name)) {
      toast.info("Esse tipo de arquivo não abre no navegador. Baixando…");
      return download(doc);
    }
    setBusyId(doc.id);
    try {
      const eq = doc.equipment_id ? equipmentById.get(doc.equipment_id) : undefined;
      openPdfPreview({ title: doc.title, subtitle: `${eq ? eq.name : "Empresa"} · ${doc.file_name}`, fileName: doc.file_name, url: await signedUrl(doc) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível visualizar o documento.");
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (doc: CompanyDocument) => {
    if (!confirm(`Excluir o documento "${doc.title}"?`)) return;
    const { error } = await table("company_documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from(DOCS_BUCKET).remove([doc.storage_path]);
    await qc.invalidateQueries({ queryKey: ["company-documents"] });
    toast.success("Documento excluído.");
  };

  const toggleView = (next: DocStatus) => setView(view === next ? "all" : next);
  const filtersActive = view !== "all" || !!search.trim() || equipmentFilter !== ALL;
  const filteredEquipment = equipmentFilter !== ALL && equipmentFilter !== COMPANY_ONLY ? equipmentById.get(equipmentFilter) : undefined;

  return (
    <div className="space-y-6 max-md:space-y-3">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-4 max-md:gap-0 max-md:divide-x max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:bg-card lg:grid-cols-4">
        <Metric icon={AlertTriangle} label="Vencidos" value={counts.overdue} hint="Precisam ser renovados" tone={STATUS.overdue.tone} urgent={counts.overdue > 0} onClick={() => toggleView("overdue")} active={view === "overdue"} />
        <Metric icon={CalendarClock} label="Vencem em breve" value={counts.due_soon} hint="Dentro do prazo de aviso" tone={STATUS.due_soon.tone} onClick={() => toggleView("due_soon")} active={view === "due_soon"} />
        <Metric icon={CheckCircle2} label="Em dia" value={counts.ok} hint="Vigentes, sem alerta" tone={STATUS.ok.tone} onClick={() => toggleView("ok")} active={view === "ok"} />
        <Metric icon={InfinityIcon} label="Sem vencimento" value={counts.none} hint="Não têm data de validade" tone={STATUS.none.tone} onClick={() => toggleView("none")} active={view === "none"} />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm max-md:rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b p-3 max-md:gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar documento, arquivo ou equipamento" className="pl-9 max-md:h-11" aria-label="Buscar documentos" />
          </div>
          <Select value={equipmentFilter} onValueChange={onEquipmentFilterChange}>
            <SelectTrigger className="w-full sm:w-64 max-md:h-11" aria-label="Filtrar por equipamento"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os documentos</SelectItem>
              <SelectItem value={COMPANY_ONLY}>Só da empresa</SelectItem>
              {equipment.length > 0 && <SelectSeparator />}
              {equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.identifier ? ` · ${e.identifier}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {canManage && (
            <Button onClick={() => setDialog({})} className="max-md:hidden">
              <Plus className="h-4 w-4" />Anexar documento
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 max-md:hidden">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Situação">
            {(["all", "overdue", "due_soon", "ok", "none"] as View[]).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
                {id === "all" ? "Todos" : STATUS[id].label} <span className="tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Exibindo <strong className="tabular-nums text-foreground">{visibleCount}</strong> de <span className="tabular-nums">{counts.all}</span></p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando documentos…</div>
        ) : !groups.length ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <div>
              <p className="font-medium">{filtersActive ? "Nenhum documento com esses filtros" : "Nenhum documento cadastrado ainda"}</p>
              <p className="text-sm text-muted-foreground">
                {filtersActive ? "Tente outra situação ou limpe a busca." : filteredEquipment ? `Anexe o primeiro documento de ${filteredEquipment.name}.` : "Use “Anexar documento” para enviar o primeiro."}
              </p>
            </div>
            {filtersActive && <Button variant="outline" size="sm" onClick={() => { setView("all"); setSearch(""); onEquipmentFilterChange(ALL); }}>Limpar filtros</Button>}
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => {
              const overdue = group.docs.filter((d) => statusOf(d) === "overdue").length;
              const dueSoon = group.docs.filter((d) => statusOf(d) === "due_soon").length;
              return (
                <div key={group.key}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/20 px-4 py-3">
                    {group.equipment ? <EquipmentIcon kind={group.equipment.kind} className="h-4 w-4 text-primary" /> : <Building2 className="h-4 w-4 text-primary" />}
                    <h2 className="font-semibold">{group.equipment ? group.equipment.name : "Empresa"}</h2>
                    {group.equipment?.identifier && <span className="text-xs tabular-nums text-muted-foreground">{group.equipment.identifier}</span>}
                    <span className="text-xs tabular-nums text-muted-foreground">{plural(group.docs.length, "documento")}</span>
                    {overdue > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.overdue.className}`}>{overdue} vencido{overdue === 1 ? "" : "s"}</span>}
                    {dueSoon > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.due_soon.className}`}>{dueSoon} vence{dueSoon === 1 ? "" : "m"} em breve</span>}
                  </div>
                  <ul className="py-1 max-md:divide-y max-md:py-0">
                    {group.docs.map((doc) => (
                      <DocRow key={doc.id} doc={doc} busy={busyId === doc.id} manage={canManage} onPreview={() => void preview(doc)} onDownload={() => void download(doc)} onEdit={() => setDialog({ editing: doc })} onRemove={() => void remove(doc)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {canManage && (
        <Button onClick={() => setDialog({})} className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full pl-5 pr-6 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] md:hidden">
          <Plus className="h-5 w-5" />Anexar
        </Button>
      )}

      {pdfPreviewDialog}
      <CompanyDocumentDialog
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        equipment={equipment}
        editing={dialog?.editing ?? null}
        defaultEquipmentId={equipmentFilter !== ALL && equipmentFilter !== COMPANY_ONLY ? equipmentFilter : null}
      />
    </div>
  );
}

function DocRow({ doc, busy, manage, onPreview, onDownload, onEdit, onRemove }: { doc: CompanyDocument; busy: boolean; manage: boolean; onPreview: () => void; onDownload: () => void; onEdit: () => void; onRemove: () => void }) {
  const status = statusOf(doc);
  const tone = STATUS[status];
  return (
    <li className="group mx-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2 max-md:mx-0 max-md:rounded-none max-md:px-4 max-md:py-0 max-md:hover:bg-transparent">
      {/* Celular: nome inteiro, situação compacta; tocar abre o documento. */}
      <div className="flex items-center gap-1 md:hidden">
        <button type="button" onClick={onPreview} disabled={busy} className="flex min-w-0 flex-1 items-start gap-3 py-3 text-left active:opacity-70">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.className}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{doc.title}</span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${tone.className}`}>{tone.label}</span>
              {doc.expires_at && <span className={`truncate tabular-nums ${status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>{shortDue(doc)}</span>}
            </span>
          </span>
        </button>
        <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-muted-foreground" onClick={onDownload} aria-label="Baixar documento"><Download className="h-4 w-4" /></Button>
        {manage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="-mr-2 h-10 w-10 shrink-0 text-muted-foreground" aria-label="Mais ações"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onPreview} className="min-h-10"><Eye className="mr-2 h-4 w-4" />Visualizar</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit} className="min-h-10"><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRemove} className="min-h-10 text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Computador */}
      <div className="hidden md:contents">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone.className}`}><FileText className="h-4 w-4" /></span>
        <button type="button" onClick={onPreview} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Visualizar documento">
          <span className="block truncate font-medium group-hover:text-primary">{doc.title}</span>
          <span className="block truncate text-sm text-muted-foreground">{doc.description || doc.file_name}</span>
        </button>
        <div className="flex min-w-[220px] flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.className}`}>{tone.label}</span>
          <span className={`text-xs tabular-nums ${status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>{dueText(doc)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onPreview} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Visualizar</Button>
          <Button size="sm" variant="outline" onClick={onDownload}><Download className="h-4 w-4" />Baixar</Button>
          {manage && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Editar documento" aria-label="Editar documento"><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove} title="Excluir documento" aria-label="Excluir documento"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Metric({ icon: Icon, label, value, hint, tone, onClick, active, urgent }: { icon: typeof FileText; label: string; value: number; hint: string; tone: string; onClick: () => void; active: boolean; urgent?: boolean }) {
  // O cartão inteiro filtra a lista; tocar de novo volta para "Todos".
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
