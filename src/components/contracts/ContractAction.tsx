import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePdfPreview, type PdfPreviewTarget } from "@/components/PdfPreviewDialog";
import { commercialRpc } from "@/lib/commercial-clients";
import { table } from "@/lib/company";
import { proposalsDb, proposalCode } from "@/lib/proposals";
import { contractDraft, contractPdf } from "@/lib/residual-contract";
import { applyContractFields, contractFields } from "@/lib/contract-fields";

export function ContractAction({
  id,
  edit = false,
  showIssued,
}: {
  id: string;
  edit?: boolean;
  showIssued?: (target: PdfPreviewTarget) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [number, setNumber] = useState(""),
    [body, setBody] = useState(""),
    [original, setOriginal] = useState<{ number: string; body: string } | null>(null),
    [values, setValues] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<ReturnType<typeof contractFields>>([]);
  const [fullEditor, setFullEditor] = useState(false);
  function prepare(text: string) {
    setBody(text);
    setFields(contractFields(text));
    setFullEditor(false);
  }
  const documentText = fullEditor ? body : applyContractFields(body, fields);
  const qc = useQueryClient();
  const missing = [...new Set(documentText.match(/\[preencher[^\]]*\]/gi) ?? [])];
  const label = (key: string) =>
    key === "[preencher sede da contratante]"
      ? "Endereço da sede da contratante"
      : key.replace(/^\[preencher\s*|\]$/gi, "");
  const finalText = documentText.replace(
    /\[preencher[^\]]*\]/gi,
    (key) => values[key]?.trim() || key,
  );
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  async function preview(n: string, text: string, draft = false) {
    const blob = await contractPdf(n, text);
    (draft ? openPdfPreview : (showIssued ?? openPdfPreview))({
      title: (draft ? "Prévia do contrato " : "Contrato ") + n,
      fileName: (draft ? "Prévia do contrato " : "Contrato ") + n.replace(/\//g, "-") + ".pdf",
      url: URL.createObjectURL(blob),
      revokeOnClose: true,
    });
  }
  async function load() {
    setBusy(true);
    setValues({});
    setOriginal(null);
    try {
      const { data, error } = await table("residual_contracts")
        .select("number,body")
        .eq("proposal_id", id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (edit) {
          setOriginal(data);
          setNumber(data.number);
          prepare(data.body);
          setOpen(true);
        } else await preview(data.number, data.body);
        return;
      }
      const p = await proposalsDb.get(id);
      if (p?.status !== "aprovada") throw new Error("A proposta precisa estar aprovada.");
      let address = "";
      let cnpj = p.client_cnpj;
      if (p.client_id || cnpj) {
        let q = table("commercial_clients").select("address,cnpj");
        if (p.client_id) q = q.eq("id", p.client_id);
        else {
          const digits = cnpj!.replace(/\D/g, "");
          const formatted = digits.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            "$1.$2.$3/$4-$5",
          );
          q = q.in("cnpj", [cnpj, digits, formatted]);
        }
        const { data: clients, error } = await q.limit(2);
        if (error) throw error;
        if (clients?.length === 1) {
          address = clients[0].address ?? "";
          cnpj = cnpj || clients[0].cnpj;
        }
      }
      setNumber(proposalCode(p).replace("RESD ", ""));
      prepare(
        "CONTRATO DE PRESTAÇÃO DE SERVIÇO DE ASSESSORIA AMBIENTAL\n\n" +
          contractDraft({ ...p, client_cnpj: cnpj }, address),
      );
      setOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function issue() {
    const emptyField = !fullEditor && fields.find((field) => !field.value.trim());
    if (emptyField) {
      toast.error("Preencha o campo " + emptyField.label + ".");
      return;
    }
    if (!fullEditor && fields.some((f) => f.months && !/^[1-9]\d{0,2}$/.test(f.value))) {
      toast.error("Informe a vigência em meses, de 1 a 999.");
      return;
    }
    const pending = missing.filter((k) => !values[k]?.trim());
    if (pending.length) {
      toast.error("Preencha: " + pending.map(label).join(", ") + ".");
      document
        .getElementById("contract-missing-" + id + "-" + missing.indexOf(pending[0]))
        ?.focus();
      return;
    }
    setBusy(true);
    try {
      await commercialRpc(original ? "revise_unsigned_contract" : "issue_residual_contract", {
        ...(original ? { expected_number: original.number, expected_body: original.body } : {}),
        target: id,
        contract_number: number,
        document: finalText,
      });
      toast.success(
        original
          ? "Contrato atualizado."
          : "Contrato emitido. Registre as assinaturas em Contratos.",
      );
      setOpen(false);
      try {
        await preview(number, finalText);
      } finally {
        await qc.invalidateQueries({ queryKey: ["contract-register"] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
        {edit ? "Editar contrato" : "Preparar contrato"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Revisar contrato</DialogTitle>
          {missing.length > 0 && (
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold">Dados para completar o contrato</h3>
              {missing.map((key, i) => (
                <label key={key} className="grid gap-1 text-sm">
                  {label(key)}
                  <Input
                    id={"contract-missing-" + id + "-" + i}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!missing.some((k) => values[k]?.trim())}
                onClick={() => (fullEditor ? setBody(finalText) : prepare(finalText))}
              >
                Aplicar ao texto
              </Button>
            </section>
          )}
          <label className="grid gap-1 text-sm">
            Número do contrato
            <Input maxLength={80} value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          {!fullEditor &&
            fields.map((field, index) => {
              const update = (value: string) =>
                setFields((current) =>
                  current.map((item, i) => (i === index ? { ...item, value } : item)),
                );
              return (
                <label key={field.label} className="grid gap-1 text-sm">
                  {field.label}
                  {field.label === "Cidade da assinatura" || field.months ? (
                    <Input
                      type={field.months ? "number" : "text"}
                      min={field.months ? 1 : undefined}
                      max={field.months ? 999 : undefined}
                      value={field.value}
                      onChange={(e) => update(e.target.value)}
                    />
                  ) : (
                    <Textarea
                      rows={field.label === "Escopo dos serviços" ? 6 : 3}
                      value={field.value}
                      onChange={(e) => update(e.target.value)}
                    />
                  )}
                </label>
              );
            })}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (fullEditor) prepare(body);
              else {
                setBody(documentText);
                setFullEditor(true);
              }
            }}
          >
            {fullEditor ? "Voltar aos campos" : "Editar texto completo"}
          </Button>
          {fullEditor && (
            <label className="grid gap-1 text-sm">
              Texto para emissão
              <Textarea
                className="h-[45dvh]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Confira as partes, o escopo, os valores e o prazo. A emissão guarda esta versão para
            consulta e assinatura.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !body.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await preview(number, finalText, true);
                } catch {
                  toast.error("Não foi possível visualizar o PDF.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Visualizar PDF
            </Button>
            <Button disabled={busy || !number.trim() || !body.trim()} onClick={() => void issue()}>
              {edit ? "Salvar alterações" : "Emitir contrato"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {pdfPreviewDialog}
    </>
  );
}
