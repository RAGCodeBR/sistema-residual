/**
 * Janelas de cadastro: caçamba (unidade, com foto) e tipo de equipamento.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { table } from "@/lib/company";
import { compressImage } from "@/lib/scan-files";
import { safeStorageName } from "@/lib/storage-names";
import {
  CAPACITY_UNITS,
  CATEGORIES,
  DUMPSTER_BUCKET,
  DUMPSTER_STATUS,
  defaultProposalText,
  type Dumpster,
  type DumpsterStatus,
  type EquipmentType,
} from "@/lib/dumpsters";
import { todayIso } from "@/lib/proposals";
import { FileSourcePicker, PickedFiles } from "@/components/FileSourcePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NO_TYPE = "__none__";
const errorText = (error: unknown, fallback: string) => {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Já existe uma caçamba com esse número.";
  return e?.message || fallback;
};

const footerClass =
  "gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:flex-row max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur";

export function DumpsterDialog({ open, onOpenChange, editing, types, photoUrl }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Dumpster | null; types: EquipmentType[]; photoUrl?: string | null }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [typeId, setTypeId] = useState(NO_TYPE);
  const [cover, setCover] = useState<Dumpster["cover"]>("aberta");
  const [status, setStatus] = useState<DumpsterStatus>("patio");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [since, setSince] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? "");
    setTypeId(editing?.type_id ?? types.find((t) => t.active)?.id ?? NO_TYPE);
    setCover(editing?.cover ?? "aberta");
    setStatus(editing?.status ?? "patio");
    setClientName(editing?.client_name ?? "");
    setLocation(editing?.location_note ?? "");
    setSince(editing?.status_since ?? todayIso());
    setNotes(editing?.notes ?? "");
    setFiles([]);
  }, [open, editing, types]);

  // Mudou a situação: por padrão, conta a partir de hoje.
  const changeStatus = (next: DumpsterStatus) => {
    setStatus(next);
    setSince(editing && editing.status === next ? editing.status_since : todayIso());
  };

  const save = async () => {
    if (!code.trim()) return toast.error("Informe o número da caçamba.");
    if (status === "cliente" && !clientName.trim()) return toast.error("Informe em qual cliente a caçamba está.");
    setSaving(true);
    let uploaded: string | null = null;
    try {
      let photoPath = editing?.photo_path ?? null;
      if (files[0]) {
        const file = await compressImage(files[0]);
        const path = `${safeStorageName(code.trim())}/${Date.now()}-${safeStorageName(file.name)}`;
        const { error } = await supabase.storage.from(DUMPSTER_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg" });
        if (error) throw error;
        uploaded = path;
        photoPath = path;
      }
      const payload = {
        code: code.trim(),
        type_id: typeId === NO_TYPE ? null : typeId,
        cover,
        status,
        client_name: status === "cliente" ? clientName.trim() : null,
        location_note: location.trim() || null,
        status_since: since || todayIso(),
        photo_path: photoPath,
        notes: notes.trim() || null,
      };
      const { error } = editing ? await table("dumpsters").update(payload).eq("id", editing.id) : await table("dumpsters").insert(payload);
      if (error) throw error;
      if (editing?.photo_path && uploaded && editing.photo_path !== uploaded) await supabase.storage.from(DUMPSTER_BUCKET).remove([editing.photo_path]);
      await qc.invalidateQueries({ queryKey: ["dumpsters"] });
      toast.success(editing ? "Caçamba atualizada." : `Caçamba ${code.trim()} cadastrada.`);
      onOpenChange(false);
    } catch (error) {
      if (uploaded) await supabase.storage.from(DUMPSTER_BUCKET).remove([uploaded]);
      toast.error(errorText(error, "Não foi possível salvar a caçamba."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>{editing ? `Caçamba ${editing.code}` : "Nova caçamba"}</DialogTitle>
          <DialogDescription className="max-md:hidden">Número pintado na caçamba, tipo e onde ela está agora.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1.5">
              <Label>Número *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 012" className="tabular-nums" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Tipo</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.filter((t) => t.active || t.id === editing?.type_id).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  <SelectItem value={NO_TYPE}>Sem tipo definido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <div className="flex rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Modelo">
              {(["aberta", "fechada"] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={cover === c} onClick={() => setCover(c)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize transition ${cover === c ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Situação</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(DUMPSTER_STATUS) as DumpsterStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => changeStatus(s)} aria-pressed={status === s}
                  className={`rounded-lg border px-2 py-2 text-sm transition ${status === s ? `${DUMPSTER_STATUS[s].className} border-transparent font-medium` : "text-muted-foreground hover:bg-muted/50"}`}>
                  {DUMPSTER_STATUS[s].label}
                </button>
              ))}
            </div>
          </div>

          {status === "cliente" && (
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex.: T-GRÃO Terminais de Granéis" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>{status === "cliente" ? "No cliente desde" : "Nesta situação desde"}</Label>
              <Input type="date" value={since} max={todayIso()} onChange={(e) => setSince(e.target.value)} className="block w-full min-w-0" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Local</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={status === "cliente" ? "Ex.: pátio 2, ao lado da balança" : "Opcional"} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Foto</Label>
            {photoUrl && !files.length && <img src={photoUrl} alt={`Caçamba ${editing?.code}`} className="h-36 w-full rounded-lg border object-cover" />}
            <FileSourcePicker photosOnly multiple={false} disabled={saving} onFiles={(f) => setFiles(f.slice(0, 1))} computerHint={editing?.photo_path ? "Escolha uma foto para substituir a atual" : "Foto da caçamba"} />
            <PickedFiles files={files} disabled={saving} onRemove={() => setFiles([])} />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Avarias, reformas, identificação…" />
          </div>
        </div>

        <DialogFooter className={footerClass}>
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Cadastrar caçamba"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TypeDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: EquipmentType | null }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("Caçamba");
  const [capacity, setCapacity] = useState("");
  const [unit, setUnit] = useState<string>("m³");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [proposalText, setProposalText] = useState("");
  const [textTouched, setTextTouched] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(editing?.category ?? "Caçamba");
    setCapacity(editing?.capacity != null ? String(editing.capacity).replace(".", ",") : "");
    setUnit(editing?.capacity_unit ?? "m³");
    setName(editing?.name ?? "");
    setProposalText(editing?.proposal_text ?? "");
    setNameTouched(!!editing);
    setTextTouched(!!editing);
    setActive(editing?.active ?? true);
  }, [open, editing]);

  const cap = capacity.trim() ? Number(capacity.replace(",", ".")) : null;
  // Nome e frase da proposta se preenchem sozinhos até a pessoa editar.
  useEffect(() => {
    if (!open) return;
    if (!nameTouched) setName(`${category}${cap ? ` ${capacity.trim()} ${unit}` : ""}`);
    if (!textTouched) setProposalText(defaultProposalText({ category, capacity: cap, capacity_unit: unit }));
  }, [open, category, capacity, unit, cap, nameTouched, textTouched]);

  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome do tipo.");
    if (capacity.trim() && (!cap || Number.isNaN(cap))) return toast.error("Capacidade inválida.");
    setSaving(true);
    try {
      const payload = { name: name.trim(), category, capacity: cap, capacity_unit: unit, proposal_text: proposalText.trim() || null, active };
      const { error } = editing ? await table("equipment_types").update(payload).eq("id", editing.id) : await table("equipment_types").insert(payload);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["equipment-types"] });
      toast.success(editing ? "Tipo atualizado." : "Tipo cadastrado.");
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, "Não foi possível salvar o tipo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>{editing ? "Editar tipo" : "Novo tipo de equipamento"}</DialogTitle>
          <DialogDescription>Os tipos aparecem nas propostas e no cadastro das caçambas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_5.5rem]">
            <div className="min-w-0 space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacidade</Label>
              <Input inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Ex.: 5" className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAPACITY_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Como aparece na proposta</Label>
            <Input value={proposalText} onChange={(e) => { setProposalText(e.target.value); setTextTouched(true); }} />
            <p className="text-xs text-muted-foreground">Vai na seção “Equipamento” do PDF.</p>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              Tipo em uso (desmarque para esconder das propostas novas)
            </label>
          )}
        </div>
        <DialogFooter className={footerClass}>
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Cadastrar tipo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
