/**
 * EPIs: entregas de equipamentos de proteção por funcionário, com as fotos
 * tiradas no momento da entrega. Os funcionários vêm do organograma do
 * cliente (setores → funcionários); quem ainda não está cadastrado pode ser
 * registrado digitando o nome.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, HardHat, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/scan-files";
import { safeStorageName } from "@/lib/storage-names";
import { FileSourcePicker, PickedFiles } from "@/components/FileSourcePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const BUCKET = "epi-photos";
const NEW_EMPLOYEE = "__new__";
const COMMON_EPIS = ["Capacete", "Luvas", "Botina", "Óculos", "Protetor auricular", "Respirador", "Uniforme", "Avental"];

type ClientLite = { id: string; name: string };
type Department = { id: string; client_id: string; name: string };
type Employee = { id: string; department_id: string; full_name: string; role: string | null };
type Delivery = {
  id: string;
  client_id: string;
  employee_id: string | null;
  employee_name: string;
  delivered_on: string;
  items: string | null;
  notes: string | null;
  photo_paths: string[] | null;
  created_at: string;
};

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /epi_deliveries/i.test(error.message ?? "") && /exist|schema cache/i.test(error.message ?? ""));
const dateLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd MMM yyyy", { locale: ptBR });
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const todayIso = () => format(new Date(), "yyyy-MM-dd");

export function EpiDeliveries({ clients, canManage }: { clients: ClientLite[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ clientId?: string; employeeId?: string; employeeName?: string } | null>(null);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number; title: string } | null>(null);

  const deliveriesQuery = useQuery({
    queryKey: ["epi-deliveries"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.from("epi_deliveries") as any)
        .select("id,client_id,employee_id,employee_name,delivered_on,items,notes,photo_paths,created_at")
        .order("delivered_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["epi-departments"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_departments") as any).select("id,client_id,name").order("position");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["epi-employees"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_department_employees") as any).select("id,department_id,full_name,role").order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const deliveries = deliveriesQuery.data ?? [];
  const missingTable = isMissingTable(deliveriesQuery.error as { code?: string; message?: string } | null);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Empresa";
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Agrupa por funcionário (cadastrado ou digitado), mais recentes primeiro.
  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const map = new Map<string, { key: string; clientId: string; employeeId: string | null; name: string; subtitle: string; list: Delivery[] }>();
    for (const d of deliveries) {
      if (clientFilter !== "all" && d.client_id !== clientFilter) continue;
      if (term && ![d.employee_name, d.items ?? "", d.notes ?? "", clientName(d.client_id)].some((t) => t.toLocaleLowerCase("pt-BR").includes(term))) continue;
      const key = d.employee_id ?? `${d.client_id}:${d.employee_name.trim().toLocaleLowerCase("pt-BR")}`;
      if (!map.has(key)) {
        const emp = d.employee_id ? employeeById.get(d.employee_id) : undefined;
        const dept = emp ? deptById.get(emp.department_id) : undefined;
        map.set(key, {
          key,
          clientId: d.client_id,
          employeeId: d.employee_id,
          name: emp?.full_name ?? d.employee_name,
          subtitle: [clientName(d.client_id), dept?.name, emp?.role].filter(Boolean).join(" · "),
          list: [],
        });
      }
      map.get(key)!.list.push(d);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, clientFilter, search, employeeById, deptById, clients]);

  const visiblePaths = useMemo(() => groups.flatMap((g) => g.list.flatMap((d) => d.photo_paths ?? [])), [groups]);
  const { data: photoUrls = {} } = useQuery({
    queryKey: ["epi-photo-urls", visiblePaths],
    enabled: visiblePaths.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(visiblePaths, 60 * 60);
      if (error) throw error;
      const rows = (data ?? []) as { path: string | null; signedUrl: string | null }[];
      return Object.fromEntries(rows.filter((item) => item.path && item.signedUrl).map((item) => [item.path, item.signedUrl])) as Record<string, string>;
    },
  });

  const remove = async (delivery: Delivery) => {
    if (!confirm(`Excluir a entrega de ${dateLabel(delivery.delivered_on)} para ${delivery.employee_name}? As fotos também serão apagadas.`)) return;
    const { error } = await (supabase.from("epi_deliveries") as any).delete().eq("id", delivery.id);
    if (error) return toast.error(error.message);
    if (delivery.photo_paths?.length) await supabase.storage.from(BUCKET).remove(delivery.photo_paths);
    await qc.invalidateQueries({ queryKey: ["epi-deliveries"] });
    toast.success("Entrega excluída.");
  };

  if (missingTable) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <HardHat className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 font-medium">A área de EPIs ainda não foi ativada no banco de dados</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Rode a migração <code className="rounded bg-muted px-1 text-xs">20261117120000_create_epi_deliveries.sql</code> no SQL Editor do Supabase e recarregue a página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar funcionário ou EPI" className="pl-9 max-md:h-11 max-md:rounded-xl" aria-label="Buscar entregas de EPI" />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-60 max-md:h-11 max-md:rounded-xl" aria-label="Filtrar por empresa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManage && (
          <>
            <Button onClick={() => setDialog({ clientId: clientFilter !== "all" ? clientFilter : undefined })} className="max-md:hidden">
              <Plus className="h-4 w-4" />Registrar entrega
            </Button>
            {/* Celular: botão flutuante no alcance do polegar. */}
            <Button onClick={() => setDialog({ clientId: clientFilter !== "all" ? clientFilter : undefined })} className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full pl-5 pr-6 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] md:hidden">
              <Plus className="h-5 w-5" />Registrar entrega
            </Button>
          </>
        )}
      </div>

      {deliveriesQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando entregas…</div>
      ) : deliveriesQuery.error ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{(deliveriesQuery.error as Error).message}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <HardHat className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">{search || clientFilter !== "all" ? "Nenhuma entrega com esses filtros" : "Nenhuma entrega de EPI registrada"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Registre a entrega e fotografe o funcionário com os EPIs ou a ficha assinada.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <article key={group.key} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <header className="flex items-center gap-3 border-b px-4 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary">{initials(group.name)}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{group.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">{group.subtitle}</p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 max-md:h-9 max-md:rounded-full"
                    onClick={() => setDialog({ clientId: group.clientId, employeeId: group.employeeId ?? undefined, employeeName: group.employeeId ? undefined : group.name })}
                  >
                    <Plus className="h-4 w-4" /><span className="max-sm:sr-only">Nova entrega</span>
                  </Button>
                )}
              </header>
              <ol className="divide-y">
                {group.list.map((d) => {
                  const urls = (d.photo_paths ?? []).map((p) => photoUrls[p]).filter(Boolean) as string[];
                  return (
                    <li key={d.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium tabular-nums">{dateLabel(d.delivered_on)}</p>
                          {d.items && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{d.items}</p>}
                        </div>
                        {canManage && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir entrega" onClick={() => void remove(d)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {(d.photo_paths?.length ?? 0) > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {(d.photo_paths ?? []).map((path, index) => (
                            <button
                              key={path}
                              type="button"
                              onClick={() => urls.length && setViewer({ urls, index: Math.min(index, urls.length - 1), title: `${group.name} · ${dateLabel(d.delivered_on)}` })}
                              className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted transition-transform active:scale-95"
                              aria-label={`Ver foto ${index + 1}`}
                            >
                              {photoUrls[path] ? <img src={photoUrls[path]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-muted" />}
                            </button>
                          ))}
                        </div>
                      )}
                      {d.notes && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{d.notes}</p>}
                    </li>
                  );
                })}
              </ol>
            </article>
          ))}
        </div>
      )}

      <EpiDeliveryDialog
        open={!!dialog}
        initial={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        clients={clients}
        departments={departments}
        employees={employees}
      />

      <Dialog open={!!viewer} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="max-w-3xl gap-2 p-3">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-sm">{viewer?.title}</DialogTitle>
            <DialogDescription className="sr-only">Foto da entrega de EPI</DialogDescription>
          </DialogHeader>
          {viewer && (
            <div className="relative">
              <img src={viewer.urls[viewer.index]} alt={`Foto ${viewer.index + 1}`} className="max-h-[75dvh] w-full rounded-lg object-contain" />
              {viewer.urls.length > 1 && (
                <div className="mt-2 flex items-center justify-center gap-3">
                  <Button size="icon" variant="outline" className="rounded-full" aria-label="Foto anterior" onClick={() => setViewer({ ...viewer, index: (viewer.index - 1 + viewer.urls.length) % viewer.urls.length })}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-xs tabular-nums text-muted-foreground">{viewer.index + 1} / {viewer.urls.length}</span>
                  <Button size="icon" variant="outline" className="rounded-full" aria-label="Próxima foto" onClick={() => setViewer({ ...viewer, index: (viewer.index + 1) % viewer.urls.length })}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EpiDeliveryDialog({
  open,
  initial,
  onOpenChange,
  clients,
  departments,
  employees,
}: {
  open: boolean;
  initial: { clientId?: string; employeeId?: string; employeeName?: string } | null;
  onOpenChange: (open: boolean) => void;
  clients: ClientLite[];
  departments: Department[];
  employees: Employee[];
}) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [newName, setNewName] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(todayIso());
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (!open) return;
    setClientId(initial?.clientId ?? "");
    setEmployeeId(initial?.employeeId ?? (initial?.employeeName ? NEW_EMPLOYEE : ""));
    setNewName(initial?.employeeName ?? "");
    setDeliveredOn(todayIso());
    setItems("");
    setNotes("");
    setPhotos([]);
  }, [open, initial]);

  const clientDepartments = departments.filter((d) => d.client_id === clientId);
  const hasEmployees = clientDepartments.some((d) => employees.some((e) => e.department_id === d.id));
  const effectiveEmployee = !hasEmployees && clientId ? NEW_EMPLOYEE : employeeId;

  const itemList = items.split(",").map((s) => s.trim()).filter(Boolean);
  const toggleItem = (name: string) => {
    const has = itemList.some((i) => i.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
    setItems((has ? itemList.filter((i) => i.toLocaleLowerCase("pt-BR") !== name.toLocaleLowerCase("pt-BR")) : [...itemList, name]).join(", "));
  };

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const save = async () => {
    const employee = effectiveEmployee && effectiveEmployee !== NEW_EMPLOYEE ? employees.find((e) => e.id === effectiveEmployee) : undefined;
    const employeeName = employee?.full_name ?? newName.trim();
    if (!clientId) return toast.error("Escolha a empresa.");
    if (!employeeName) return toast.error("Escolha ou digite o nome do funcionário.");
    if (!deliveredOn) return toast.error("Informe a data da entrega.");
    if (!photos.length) return toast.error("Tire ao menos uma foto da entrega.");
    setSaving(true);
    const id = crypto.randomUUID();
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < photos.length; i += 1) {
        setStage(`Enviando foto ${i + 1} de ${photos.length}…`);
        const file = await compressImage(photos[i]);
        const path = `${clientId}/${id}/${i + 1}-${Date.now()}-${safeStorageName(file.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
        if (error) throw error;
        uploaded.push(path);
      }
      setStage("Salvando…");
      const { error } = await (supabase.from("epi_deliveries") as any).insert({
        id,
        client_id: clientId,
        employee_id: employee?.id ?? null,
        employee_name: employeeName,
        delivered_on: deliveredOn,
        items: itemList.join(", ") || null,
        notes: notes.trim() || null,
        photo_paths: uploaded,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["epi-deliveries"] });
      toast.success("Entrega de EPI registrada.");
      onOpenChange(false);
    } catch (error) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      toast.error((error as { message?: string })?.message || "Não foi possível registrar a entrega.");
    } finally {
      setSaving(false);
      setStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>Registrar entrega de EPI</DialogTitle>
          <DialogDescription className="max-md:hidden">Fotografe o funcionário com os EPIs ou a ficha de entrega assinada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fotos da entrega *</Label>
            <FileSourcePicker photosOnly onFiles={(files) => setPhotos((current) => [...current, ...files])} disabled={saving} computerHint="Fotos da entrega ou da ficha assinada" />
            <PickedFiles files={photos} disabled={saving} onRemove={(index) => setPhotos((current) => current.filter((_, i) => i !== index))} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select value={clientId || undefined} onValueChange={(value) => { setClientId(value); setEmployeeId(""); setNewName(""); }}>
                <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Escolha a empresa" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data da entrega *</Label>
              <Input type="date" value={deliveredOn} max={todayIso()} onChange={(e) => setDeliveredOn(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Funcionário *</Label>
            {hasEmployees && (
              <Select value={employeeId || undefined} onValueChange={setEmployeeId} disabled={!clientId}>
                <SelectTrigger aria-label="Funcionário"><SelectValue placeholder="Escolha o funcionário" /></SelectTrigger>
                <SelectContent>
                  {clientDepartments.map((dept) => {
                    const list = employees.filter((e) => e.department_id === dept.id);
                    if (!list.length) return null;
                    return (
                      <SelectGroup key={dept.id}>
                        <SelectLabel>{dept.name}</SelectLabel>
                        {list.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{e.role ? ` · ${e.role}` : ""}</SelectItem>)}
                      </SelectGroup>
                    );
                  })}
                  <SelectItem value={NEW_EMPLOYEE}>Outro (digitar o nome)</SelectItem>
                </SelectContent>
              </Select>
            )}
            {effectiveEmployee === NEW_EMPLOYEE && (
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome completo do funcionário" autoComplete="off" />
            )}
            {!clientId && <p className="text-xs text-muted-foreground">Escolha a empresa para ver os funcionários do organograma.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>EPIs entregues</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EPIS.map((name) => {
                const on = itemList.some((i) => i.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleItem(name)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors max-md:min-h-9 ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <Input value={items} onChange={(e) => setItems(e.target.value)} placeholder="Ou digite, separando por vírgula (com CA, tamanho…)" />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter className="gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:flex-row max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur">
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={close}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? stage || "Salvando…" : "Registrar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
