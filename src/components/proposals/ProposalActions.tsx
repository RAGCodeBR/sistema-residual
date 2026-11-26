/**
 * Ações compartilhadas entre a lista e o editor de propostas:
 * gerar/visualizar/enviar o PDF e registrar envio, aprovação ou recusa.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { buildProposalPdf } from "@/lib/proposal-pdf";
import { changeStatus, proposalCode, proposalFileName, todayIso, type Proposal, type ProposalFields, type ProposalStatus } from "@/lib/proposals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function useProposalPdf() {
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [busy, setBusy] = useState(false);

  const preview = async (p: ProposalFields) => {
    setBusy(true);
    try {
      const blob = await buildProposalPdf(p);
      openPdfPreview({ title: `Proposta ${proposalCode(p)}`, subtitle: p.client_name, fileName: proposalFileName(p), url: URL.createObjectURL(blob), revokeOnClose: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  /** No celular abre o compartilhar do sistema (WhatsApp, e-mail…); no computador baixa o arquivo. */
  const share = async (p: ProposalFields) => {
    setBusy(true);
    try {
      const blob = await buildProposalPdf(p);
      const file = new File([blob], proposalFileName(p), { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
        try {
          await nav.share({ files: [file], title: `Proposta ${proposalCode(p)}` });
        } catch (error) {
          if ((error as { name?: string })?.name !== "AbortError") throw error;
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  return { previewPdf: preview, sharePdf: share, pdfBusy: busy, pdfDialog: pdfPreviewDialog };
}

const COPY: Record<ProposalStatus, { title: string; description: string; dateLabel: string; noteLabel: string; notePlaceholder: string; confirm: string; success: string }> = {
  enviada: {
    title: "Marcar como enviada",
    description: "A proposta passa a aguardar a resposta do cliente. A validade é contada a partir da data de emissão.",
    dateLabel: "Data do envio",
    noteLabel: "Observação",
    notePlaceholder: "Ex.: enviada pelo WhatsApp para o Maurício",
    confirm: "Marcar como enviada",
    success: "Proposta marcada como enviada.",
  },
  aprovada: {
    title: "Registrar aprovação",
    description: "Registre quando o cliente aprovou. A proposta fica disponível para a próxima etapa (contrato).",
    dateLabel: "Data da aprovação",
    noteLabel: "Observação",
    notePlaceholder: "Ex.: aprovada por e-mail, com início em 01/12",
    confirm: "Registrar aprovação",
    success: "Proposta aprovada. 🎉",
  },
  recusada: {
    title: "Registrar recusa",
    description: "Anote o motivo: ajuda a entender por que as propostas não fecham.",
    dateLabel: "Data da resposta",
    noteLabel: "Motivo da recusa",
    notePlaceholder: "Ex.: preço acima do concorrente, adiou o serviço…",
    confirm: "Registrar recusa",
    success: "Recusa registrada.",
  },
  rascunho: {
    title: "Voltar para rascunho",
    description: "A proposta volta a ser editável e sai do controle de respostas.",
    dateLabel: "Data",
    noteLabel: "Motivo",
    notePlaceholder: "Opcional",
    confirm: "Voltar para rascunho",
    success: "Proposta voltou para rascunho.",
  },
};

export function StatusDialog({ proposal, status, onClose }: { proposal: Proposal | null; status: ProposalStatus | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!proposal && !!status;
  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setNote("");
    }
  }, [open]);
  if (!status) return null;
  const copy = COPY[status];

  const save = async () => {
    if (!proposal) return;
    if (status === "recusada" && !note.trim()) return toast.error("Informe o motivo da recusa.");
    setSaving(true);
    try {
      await changeStatus(proposal, status, { date, note: note.trim(), by: profile?.full_name ?? null });
      await Promise.all([qc.invalidateQueries({ queryKey: ["operational-queue"] }), qc.invalidateQueries({ queryKey: ["proposals"] }), qc.invalidateQueries({ queryKey: ["proposal", proposal.id] })]);
      toast.success(copy.success);
      onClose();
    } catch (error) {
      toast.error((error as { message?: string })?.message || "Não foi possível atualizar a proposta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {proposal && <strong className="text-foreground">{proposalCode(proposal)} · {proposal.client_name}. </strong>}
            {copy.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {status !== "rascunho" && (
            <div className="space-y-1.5">
              <Label>{copy.dateLabel}</Label>
              <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="block w-full" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{copy.noteLabel}{status === "recusada" ? " *" : ""}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.notePlaceholder} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} variant={status === "recusada" ? "destructive" : "default"} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MissingTable() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <p className="font-medium">A área de Propostas ainda não foi ativada no banco de dados</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Rode a migração <code className="rounded bg-muted px-1 text-xs">20261120120000_create_proposals.sql</code> no Supabase e recarregue a página.
        </p>
      </div>
    </div>
  );
}
