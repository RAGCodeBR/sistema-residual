/**
 * Propostas comerciais: lista com controle de situação (rascunho, aguardando
 * resposta, aprovadas, recusadas), busca e atalhos para PDF e respostas.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Clock, Copy, Eye, FileDown, FilePen, FileText, HardDrive, Loader2, MoreHorizontal, Plus, Search, Send, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { isMissingTable } from "@/lib/company";
import {
  STATUS_META,
  TEMPLATES,
  displayStatus,
  isLocalMode,
  proposalCode,
  proposalsDb,
  shortDate,
  useProposals,
  validUntil,
  valueSummary,
  type DisplayStatus,
  type Proposal,
  type ProposalStatus,
  type Template,
} from "@/lib/proposals";
import { MissingTable, StatusDialog, useProposalPdf } from "@/components/proposals/ProposalActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/propostas/")({ component: ProposalsPage });

type View = "all" | ProposalStatus | "vencida";
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "rascunho", label: "Rascunhos" },
  { id: "enviada", label: "Aguardando" },
  { id: "vencida", label: "Validade vencida" },
  { id: "aprovada", label: "Aprovadas" },
  { id: "recusada", label: "Recusadas" },
];
const matches = (view: View, s: DisplayStatus) => view === "all" || view === s || (view === "enviada" && s === "vencida");

function ProposalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useProposals();
  const { previewPdf, sharePdf, pdfBusy, pdfDialog } = useProposalPdf();
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<{ p: Proposal; s: ProposalStatus } | null>(null);
  const proposals = useMemo(() => query.data ?? [], [query.data]);

  const counts = useMemo(() => {
    const c: Record<View, number> = { all: proposals.length, rascunho: 0, enviada: 0, vencida: 0, aprovada: 0, recusada: 0 };
    for (const p of proposals) {
      const s = displayStatus(p);
      c[s] += 1;
      if (s === "vencida") c.enviada += 1;
    }
    return c;
  }, [proposals]);
  const decided = counts.aprovada + counts.recusada;
  const approvalRate = decided ? Math.round((counts.aprovada / decided) * 100) : null;

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return proposals.filter((p) => {
      if (!matches(view, displayStatus(p))) return false;
      if (!term) return true;
      return [proposalCode(p), p.client_name, p.subject, p.client_contact ?? "", TEMPLATES[p.template].short].some((t) => t.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [proposals, view, search]);

  if (isMissingTable(query.error)) return <MissingTable />;

  const newProposal = (modelo: Template) => void navigate({ to: "/propostas/$proposalId", params: { proposalId: "nova" }, search: { modelo } });
  const duplicate = (p: Proposal) => void navigate({ to: "/propostas/$proposalId", params: { proposalId: "nova" }, search: { de: p.id } });
  const remove = async (p: Proposal) => {
    if (!confirm(`Excluir a proposta ${proposalCode(p)} · ${p.client_name}? Essa ação não pode ser desfeita.`)) return;
    try {
      await proposalsDb.remove(p.id);
      await qc.invalidateQueries({ queryKey: ["proposals"] });
      toast.success("Proposta excluída.");
    } catch (error) {
      toast.error((error as { message?: string })?.message || "Não foi possível excluir.");
    }
  };

  const NewMenu = ({ mobile }: { mobile?: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {mobile ? (
          <Button className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full pl-5 pr-6 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] md:hidden"><Plus className="h-5 w-5" />Nova</Button>
        ) : (
          <Button className="max-md:hidden"><Plus className="h-4 w-4" />Nova proposta</Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Escolha o modelo</DropdownMenuLabel>
        {(Object.keys(TEMPLATES) as Template[]).map((t) => (
          <DropdownMenuItem key={t} onClick={() => newProposal(t)} className="flex-col items-start gap-0.5 py-2">
            <span className="font-medium">{TEMPLATES[t].label}</span>
            <span className="text-xs text-muted-foreground">{TEMPLATES[t].description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 max-md:space-y-3 max-md:p-3 max-md:pb-28 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold max-md:text-xl">Propostas</h1>
          <p className="text-sm text-muted-foreground max-md:hidden">Emita as propostas em PDF e acompanhe quais foram aprovadas ou recusadas.</p>
        </div>
        <NewMenu />
      </header>

      {isLocalMode() && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Modo de teste (só neste navegador).</strong> A tabela de propostas ainda não existe no Supabase, então o que você criar aqui fica salvo apenas neste computador. Rode a migração <code className="rounded bg-amber-100 px-1 text-xs dark:bg-amber-400/20">20261120120000_create_proposals.sql</code> para usar o banco.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-4 max-md:gap-0 max-md:divide-x max-md:overflow-hidden max-md:rounded-2xl max-md:border max-md:bg-card lg:grid-cols-4">
        <Metric icon={FilePen} label="Rascunhos" value={counts.rascunho} hint="Ainda não enviados" tone={STATUS_META.rascunho.tone} active={view === "rascunho"} onClick={() => setView(view === "rascunho" ? "all" : "rascunho")} />
        <Metric icon={Clock} label="Aguardando" value={counts.enviada} hint={counts.vencida ? `${counts.vencida} com validade vencida` : "Enviadas, sem resposta"} tone={STATUS_META.enviada.tone} active={view === "enviada"} onClick={() => setView(view === "enviada" ? "all" : "enviada")} />
        <Metric icon={CheckCircle2} label="Aprovadas" value={counts.aprovada} hint={approvalRate != null ? `${approvalRate}% das respondidas` : "Nenhuma resposta ainda"} tone={STATUS_META.aprovada.tone} active={view === "aprovada"} onClick={() => setView(view === "aprovada" ? "all" : "aprovada")} />
        <Metric icon={XCircle} label="Recusadas" value={counts.recusada} hint="Com o motivo registrado" tone={STATUS_META.recusada.tone} active={view === "recusada"} onClick={() => setView(view === "recusada" ? "all" : "recusada")} />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm max-md:rounded-2xl">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número, cliente ou assunto" className="pl-9 max-md:h-11" aria-label="Buscar propostas" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 max-md:hidden">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Situação">
            {VIEWS.map(({ id, label }) => (
              <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}>
                {label} <span className="tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Exibindo <strong className="tabular-nums text-foreground">{visible.length}</strong> de <span className="tabular-nums">{counts.all}</span></p>
        </div>

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando propostas…</div>
        ) : query.error ? (
          <div className="p-12 text-center text-sm text-destructive">{(query.error as { message?: string }).message || "Não foi possível carregar as propostas."}</div>
        ) : !visible.length ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <div>
              <p className="font-medium">{proposals.length ? "Nenhuma proposta com esses filtros" : "Nenhuma proposta ainda"}</p>
              <p className="text-sm text-muted-foreground">{proposals.length ? "Tente outra situação ou limpe a busca." : "Use “Nova proposta” e escolha o modelo."}</p>
            </div>
            {proposals.length > 0 && <Button variant="outline" size="sm" onClick={() => { setView("all"); setSearch(""); }}>Limpar filtros</Button>}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((p) => (
              <ProposalRow
                key={p.id}
                p={p}
                pdfBusy={pdfBusy}
                onPreview={() => void previewPdf(p)}
                onShare={() => void sharePdf(p)}
                onStatus={(s) => setStatus({ p, s })}
                onDuplicate={() => duplicate(p)}
                onRemove={() => void remove(p)}
              />
            ))}
          </ul>
        )}
      </section>

      <NewMenu mobile />
      {pdfDialog}
      <StatusDialog proposal={status?.p ?? null} status={status?.s ?? null} onClose={() => setStatus(null)} />
    </div>
  );
}

function ProposalRow({ p, pdfBusy, onPreview, onShare, onStatus, onDuplicate, onRemove }: { p: Proposal; pdfBusy: boolean; onPreview: () => void; onShare: () => void; onStatus: (s: ProposalStatus) => void; onDuplicate: () => void; onRemove: () => void }) {
  const s = displayStatus(p);
  const meta = STATUS_META[s];
  const value = valueSummary(p);
  const when =
    p.status === "aprovada" || p.status === "recusada"
      ? `Respondida em ${shortDate(p.decided_on)}`
      : p.status === "enviada"
        ? `Enviada em ${shortDate(p.sent_on)} · válida até ${shortDate(validUntil(p))}`
        : `Emitida em ${shortDate(p.issued_on)}`;

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 max-md:gap-2 max-md:px-3">
      <Link to="/propostas/$proposalId" params={{ proposalId: p.id }} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold tabular-nums ${meta.className}`}>{String(p.number).padStart(3, "0")}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium group-hover:text-primary">{p.client_name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground max-md:hidden">{proposalCode(p)}</span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">{p.subject}{value ? ` · ${value}` : ""}</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${meta.className}`}>{meta.label}</span>
            <span className="truncate tabular-nums text-muted-foreground">{when}</span>
          </span>
          {p.status === "recusada" && p.decision_note && <span className="mt-1 block truncate text-xs text-muted-foreground">Motivo: {p.decision_note}</span>}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {p.status === "rascunho" && <Button size="sm" variant="outline" className="max-md:hidden" onClick={() => onStatus("enviada")}><Send className="h-4 w-4" />Enviada</Button>}
        {p.status === "enviada" && (
          <>
            <Button size="sm" variant="outline" className="max-md:hidden" onClick={() => onStatus("aprovada")}><CheckCircle2 className="h-4 w-4 text-primary" />Aprovou</Button>
            <Button size="sm" variant="outline" className="max-md:hidden" onClick={() => onStatus("recusada")}><XCircle className="h-4 w-4 text-destructive" />Recusou</Button>
          </>
        )}
        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground max-md:hidden" disabled={pdfBusy} onClick={onPreview} title="Ver PDF" aria-label="Ver PDF"><Eye className="h-4 w-4" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground" aria-label="Mais ações"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild className="min-h-10"><Link to="/propostas/$proposalId" params={{ proposalId: p.id }}><ChevronRight className="mr-2 h-4 w-4" />Abrir</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={onPreview} className="min-h-10"><Eye className="mr-2 h-4 w-4" />Ver PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={onShare} className="min-h-10"><FileDown className="mr-2 h-4 w-4" />Baixar / enviar PDF</DropdownMenuItem>
            <DropdownMenuSeparator />
            {p.status === "rascunho" && <DropdownMenuItem onClick={() => onStatus("enviada")} className="min-h-10"><Send className="mr-2 h-4 w-4" />Marcar como enviada</DropdownMenuItem>}
            {p.status === "enviada" && (
              <>
                <DropdownMenuItem onClick={() => onStatus("aprovada")} className="min-h-10"><CheckCircle2 className="mr-2 h-4 w-4 text-primary" />Cliente aprovou</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatus("recusada")} className="min-h-10"><XCircle className="mr-2 h-4 w-4 text-destructive" />Cliente recusou</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={onDuplicate} className="min-h-10"><Copy className="mr-2 h-4 w-4" />Duplicar (novo número)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove} className="min-h-10 text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function Metric({ icon: Icon, label, value, hint, tone, onClick, active }: { icon: typeof FileText; label: string; value: number; hint: string; tone: string; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:rounded-none max-md:border-0 max-md:px-2 max-md:py-2.5 max-md:text-center max-md:shadow-none max-md:hover:translate-y-0 max-md:aria-pressed:bg-accent/60 ${active ? "md:border-primary/50 md:ring-2 md:ring-primary/15" : ""}`}>
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
