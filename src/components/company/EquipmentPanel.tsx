/**
 * Equipamentos da empresa (veículos, máquinas, ferramentas…). Cada um mostra
 * a situação dos documentos vinculados e leva direto para eles.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { isPhoneViewport } from "@/hooks/use-keyboard-inset";
import { EQUIPMENT_KINDS, STATUS, plural, statusOf, table, type CompanyDocument, type Equipment } from "@/lib/company";
import { EquipmentIcon } from "@/components/company/EquipmentIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function EquipmentPanel({
  equipment,
  documents,
  loading,
  canManage,
  onOpenDocuments,
}: {
  equipment: Equipment[];
  documents: CompanyDocument[];
  loading: boolean;
  canManage: boolean;
  /** Abre a aba Documentos filtrada por este equipamento. */
  onOpenDocuments: (equipmentId: string) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ editing?: Equipment | null } | null>(null);

  const docsByEquipment = useMemo(() => {
    const map = new Map<string, CompanyDocument[]>();
    for (const doc of documents) if (doc.equipment_id) map.set(doc.equipment_id, [...(map.get(doc.equipment_id) ?? []), doc]);
    return map;
  }, [documents]);

  const list = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return equipment.filter((e) => !term || [e.name, e.kind, e.identifier ?? "", e.notes ?? ""].some((t) => t.toLocaleLowerCase("pt-BR").includes(term)));
  }, [equipment, search]);

  const remove = async (item: Equipment) => {
    const count = docsByEquipment.get(item.id)?.length ?? 0;
    const extra = count ? ` Os ${plural(count, "documento")} vinculados continuam salvos, como documentos da empresa.` : "";
    if (!confirm(`Excluir o equipamento "${item.name}"?${extra}`)) return;
    const { error } = await table("company_equipment").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    await Promise.all([qc.invalidateQueries({ queryKey: ["company-equipment"] }), qc.invalidateQueries({ queryKey: ["company-documents"] })]);
    toast.success("Equipamento excluído.");
  };

  return (
    <div className="space-y-4 max-md:space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, tipo ou placa" className="pl-9 max-md:h-11" aria-label="Buscar equipamentos" />
        </div>
        {canManage && <Button onClick={() => setDialog({})} className="max-md:hidden"><Plus className="h-4 w-4" />Cadastrar equipamento</Button>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando equipamentos…</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">{search ? "Nenhum equipamento encontrado" : "Nenhum equipamento cadastrado"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre veículos, máquinas e ferramentas para vincular os documentos de cada um.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => {
            const docs = docsByEquipment.get(item.id) ?? [];
            const overdue = docs.filter((d) => statusOf(d) === "overdue").length;
            const dueSoon = docs.filter((d) => statusOf(d) === "due_soon").length;
            return (
              <li key={item.id} className="flex flex-col rounded-xl border bg-card shadow-sm">
                <div className="flex items-start gap-3 p-4 pb-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><EquipmentIcon kind={item.kind} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-snug [overflow-wrap:anywhere]">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">{[item.kind, item.identifier].filter(Boolean).join(" · ")}</p>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="-mr-2 -mt-1 h-9 w-9 shrink-0 text-muted-foreground" aria-label={`Ações de ${item.name}`}><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setDialog({ editing: item })} className="min-h-10"><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void remove(item)} className="min-h-10 text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {item.notes && <p className="px-4 pb-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.notes}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
                  {overdue > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.overdue.className}`}>{overdue} vencido{overdue === 1 ? "" : "s"}</span>}
                  {dueSoon > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${STATUS.due_soon.className}`}>{dueSoon} vence{dueSoon === 1 ? "" : "m"} em breve</span>}
                  {docs.length > 0 && overdue + dueSoon === 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS.ok.className}`}>Documentos em dia</span>}
                  <Button size="sm" variant="ghost" className="ml-auto h-9 gap-1.5 px-2 text-primary" onClick={() => onOpenDocuments(item.id)}>
                    <FileText className="h-4 w-4" />{docs.length ? plural(docs.length, "documento") : "Anexar documentos"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <Button onClick={() => setDialog({})} className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 h-14 rounded-full pl-5 pr-6 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] md:hidden">
          <Plus className="h-5 w-5" />Cadastrar
        </Button>
      )}

      <EquipmentDialog open={!!dialog} editing={dialog?.editing ?? null} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}

function EquipmentDialog({ open, editing, onOpenChange }: { open: boolean; editing: Equipment | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", kind: "Veículo", identifier: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: editing?.name ?? "", kind: editing?.kind ?? "Veículo", identifier: editing?.identifier ?? "", notes: editing?.notes ?? "" });
  }, [open, editing]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do equipamento.");
    setSaving(true);
    const payload = { name: form.name.trim(), kind: form.kind, identifier: form.identifier.trim() || null, notes: form.notes.trim() || null };
    const { error } = editing ? await table("company_equipment").update(payload).eq("id", editing.id) : await table("company_equipment").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["company-equipment"] });
    toast.success(editing ? "Equipamento atualizado." : "Equipamento cadastrado.");
    onOpenChange(false);
  };

  const idLabel = form.kind === "Veículo" ? "Placa" : "Nº de série ou patrimônio";
  return (
    <Dialog open={open} onOpenChange={(value) => !saving && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>{editing ? "Editar equipamento" : "Cadastrar equipamento"}</DialogTitle>
          <DialogDescription className="max-md:hidden">Veículos, máquinas, ferramentas ou qualquer item que tenha documentos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Caminhão baú VW 9.170" autoFocus={!editing && !isPhoneViewport()} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}>
                <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                <SelectContent>{EQUIPMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{idLabel}</Label>
              <Input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder={form.kind === "Veículo" ? "ABC1D23" : "Opcional"} autoCapitalize={form.kind === "Veículo" ? "characters" : undefined} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter className="gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:flex-row max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur">
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar alterações" : "Cadastrar equipamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
