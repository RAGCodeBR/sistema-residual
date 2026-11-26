import { createFileRoute } from "@tanstack/react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { table } from "@/lib/company";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { ContractAction } from "@/components/contracts/ContractAction";
import { ContractSheet, StatusBadge } from "@/components/contracts/ContractDetails";
import {
  daysUntil,
  remainingLabel,
  signatureCount,
  statuses,
  statusTone,
  type ContractRecord,
  type ContractStatus,
} from "@/components/contracts/contract-status";
import { proposalCode, shortDate } from "@/lib/proposals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/contratos")({ component: Contracts });

type Filter = "todos" | "propostas" | ContractStatus;
type QueueItem = {
  id: string;
  year: number;
  number: number;
  client_name: string;
  subject: string;
  decided_on: string | null;
};

const PAGE = 25;
const stages: { key: Exclude<Filter, "todos">; label: string }[] = [
  { key: "propostas", label: "Aguardando contrato" },
  { key: "assinatura", label: "Aguardando assinaturas" },
  { key: "aguardando", label: "Aguardando vigência" },
  { key: "agendado", label: "Início futuro" },
  { key: "ativo", label: "Ativos" },
  { key: "encerrado", label: "Encerrados" },
];

/** Termo de busca seguro para o filtro `or` do PostgREST. */
const cleanTerm = (s: string) => s.replace(/[%,()*\\]/g, " ").trim();

