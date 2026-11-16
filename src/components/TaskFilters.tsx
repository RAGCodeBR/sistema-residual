import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ChevronDown,
  X,
  Users,
  UserCheck,
  PenSquare,
  Filter as FilterIcon,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useClients, useColumns, useTaskProfiles } from "@/hooks/use-data";

import { dateFilterLabels, matchDateFilter, type DateFilter } from "@/lib/task-utils";

export type TaskScope = "all" | "mine" | "created";

interface Filters {
  search?: string;
  scope?: TaskScope;
  date?: DateFilter;
  client?: string; // legacy single-select (still respected)
  clients?: string[]; // multi-select
  assignee?: string;
  priority?: string;
  status?: string;
}

const SCOPE_LABELS: Record<TaskScope, string> = { all: "Todas", mine: "Atribuídas a mim", created: "Criadas por mim" };
const PRIORITY_LABELS: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

// Destaca o gatilho de um filtro quando ele está aplicado.
const triggerCls = (active: boolean) =>
  `h-8 text-xs transition-colors ${active ? "border-primary/50 bg-accent/60 font-medium text-accent-foreground" : ""}`;

const DATE_OPTIONS: DateFilter[] = [
  "all",
  "today",
  "due_today",
  "tomorrow",
  "this_week",
  "this_month",
  "overdue",
  "no_due",
  "pending",
  "completed",
];

