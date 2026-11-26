import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FilePlus2, FileText, PencilLine, TriangleAlert } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  onIssued,
  context,
  triggerProps,
}: {
  id: string;
  edit?: boolean;
  showIssued?: (target: PdfPreviewTarget) => void;
  /** Chamado depois de emitir ou salvar, para a tela abrir o contrato. */
  onIssued?: (id: string) => void;
  /** Linha de contexto no topo da janela (proposta · cliente). */
  context?: string;
  triggerProps?: ButtonProps;
}) {
  const [heading, setHeading] = useState(context ?? "");
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
      setHeading(context ?? proposalCode(p) + " · " + p.client_name);
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
        onIssued?.(id);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shortFields = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.months || field.label === "Cidade da assinatura");
  const longFields = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !field.months && field.label !== "Cidade da assinatura");
  const update = (index: number, value: string) =>
    setFields((current) => current.map((item, i) => (i === index ? { ...item, value } : item)));
  const pendingCount = missing.filter((k) => !values[k]?.trim()).length;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        {...triggerProps}
        disabled={busy || triggerProps?.disabled}
        onClick={() => void load()}
      >
        {edit ? <PencilLine aria-hidden /> : <FilePlus2 aria-hidden />}
        {edit ? "Editar contrato" : "Gerar contrato"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-3xl">
          <header className="space-y-1 border-b px-6 py-5 pr-12">
            <DialogTitle className="text-xl">
              {edit ? "Editar contrato " + number : "Gerar contrato"}
            </DialogTitle>
            <DialogDescription>{heading || "Confira os dados antes de emitir."}</DialogDescription>
          </header>

          <div className="space-y-8 px-6 py-6">
            <Section step={1} title="Identificação" hint="Por padrão, o mesmo número da proposta.">
              <label className="grid max-w-xs gap-1 text-sm">
                Número do contrato
                <Input maxLength={80} value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
            </Section>

            {missing.length > 0 && (
              <Section
                step={2}
                title="Dados que faltam"
                hint="A proposta não trouxe estas informações. Elas entram direto no texto."
                aside={
                  pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600">Tudo preenchido</span>
                  )
                }
              >
                <div
                  className={cn(
                    "grid gap-3 rounded-xl border p-4 sm:grid-cols-2",
                    pendingCount > 0 && "border-amber-500/30 bg-amber-500/5",
                  )}
                >
                  {missing.map((key, i) => (
                    <label key={key} className="grid gap-1 text-sm">
                      <span className="first-letter:uppercase">{label(key)}</span>
                      <Input
                        id={"contract-missing-" + id + "-" + i}
                        value={values[key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </Section>
            )}

            <Section
              step={missing.length > 0 ? 3 : 2}
              title={fullEditor ? "Texto do contrato" : "Condições do contrato"}
              hint={
                fullEditor
                  ? "Edição livre do documento inteiro."
                  : "Vêm da proposta aprovada. Ajuste o que mudou na negociação."
              }
              aside={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
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
              }
            >
              {fullEditor ? (
                <Textarea
                  aria-label="Texto para emissão"
                  className="h-[50dvh] font-mono text-xs leading-relaxed"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              ) : fields.length ? (
                <div className="space-y-4">
                  {shortFields.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {shortFields.map(({ field, index }) => (
                        <label key={field.label} className="grid gap-1 text-sm">
                          {field.label}
                          <Input
                            type={field.months ? "number" : "text"}
                            min={field.months ? 1 : undefined}
                            max={field.months ? 999 : undefined}
                            value={field.value}
                            onChange={(e) => update(index, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {longFields.map(({ field, index }) => (
                    <label key={field.label} className="grid gap-1 text-sm">
                      {field.label}
                      <Textarea
                        rows={field.label === "Escopo dos serviços" ? 6 : 3}
                        value={field.value}
                        onChange={(e) => update(index, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Este texto não segue o modelo padrão. Use “Editar texto completo” para ajustá-lo.
                </p>
              )}
            </Section>
          </div>

          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-6 py-4 backdrop-blur">
            <p className="max-w-sm text-xs text-muted-foreground">
              {edit
                ? "Só é possível editar antes da primeira assinatura."
                : "Ao emitir, esta versão fica guardada para consulta e assinatura."}
            </p>
            <div className="flex flex-wrap gap-2">
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
                <FileText aria-hidden /> Prévia do PDF
              </Button>
              <Button
                disabled={busy || !number.trim() || !body.trim()}
                onClick={() => void issue()}
              >
                {edit ? "Salvar alterações" : "Emitir contrato"}
              </Button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      {pdfPreviewDialog}
    </>
  );
}

function Section({
  step,
  title,
  hint,
  aside,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums"
            aria-hidden
          >
            {step}
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-6">{title}</h3>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="sm:pl-9">{children}</div>
    </section>
  );
}
