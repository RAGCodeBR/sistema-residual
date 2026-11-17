/**
 * "Anexar documento" direto da tela Documentos.
 * Computador: escolhe ou arrasta os arquivos digitalizados.
 * Celular: tira fotos (uma por página) ou escolhe da galeria/arquivos.
 * Várias fotos são juntadas em um único PDF antes do envio.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeStorageName } from "@/lib/storage-names";
import { prepareDocumentFile, isImageFile } from "@/lib/scan-files";
import { FileSourcePicker, PickedFiles } from "@/components/FileSourcePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ClientLite = { id: string; name: string };
type Branch = { id: string; client_id: string; name: string; cnpj: string | null };

const isConnectionFailure = (message?: string) => /failed to fetch|networkerror|network request failed/i.test(message ?? "");
const errorText = (error: { message?: string } | null) =>
  isConnectionFailure(error?.message)
    ? "A conexão falhou durante o envio. Verifique a internet e tente outra vez."
    : error?.message || "Não foi possível salvar o documento.";

const emptyForm = { clientId: "", branchId: "matrix", title: "", expiresAt: "", notifyDays: "30", description: "" };

export function DocumentUploadDialog({
  open,
  onOpenChange,
  clients,
  branches,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientLite[];
  branches: Branch[];
  defaultClientId?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, clientId: defaultClientId && defaultClientId !== "all" ? defaultClientId : "" });
    setFiles([]);
    setStage("");
  }, [open, defaultClientId]);

  const clientBranches = branches.filter((b) => b.client_id === form.clientId);
  const willMerge = files.length > 1 && files.every(isImageFile);

  const addFiles = (picked: File[]) => {
    setFiles((current) => [...current, ...picked]);
    // Sugere o nome do documento a partir do primeiro arquivo.
    if (!form.title.trim() && picked[0] && !isImageFile(picked[0]))
      setForm((f) => ({ ...f, title: picked[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() }));
  };

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const save = async () => {
    if (!form.clientId) return toast.error("Escolha a empresa do documento.");
    if (!form.title.trim()) return toast.error("Informe o nome do documento.");
    if (!files.length) return toast.error("Anexe o arquivo ou tire as fotos do documento.");
    setSaving(true);
    let storagePath: string | null = null;
    try {
      setStage(willMerge ? "Montando o PDF…" : "Preparando o arquivo…");
      const file = await prepareDocumentFile(files, form.title.trim());
      setStage("Enviando…");
      storagePath = `${form.clientId}/${Date.now()}-${safeStorageName(file.name)}`;
      const options = { contentType: file.type || "application/octet-stream" };
      let upload = await supabase.storage.from("client-documents").upload(storagePath, file, options);
      if (upload.error && isConnectionFailure(upload.error.message)) {
        await supabase.auth.refreshSession();
        upload = await supabase.storage.from("client-documents").upload(storagePath, file, options);
      }
      if (upload.error) {
        storagePath = null;
        throw upload.error;
      }
      setStage("Salvando…");
      const { error } = await (supabase.from("client_documents") as any).insert({
        client_id: form.clientId,
        branch_id: form.branchId === "matrix" ? null : form.branchId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        storage_path: storagePath,
        file_name: file.name,
        expires_at: form.expiresAt || null,
        notify_days_before: Math.max(0, Number.parseInt(form.notifyDays, 10) || 0),
        notify_daily_until_resolved: true,
        active: true,
      });
      if (error) throw error;
      await (supabase.rpc("jacoby_process_document_alerts") as any);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["portal-client-documents"] }),
        qc.invalidateQueries({ queryKey: ["document-alerts"] }),
        qc.invalidateQueries({ queryKey: ["client-documents"] }),
      ]);
      toast.success("Documento anexado.");
      onOpenChange(false);
    } catch (error) {
      if (storagePath) await supabase.storage.from("client-documents").remove([storagePath]);
      toast.error(errorText(error instanceof Error ? error : (error as { message?: string })));
    } finally {
      setSaving(false);
      setStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl max-md:gap-3 max-md:px-4 max-md:pb-0">
        <DialogHeader className="max-md:text-left">
          <DialogTitle>Anexar documento</DialogTitle>
          <DialogDescription className="max-md:hidden">
            Envie o arquivo digitalizado ou fotografe o documento. Várias fotos viram um único PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <FileSourcePicker onFiles={addFiles} disabled={saving} />
            <PickedFiles files={files} disabled={saving} onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))} />
            {willMerge && (
              <p className="text-xs text-muted-foreground">
                As <span className="tabular-nums">{files.length}</span> fotos serão juntadas em um PDF, nesta ordem. Tire mais fotos para adicionar páginas.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select value={form.clientId || undefined} onValueChange={(value) => setForm({ ...form, clientId: value, branchId: "matrix" })}>
                <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Escolha a empresa" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={form.branchId} onValueChange={(value) => setForm({ ...form, branchId: value })} disabled={!form.clientId}>
                <SelectTrigger aria-label="Unidade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matrix">Matriz</SelectItem>
                  {clientBranches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.cnpj ? ` · ${b.cnpj}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome do documento *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Licença de operação" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Avisar antes</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" inputMode="numeric" value={form.notifyDays} onChange={(e) => setForm({ ...form, notifyDays: e.target.value })} className="w-20" />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter className="gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:flex-row max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur">
          <Button variant="outline" className="max-md:hidden" disabled={saving} onClick={close}>Cancelar</Button>
          <Button disabled={saving} onClick={() => void save()} className="max-md:h-11 max-md:flex-1 max-md:rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? stage || "Salvando…" : "Anexar documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