export function TaskFilters({ filters, onChange, children }: { filters: Filters; onChange: (f: Filters) => void; children?: ReactNode }) {
  const { data: clients } = useClients();
  const { data: profiles } = useTaskProfiles();
  const { data: columns = [] } = useColumns();
  const [clientsOpen, setClientsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const scope: TaskScope = filters.scope ?? "all";
  const dateVal: DateFilter = filters.date ?? "all";

  const selectedClients = useMemo<string[]>(() => {
    if (filters.clients && filters.clients.length > 0) return filters.clients;
    if (filters.client) return [filters.client];
    return [];
  }, [filters.clients, filters.client]);

  const setSelectedClients = (ids: string[]) => {
    onChange({ ...filters, clients: ids.length > 0 ? ids : undefined, client: undefined });
  };

  const toggleClient = (id: string) => {
    setSelectedClients(
      selectedClients.includes(id)
        ? selectedClients.filter((c) => c !== id)
        : [...selectedClients, id],
    );
  };

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clients ?? [];
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [clients, search]);

  const allSelected = (clients?.length ?? 0) > 0 && selectedClients.length === clients?.length;

  const clientsLabel =
    selectedClients.length === 0
      ? "Clientes"
      : selectedClients.length === 1
        ? (clients?.find((c) => c.id === selectedClients[0])?.name ?? "1 cliente")
        : `${selectedClients.length} clientes`;

  const activeCount = [
    !!filters.search?.trim(),
    scope !== "all",
    dateVal !== "all",
    selectedClients.length > 0,
    !!filters.assignee,
    !!filters.priority,
    !!filters.status,
  ].filter(Boolean).length;

  const clearAll = () => onChange({});

  const assigneeProfile = profiles?.find((p) => p.id === filters.assignee);
  const chips: { key: string; label: string; clear: () => void }[] = [
    filters.search?.trim() ? { key: "search", label: `Busca: “${filters.search.trim()}”`, clear: () => onChange({ ...filters, search: undefined }) } : null,
    scope !== "all" ? { key: "scope", label: SCOPE_LABELS[scope], clear: () => onChange({ ...filters, scope: undefined }) } : null,
    dateVal !== "all" ? { key: "date", label: `Prazo: ${dateFilterLabels[dateVal]}`, clear: () => onChange({ ...filters, date: undefined }) } : null,
    selectedClients.length > 0 ? { key: "clients", label: `Cliente: ${clientsLabel}`, clear: () => setSelectedClients([]) } : null,
    filters.assignee ? { key: "assignee", label: `Responsável: ${assigneeProfile?.full_name || assigneeProfile?.email || "—"}`, clear: () => onChange({ ...filters, assignee: undefined }) } : null,
    filters.priority ? { key: "priority", label: `Prioridade: ${PRIORITY_LABELS[filters.priority] ?? filters.priority}`, clear: () => onChange({ ...filters, priority: undefined }) } : null,
    filters.status ? { key: "status", label: `Status: ${columns.find((c) => c.id === filters.status)?.name ?? "—"}`, clear: () => onChange({ ...filters, status: undefined }) } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => chip !== null);

  // Os mesmos controles servem às duas versões: em linha no computador e
  // empilhados, em tamanho de toque, na gaveta de filtros do celular.
  const renderFields = (mobile: boolean) => {
    const field = (label: string, control: ReactNode) =>
      mobile ? (
        <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          {control}
        </label>
      ) : (
        control
      );
    return (
      <>
        {field("Prazo", (
        <Select value={dateVal} onValueChange={(v) => onChange({ ...filters, date: v === "all" ? undefined : (v as DateFilter) })}>
          <SelectTrigger className={`${triggerCls(dateVal !== "all")} ${mobile ? "h-11 w-full text-sm" : "w-36"}`} aria-label="Prazo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {d === "all" ? "Qualquer prazo" : dateFilterLabels[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        ))}
        {field("Clientes", (
        <Popover open={clientsOpen} onOpenChange={setClientsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`${triggerCls(selectedClients.length > 0)} justify-between gap-1.5 font-normal ${mobile ? "h-11 w-full text-sm" : ""}`}>
              <span className={mobile ? "min-w-0 flex-1 truncate text-left" : "max-w-40 truncate"}>{clientsLabel}</span>
              {selectedClients.length > 1 && (
                <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
                  {selectedClients.length}
                </Badge>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className={mobile ? "w-[var(--radix-popover-trigger-width)] p-2" : "w-64 p-2"}>
            <div className="mb-2 flex items-center gap-2">
              <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
              {selectedClients.length > 0 && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedClients([])} title="Limpar seleção">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="mb-1 flex items-center justify-between border-b px-2 py-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    if (v) setSelectedClients((clients ?? []).map((c) => c.id));
                    else setSelectedClients([]);
                  }}
                />
                <span>Selecionar todos</span>
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {selectedClients.length}/{clients?.length ?? 0}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhum cliente</div>
              ) : (
                filteredClients.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                    <Checkbox checked={selectedClients.includes(c.id)} onCheckedChange={() => toggleClient(c.id)} />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
        ))}
        {field("Responsável", (
        <Select value={filters.assignee ?? "all"} onValueChange={(v) => onChange({ ...filters, assignee: v === "all" ? undefined : v })}>
          <SelectTrigger className={`${triggerCls(!!filters.assignee)} ${mobile ? "h-11 w-full text-sm" : "w-44"}`} aria-label="Responsável">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {profiles?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name || p.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        ))}
        {field("Prioridade", (
        <Select value={filters.priority ?? "all"} onValueChange={(v) => onChange({ ...filters, priority: v === "all" ? undefined : v })}>
          <SelectTrigger className={`${triggerCls(!!filters.priority)} ${mobile ? "h-11 w-full text-sm" : "w-40"}`} aria-label="Prioridade">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
        ))}
        {field("Status", (
        <Select value={filters.status ?? "all"} onValueChange={(v) => onChange({ ...filters, status: v === "all" ? undefined : v })}>
          <SelectTrigger className={`${triggerCls(!!filters.status)} ${mobile ? "h-11 w-full text-sm" : "w-36"}`} aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>{column.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        ))}
      </>
    );
  };

  const chipRow = chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-64 items-center gap-1 rounded-full border border-primary/25 bg-accent/60 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-accent-foreground animate-in fade-in zoom-in-95 duration-150 max-md:max-w-full max-md:py-1 max-md:text-xs"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.clear}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full transition hover:bg-primary/15 max-md:h-6 max-md:w-6"
            aria-label={`Remover filtro ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );

  const searchBox = (mobile: boolean) => (
    <div className={mobile ? "relative min-w-0 flex-1" : "relative w-full sm:w-56"}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        placeholder="Buscar tarefa…"
        className={mobile ? "h-10 pl-8 pr-8 text-base" : "h-8 pl-8 pr-7 text-xs md:text-xs"}
        aria-label="Buscar tarefa pelo título"
      />
      {filters.search && (
        <button
          type="button"
          onClick={() => onChange({ ...filters, search: undefined })}
          className={`absolute top-1/2 grid -translate-y-1/2 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground ${mobile ? "right-1 h-8 w-8" : "right-1.5 h-5 w-5"}`}
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const scopeSwitch = (mobile: boolean) => (
    <div className={mobile ? "grid h-11 grid-cols-3 rounded-md border bg-muted/40 p-0.5" : "inline-flex h-8 items-center rounded-md border bg-muted/40 p-0.5"}>
      <ScopeBtn mobile={mobile} active={scope === "all"} onClick={() => onChange({ ...filters, scope: undefined })} icon={<Users className="h-3.5 w-3.5" />}>Todas</ScopeBtn>
      <ScopeBtn mobile={mobile} active={scope === "mine"} onClick={() => onChange({ ...filters, scope: "mine" })} icon={<UserCheck className="h-3.5 w-3.5" />}>{mobile ? "Minhas" : "Atribuídas a mim"}</ScopeBtn>
      <ScopeBtn mobile={mobile} active={scope === "created"} onClick={() => onChange({ ...filters, scope: "created" })} icon={<PenSquare className="h-3.5 w-3.5" />}>{mobile ? "Criei" : "Criadas por mim"}</ScopeBtn>
    </div>
  );

  // Celular: barra enxuta (busca + botão Filtros) e todo o resto numa gaveta,
  // para as tarefas aparecerem logo na primeira tela.
  if (isMobile) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {searchBox(true)}
          <Button
            type="button"
            variant={activeCount > 0 ? "default" : "outline"}
            className="h-10 shrink-0 gap-1.5 px-3"
            onClick={() => setSheetOpen(true)}
            aria-label={activeCount > 0 ? `Filtros, ${activeCount} ativo(s)` : "Filtros"}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-background/90 px-1 text-[11px] font-bold tabular-nums text-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        </div>
        {chipRow && <div className="-mx-2">{chipRow}</div>}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="flex max-h-[88dvh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle>Filtros e exibição</SheetTitle>
              <SheetDescription className="sr-only">Escolha como as tarefas são filtradas e exibidas.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tarefas
                {scopeSwitch(true)}
              </div>
              {renderFields(true)}
              {children && (
                <div className="space-y-4 border-t pt-4 [&_button]:min-h-10 [&_input]:h-10 [&_[role=combobox]]:h-10">
                  {children}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" className="h-11 flex-1" disabled={activeCount === 0} onClick={clearAll}>
                <RotateCcw className="h-4 w-4" />
                Limpar
              </Button>
              <Button type="button" className="h-11 flex-1" onClick={() => setSheetOpen(false)}>
                Ver tarefas
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search ?? ""}
            onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
            placeholder="Buscar tarefa…"
            className="h-8 pl-8 pr-7 text-xs md:text-xs"
            aria-label="Buscar tarefa pelo título"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: undefined })}
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex h-8 items-center rounded-md border bg-muted/40 p-0.5">
          <ScopeBtn active={scope === "all"} onClick={() => onChange({ ...filters, scope: undefined })} icon={<Users className="h-3.5 w-3.5" />}>Todas</ScopeBtn>
          <ScopeBtn active={scope === "mine"} onClick={() => onChange({ ...filters, scope: "mine" })} icon={<UserCheck className="h-3.5 w-3.5" />}>Atribuídas a mim</ScopeBtn>
          <ScopeBtn active={scope === "created"} onClick={() => onChange({ ...filters, scope: "created" })} icon={<PenSquare className="h-3.5 w-3.5" />}>Criadas por mim</ScopeBtn>
        </div>

        <span className="mx-0.5 hidden h-5 w-px bg-border lg:block" aria-hidden />

        {renderFields(false)}

        <div className="ml-auto flex items-center">
          {activeCount > 0 ? (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={clearAll}>
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          ) : (
            <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
              <FilterIcon className="h-3.5 w-3.5" />
              Nenhum filtro
            </span>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex max-w-64 items-center gap-1 rounded-full border border-primary/25 bg-accent/60 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-accent-foreground animate-in fade-in zoom-in-95 duration-150"
            >
              <span className="truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.clear}
                className="grid h-4 w-4 place-items-center rounded-full transition hover:bg-primary/15"
                aria-label={`Remover filtro ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {children && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-b-xl border-t bg-muted/30 px-3 py-2">
          {children}
        </div>
      )}
    </div>
  );
}

/** Agrupa controles extras de uma visualização (ordenar, período, exibição) com um rótulo curto. */
export function FilterGroup({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 max-md:flex max-md:w-full max-md:gap-2 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-md:w-full max-md:text-xs">{label}</span>
      {children}
    </div>
  );
}

function ScopeBtn({
  active,
  onClick,
  icon,
  children,
  mobile = false,
}: {
  mobile?: boolean;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-full items-center gap-1.5 rounded px-2.5 font-medium transition-all duration-150 active:scale-[0.97] ${mobile ? "justify-center text-sm" : "text-xs"} ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function applyTaskFilters<
  T extends {
    id: string;
    client_id: string | null;
    assignee_id: string | null;
    priority: string | null;
    column_id: string | null;
    created_by?: string | null;
    due_date: string | null;
    status: string | null;
    completed_at: string | null;
    title?: string | null;
  },
>(
  tasks: T[],
  f: Filters,
  opts?: {
    userId?: string | null;
    subtaskAssigneeTaskIds?: Set<string> | null;
    collaboratorTaskIds?: Set<string> | null;
    subtaskAssigneeTaskIdsByUser?: Map<string, Set<string>> | null;
  },
) {
  const clientIds = f.clients && f.clients.length > 0 ? f.clients : f.client ? [f.client] : null;
  const uid = opts?.userId ?? null;
  const subIds = opts?.subtaskAssigneeTaskIds ?? null;
  const collaboratorIds = opts?.collaboratorTaskIds ?? null;
  const query = f.search?.trim().toLowerCase() ?? "";
  return tasks.filter((t) => {
    if (query && !(t.title ?? "").toLowerCase().includes(query)) return false;
    if (f.scope === "mine") {
      if (!uid) return false;
      const mine =
        t.assignee_id === uid ||
        (subIds ? subIds.has(t.id) : false) ||
        (collaboratorIds ? collaboratorIds.has(t.id) : false);
      if (!mine) return false;
    }
    if (f.scope === "created" && (!uid || t.created_by !== uid)) return false;

    if (f.date && f.date !== "all" && !matchDateFilter(t, f.date)) return false;
    if (clientIds && (!t.client_id || !clientIds.includes(t.client_id))) return false;
    if (f.assignee) {
      const assigneeSubtasks = opts?.subtaskAssigneeTaskIdsByUser?.get(f.assignee);
      if (t.assignee_id !== f.assignee && !assigneeSubtasks?.has(t.id)) return false;
    }
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.column_id !== f.status) return false;
    return true;
  });
}

export type { Filters as TaskFilterValue };