function Contracts() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("todos"),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const term = cleanTerm(useDeferredValue(search));
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();

  function choose(next: Filter) {
    setPage(0);
    setFilter((current) => (current === next ? "todos" : next));
  }

  const counts = useQuery({
    queryKey: ["contract-register", user?.id, "counts"],
    refetchInterval: 15000,
    queryFn: async () => {
      const [register, queue] = await Promise.all([
        table("contract_register").select("status"),
        table("contract_proposal_queue").select("id", { head: true, count: "exact" }),
      ]);
      if (register.error) throw new Error(register.error.message);
      if (queue.error) throw new Error(queue.error.message);
      const result: Record<string, number> = { propostas: queue.count ?? 0 };
      for (const { status } of register.data as { status: ContractStatus }[])
        result[status] = (result[status] ?? 0) + 1;
      return result;
    },
  });

  const showQueue = filter === "todos" || filter === "propostas";
  const queue = useQuery({
    queryKey: ["contract-register", user?.id, "queue", filter, page, term],
    enabled: showQueue,
    staleTime: 0,
    refetchInterval: 15000,
    queryFn: async () => {
      let q = table("contract_proposal_queue").select("*");
      if (term) q = q.ilike("client_name", "%" + term + "%");
      const from = filter === "propostas" ? page * PAGE : 0;
      const { data, error } = await q
        .order("decided_on", { ascending: true, nullsFirst: false })
        .order("year", { ascending: true })
        .order("number", { ascending: true })
        .range(from, from + PAGE);
      if (error) throw new Error(error.message);
      return data as QueueItem[];
    },
  });

  const list = useQuery({
    queryKey: ["contract-register", user?.id, "list", filter, page, term],
    enabled: filter !== "propostas",
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      let q = table("contract_register").select("*");
      if (filter !== "todos") q = q.eq("status", filter);
      if (term) q = q.or(`client_name.ilike.%${term}%,number.ilike.%${term}%`);
      const { data, error } = await q
        .order(filter === "ativo" ? "ends_on" : "created_at", { ascending: filter === "ativo" })
        .order("proposal_id")
        .range(page * PAGE, page * PAGE + PAGE);
      if (error) throw new Error(error.message);
      return data as ContractRecord[];
    },
  });

  const current = filter === "propostas" ? queue : list;
  const hasNext = (current.data?.length ?? 0) > PAGE;
  const totalContracts = Object.entries(counts.data ?? {})
    .filter(([k]) => k !== "propostas")
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos</h1>
          <p className="text-sm text-muted-foreground">
            Da proposta aprovada ao contrato em vigor.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Buscar por cliente ou número"
            placeholder="Buscar cliente ou número"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
          />
        </div>
      </header>

      <nav
        aria-label="Etapas dos contratos"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        {stages.map(({ key, label }) => {
          const n = counts.data?.[key];
          const active = filter === key;
          const attention = key === "propostas" && !!n;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => choose(key)}
              className={cn(
                "group rounded-xl border bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active &&
                  "border-primary bg-primary/5 ring-1 ring-primary hover:border-primary hover:bg-primary/5",
                attention && !active && "border-orange-500/40 bg-orange-500/5",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", statusTone[key].dot)} aria-hidden />
                <span className="truncate">{label}</span>
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums">
                {n ?? (counts.isPending ? "·" : 0)}
              </span>
            </button>
          );
        })}
      </nav>

      {showQueue && (
        <QueueSection
          filter={filter}
          query={queue}
          total={counts.data?.propostas}
          searching={!!term}
          onSeeAll={() => choose("propostas")}
          onIssued={(id) => setSelected(id)}
          showIssued={openPdfPreview}
        />
      )}

      {filter !== "propostas" && (
        <section className="space-y-3" aria-labelledby="contracts-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="contracts-heading" className="font-semibold">
              {filter === "todos" ? "Todos os contratos" : statuses[filter]}
              {filter === "todos" && counts.data && (
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                  {totalContracts}
                </span>
              )}
            </h2>
            {filter !== "todos" && (
              <Button size="sm" variant="ghost" onClick={() => choose(filter)}>
                <X aria-hidden /> Mostrar todos
              </Button>
            )}
          </div>
          {list.isPending ? (
            <ListSkeleton />
          ) : list.isError ? (
            <p role="alert" className="rounded-xl border p-4 text-sm text-destructive">
              {list.error.message}
            </p>
          ) : list.data.length ? (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {list.data.slice(0, PAGE).map((row) => (
                <li key={row.proposal_id}>
                  <ContractListItem row={row} onOpen={() => setSelected(row.proposal_id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {term
                ? "Nenhum contrato encontrado para essa busca."
                : "Nenhum contrato nesta etapa."}
            </p>
          )}
        </section>
      )}

      {(page > 0 || hasNext) && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">Página {page + 1}</span>
          <Button variant="outline" disabled={!hasNext} onClick={() => setPage(page + 1)}>
            Próxima
          </Button>
        </div>
      )}

      <ContractSheet id={selected} onOpenChange={(open) => !open && setSelected(null)} />
      {pdfPreviewDialog}
    </main>
  );
}

function QueueSection({
  filter,
  query,
  total,
  searching,
  onSeeAll,
  onIssued,
  showIssued,
}: {
  filter: Filter;
  query: UseQueryResult<QueueItem[]>;
  total: number | undefined;
  searching: boolean;
  onSeeAll: () => void;
  onIssued: (id: string) => void;
  showIssued: Parameters<typeof ContractAction>[0]["showIssued"];
}) {
  const full = filter === "propostas";
  const items = query.data?.slice(0, full ? PAGE : 5) ?? [];
  // Na visão geral, o bloco só aparece quando há algo para gerar.
  if (!full && (query.isPending || query.isError || !query.data?.length)) return null;
  return (
    <section
      aria-labelledby="queue-heading"
      className="space-y-3 rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="queue-heading" className="flex items-center gap-2 font-semibold">
            <span className="size-2 rounded-full bg-orange-500" aria-hidden />
            Propostas aprovadas aguardando contrato
            {total != null && (
              <span className="rounded-full bg-orange-500/15 px-2 text-xs font-semibold text-orange-700 tabular-nums dark:text-orange-300">
                {total}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            As mais antigas primeiro. Gere o contrato para seguir para as assinaturas.
          </p>
        </div>
        {full && (
          <Button size="sm" variant="ghost" onClick={onSeeAll}>
            <X aria-hidden /> Mostrar todos
          </Button>
        )}
      </div>
      {query.isPending ? (
        <ListSkeleton rows={2} />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      ) : items.length ? (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-mono">{proposalCode(p)}</span>
                  {p.decided_on && <span>· aprovada em {shortDate(p.decided_on)}</span>}
                </p>
                <p className="truncate font-medium">{p.client_name}</p>
                <p className="truncate text-sm text-muted-foreground">{p.subject}</p>
              </div>
              <ContractAction
                id={p.id}
                context={proposalCode(p) + " · " + p.client_name}
                showIssued={showIssued}
                onIssued={onIssued}
                triggerProps={{ size: "sm", variant: "default" }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {searching
            ? "Nenhuma proposta aprovada encontrada para essa busca."
            : "Nenhuma proposta aprovada aguardando contrato."}
        </p>
      )}
      {!full && (total ?? 0) > items.length && (
        <Button size="sm" variant="link" className="h-auto px-0" onClick={onSeeAll}>
          Ver todas as {total} propostas
        </Button>
      )}
    </section>
  );
}

function nextStep(r: ContractRecord) {
  switch (r.status) {
    case "assinatura": {
      const missing = [!r.customer_signer && "contratante", !r.residual_signer && "Residual"]
        .filter(Boolean)
        .join(" e ");
      return { text: "Falta assinatura: " + missing, strong: true };
    }
    case "aguardando":
      return { text: "Registrar início da vigência", strong: true };
    case "agendado":
      return { text: "Começa em " + shortDate(r.starts_on), strong: false };
    case "ativo": {
      const days = daysUntil(r.ends_on);
      return {
        text:
          "Até " + shortDate(r.ends_on) + (days !== undefined ? " · " + remainingLabel(days) : ""),
        strong: days !== undefined && days <= 30,
      };
    }
    case "encerrado":
      return { text: "Encerrou em " + shortDate(r.ends_on), strong: false };
  }
}

function ContractListItem({ row: r, onOpen }: { row: ContractRecord; onOpen: () => void }) {
  const step = nextStep(r);
  const signed = signatureCount(r);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,14rem)_1rem] sm:p-4"
    >
      <div className="min-w-0">
        <p className="font-mono text-xs text-muted-foreground">Contrato {r.number}</p>
        <p className="truncate font-medium">{r.client_name}</p>
        <p className="truncate text-sm text-muted-foreground">{r.subject}</p>
      </div>
      <div className="flex flex-col items-end gap-1 sm:items-start">
        <StatusBadge status={r.status} row={r} />
        {r.status === "assinatura" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <span className="flex gap-0.5" aria-hidden>
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-3 rounded-full",
                    i < signed ? "bg-emerald-500" : "bg-muted-foreground/25",
                  )}
                />
              ))}
            </span>
            {signed} de 2 assinaturas
          </span>
        )}
      </div>
      <p
        className={cn(
          "col-span-2 text-xs sm:col-span-1 sm:text-sm",
          step.strong ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {step.text}
      </p>
      <ChevronRight
        className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
        aria-hidden
      />
    </button>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-xl border bg-card" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
