/**
 * Anexar ou editar um documento da empresa.
 * O documento pode ser da empresa ou vinculado a um equipamento (veículo,
 * máquina…). Dá para cadastrar o equipamento aqui mesmo, sem sair da janela.
 * Computador: arrasta/escolhe os digitalizados. Celular: câmera ou galeria.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/storage-names";
import { isImageFile, prepareDocumentFile } from "@/lib/scan-files";
import { DOCS_BUCKET, EQUIPMENT_KINDS, table, type CompanyDocument, type Equipment } from "@/lib/company";
import { FileSourcePicker, PickedFiles } from "@/components/FileSourcePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const COMPANY = "__company__";
const NEW_EQUIPMENT = "__new__";
const isConnectionFailure = (message?: string) => /failed to fetch|networkerror|network request failed/i.test(message ?? "");

export function CompanyDocumentDialog({
  open,
  onOpenChange,
  equipment,
  editing,
  defaultEquipmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment[];
  editing?: CompanyDocument | null;
  defaultEquipmentId?: string | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState(COMPANY);
  const [newEquipment, setNewEquipment] = useState({ name: "", kind: "Veículo", identifier: "" });
  const [expiresAt, setExpiresAt] = useState("");
  const [notifyDays, setNotifyDays] = useState("30");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setLink(editing ? editing.equipment_id ?? COMPANY : defaultEquipmentId ?? COMPANY);
    setNewEquipment({ name: "", kind: "Veículo", identifier: "" });
    setExpiresAt(editing?.expires_at ?? "");
    setNotifyDays(String(editing?.notify_days_before ?? 30));
    setDescription(editing?.description ?? "");
    setFiles([]);
  }, [open, editing, defaultEquipmentId]);

  const activeEquipment = equipment.filter((e) => e.active !== false || e.id === editing?.equipment_id);
  const willMerge = files.length > 1 && files.every(isImageFile);

  const addFiles = (picked: File[]) => {
    setFiles((current) => [...current, ...picked]);
    if (!title.trim() && picked[0] && !isImageFile(picked[0])) setTitle(picked[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  };

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const save = async () => {
    if (!title.trim()) return toast.error("Informe o nome do documento.");
    if (!editing && !files.length) return toast.error("Anexe o arquivo ou tire as fotos do documento.");
    if (link === NEW_EQUIPMENT && !newEquipment.name.trim()) return toast.error("Informe o nome do equipamento.");
    setSaving(true);
    let uploadedPath: string | null = null;
    let createdEquipmentId: string | null = null;
    try {
      let equipmentId: string | null = link === COMPANY ? null : link;
      if (link === NEW_EQUIPMENT) {
        setStage("Cadastrando equipamento…");
        createdEquipmentId = crypto.randomUUID();
        const { error } = await table("company_equipment").insert({
          id: createdEquipmentId,
          name: newEquipment.name.trim(),
          kind: newEquipment.kind,
          identifier: newEquipment.identifier.trim() || null,
        });
        if (error) throw error;
        equipmentId = createdEquipmentId;
      }

      let storagePath = editing?.storage_path ?? null;
      let fileName = editing?.file_name ?? null;
      if (files.length) {
        setStage(willMerge ? "Montando o PDF…" : "Preparando o arquivo…");
        const file = await prepareDocumentFile(files, title.trim());
        setStage("Enviando…");
        const path = `${equipmentId ?? "empresa"}/${Date.now()}-${safeStorageName(file.name)}`;
        const options = { contentType: file.type || "application/octet-stream" };
        let upload = await supabase.storage.from(DOCS_BUCKET).upload(path, file, options);
        if (upload.error && isConnectionFailure(upload.error.message)) {
          await supabase.auth.refreshSession();
          upload = await supabase.storage.from(DOCS_BUCKET).upload(path, file, options);
        }
        if (upload.error) throw upload.error;
        uploadedPath = path;
        storagePath = path;
        fileName = file.name;
      }

      setStage("Salvando…");
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        equipment_id: equipmentId,
        file_name: fileName,
        storage_path: storagePath,
        expires_at: expiresAt || null,
        notify_days_before: Math.max(0, Number.parseInt(notifyDays, 10) || 0),
      };
      const { error } = editing
        ? await table("company_documents").update(payload).eq("id", editing.id)
        : await table("company_documents").insert(payload);
      if (error) throw error;
      // O arquivo antigo só sai depois que o novo foi salvo.
      if (editing && uploadedPath && editing.storage_path !== uploadedPath) await supabase.storage.from(DOCS_BUCKET).remove([editing.storage_path]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["company-documents"] }),
        qc.invalidateQueries({ queryKey: ["company-equipment"] }),
      ]);
      toast.success(editing ? "Documento atualizado." : "Documento anexado.");
      onOpenChange(false);
    } catch (error) {
      if (uploadedPath) await supabase.storage.from(DOCS_BUCKET).remove([uploadedPath]);
      if (createdEquipmentId) await table("company_equipment").delete().eq("id", createdEquipmentId);
      const message = (error as { message?: string })?.message;
      toast.error(isConnectionFailure(message) ? "A conexão falhou durante o envio. Verifique a internet e tente outra vez." : message || "Não foi possível salvar o documento.");
    } finally {
      setSaving(false);
      setStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>{editing ? "Editar documento" : "Anexar documento"}</DialogTitle>
          <DialogDescription className="max-md:hidden">
            {editing ? "Altere os dados ou substitua o arquivo." : "Envie o arquivo digitalizado ou fotografe o documento. Várias fotos viram um único PDF."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {editing && !files.length && (
              <p className="truncate rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Arquivo atual: <span className="text-foreground">{editing.file_name}</span></p>
            )}
            <FileSourcePicker onFiles={addFiles} disabled={saving} computerHint={editing ? "Escolha um arquivo para substituir o atual" : undefined} />
            <PickedFiles files={files} disabled={saving} onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))} />
            {willMerge && (
              <p className="text-xs text-muted-foreground">
                As <span className="tabular-nums">{files.length}</span> fotos serão juntadas em um PDF, nesta ordem.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Nome do documento *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: CRLV, Licença de operação, Alvará" />
          </div>

          <div className="space-y-1.5">
            <Label>Pertence a</Label>
            <Select value={link} onValueChange={setLink}>
              <SelectTrigger aria-label="Pertence a"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={COMPANY}>Empresa (documento geral)</SelectItem>
                {activeEquipment.length > 0 && <SelectSeparator />}
                {activeEquipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}{e.identifier ? ` · ${e.identifier}` : ""}</SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_EQUIPMENT}>+ Cadastrar novo equipamento</SelectItem>
              </SelectContent>
            </Select>
            {link === NEW_EQUIPMENT && (
              <div className="grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_9rem]">
                <Input value={newEquipment.name} onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })} placeholder="Nome (ex.: Caminhão baú VW)" autoFocus />
                <Select value={newEquipment.kind} onValueChange={(kind) => setNewEquipment({ ...newEquipment, kind })}>
                  <SelectTrigger aria-label="Tipo de equipamento"><SelectValue /></SelectTrigger>
                  <SelectContent>{EQUIPMENT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="sm:col-span-2" value={newEquipment.identifier} onChange={(e) => setNewEquipment({ ...newEquipment, identifier: e.target.value })} placeholder="Placa, nº de série ou patrimônio (opcional)" />
              </div>
            )}
          </div>

          {/* No celular os dois campos ficam um embaixo do outro: o campo de data
              do iPhone não encolhe e sobrepunha o "Avisar antes". */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="block w-full min-w-0" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Avisar antes</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" inputMode="numeric" value={notifyDays} onChange={(e) => setNotifyDays(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">dias do vencimento</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter className="gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:flex-row max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur">
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={close}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? stage || "Salvando…" : editing ? "Salvar alterações" : "Anexar documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
