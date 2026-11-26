import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { commercialRpc } from "@/lib/commercial-clients";
import { table } from "@/lib/company";
import { proposalsDb, proposalCode } from "@/lib/proposals";
import { contractDraft, contractPdf } from "@/lib/residual-contract";
export function ContractAction({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [number, setNumber] = useState(""),
    [body, setBody] = useState(""),
    [issued, setIssued] = useState(false);
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  async function preview(n: string, text: string) {
    const blob = await contractPdf(n, text);
    openPdfPreview({
      title: "Contrato " + n,
      fileName: "Contrato " + n.replace(/\//g, "-") + ".pdf",
      url: URL.createObjectURL(blob),
      revokeOnClose: true,
    });
  }
  async function load() {
    setBusy(true);
    try {
      const { data, error } = await table("residual_contracts")
        .select("number,body")
        .eq("proposal_id", id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setIssued(true);
        await preview(data.number, data.body);
        return;
      }
      const p = await proposalsDb.get(id);
      if (p?.status !== "aprovada") throw new Error("A proposta precisa estar aprovada.");
      let address = "";
      if (p.client_id) {
        const result = await table("commercial_clients")
          .select("address")
          .eq("id", p.client_id)
          .maybeSingle();
        if (result.error) throw result.error;
        address = result.data?.address ?? "";
      }
      setNumber(proposalCode(p).replace("RESD ", ""));
      setBody(
        "CONTRATO DE PRESTAÇÃO DE SERVIÇO DE ASSESSORIA AMBIENTAL\n\n" + contractDraft(p, address),
      );
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function issue() {
    if (body.includes("[preencher")) {
      toast.error("Complete os campos indicados no texto antes de gerar.");
      return;
    }
    setBusy(true);
    try {
      await commercialRpc("issue_residual_contract", {
        target: id,
        contract_number: number,
        document: body,
      });
      setIssued(true);
      setOpen(false);
      await preview(number, body);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
        {issued ? "Abrir contrato" : "Gerar / abrir contrato"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Revisar contrato</DialogTitle>
          <label className="grid gap-1 text-sm">
            Número do contrato
            <Input maxLength={80} value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Texto para emissão
            <Textarea
              className="h-[45dvh]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Confira as partes, o escopo, os valores e o prazo. A emissão guarda esta versão para
            consulta e assinatura.
          </p>
          <Button disabled={busy || !number.trim() || !body.trim()} onClick={() => void issue()}>
            Gerar contrato em PDF
          </Button>
        </DialogContent>
      </Dialog>
      {pdfPreviewDialog}
    </>
  );
}
