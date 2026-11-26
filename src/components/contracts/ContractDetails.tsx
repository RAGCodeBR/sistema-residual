import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, Undo2 } from "lucide-react";
import { table } from "@/lib/company";
import { commercialRpc } from "@/lib/commercial-clients";
import { contractPdf, type SignatureReceipt } from "@/lib/residual-contract";
import { proposalCode, shortDate } from "@/lib/proposals";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ContractAction } from "./ContractAction";
import { SignatureControl } from "./SignatureControl";
import {
  daysUntil,
  remainingLabel,
  signatureCount,
  statuses,
  statusTone,
  type ContractRecord,
} from "./contract-status";

export function StatusBadge({
  status,
  row,
}: {
  status: keyof typeof statusTone;
  row?: ContractRecord;
}) {
  const tone = statusTone[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone.badge,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {status === "assinatura" && row?.customer_signer
        ? "Aguardando assinatura da Residual"
        : status === "assinatura" && row?.residual_signer
          ? "Aguardando assinatura do cliente"
          : status === "propostas"
            ? "Aguardando contrato"
            : statuses[status]}
    </span>
  );
}

/** Painel lateral com tudo o que se faz em um contrato. */
export function ContractSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const row = useQuery({
    queryKey: ["contract-register", "one", id],
    enabled: !!id,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await table("contract_register")
        .select("*")
        .eq("proposal_id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ContractRecord | null;
    },
  });
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {row.isPending ? (
          <div className="p-6 text-sm text-muted-foreground">
            <SheetTitle className="sr-only">Contrato</SheetTitle>
            Carregando contrato…
          </div>
        ) : row.isError || !row.data ? (
          <div className="p-6 text-sm">
            <SheetTitle className="sr-only">Contrato</SheetTitle>
            {row.error?.message ?? "Este contrato não está mais disponível."}
          </div>
        ) : (
          <ContractDetails row={row.data} onRemoved={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

const steps = ["Emitido", "Assinaturas", "Vigência", "Em vigor"] as const;
function stepIndex(r: ContractRecord) {
  if (r.status === "assinatura") return 1;
  if (r.status === "aguardando") return 2;
  return 3;
}

function Progress({ row }: { row: ContractRecord }) {
  const current = stepIndex(row);
  const finished = row.status === "ativo" || row.status === "encerrado";
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Andamento do contrato">
      {steps.map((label, i) => {
        const done = i < current || (finished && i === current);
        const active = i === current && !finished;
        return (
          <li key={label} className="space-y-1.5">
            <div
              className={cn(
                "h-1 rounded-full",
                done ? "bg-primary" : active ? "bg-primary/40" : "bg-muted",
              )}
            />
            <p
              className={cn(
                "flex items-center gap-1 text-[11px] leading-tight",
                done || active ? "text-foreground" : "text-muted-foreground",
                active && "font-semibold",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done && <Check className="size-3 shrink-0 text-primary" aria-hidden />}
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

function ContractDetails({ row: r, onRemoved }: { row: ContractRecord; onRemoved: () => void }) {
  const qc = useQueryClient(),
    { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [edit, setEdit] = useState(false),
    [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [busy, setBusy] = useState(false);
  const remaining = r.status === "ativo" ? daysUntil(r.ends_on) : undefined;
  const unsigned = signatureCount(r) === 0;

  function start(value: string) {
    setFirst(value);
    if (!value || !r.term_months) {
      setLast("");
      return;
    }
    const d = new Date(value + "T12:00:00Z"),
      day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + r.term_months + 1);
    d.setUTCDate(0);
    d.setUTCDate(Math.min(day, d.getUTCDate()));
    setLast(d.toISOString().slice(0, 10));
  }
  async function pdf() {
    setBusy(true);
    try {
      const { data, error } = await table("residual_contracts")
        .select("body")
        .eq("proposal_id", r.proposal_id)
        .single();
      if (error) throw error;
      const receipt = r.customer_signer
        ? await commercialRpc<SignatureReceipt | null>("contract_signature_receipt", {
            target: r.proposal_id,
          })
        : null;
      const blob = await contractPdf(r.number, data.body, receipt);
      openPdfPreview({
        title: "Contrato " + r.number,
        subtitle: r.client_name,
        fileName: "Contrato " + r.number.replace(/\//g, "-") + ".pdf",
        url: URL.createObjectURL(blob),
        revokeOnClose: true,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (
      !window.confirm(
        `Desfazer a emissão do contrato ${r.number}? O texto desta emissão será descartado. A proposta voltará para "Aguardando contrato".`,
      )
    )
      return;
    setBusy(true);
    try {
      await commercialRpc("undo_unsigned_contract", {
        target: r.proposal_id,
        issued_at: r.created_at,
        expected_number: r.number,
      });
      await qc.invalidateQueries({ queryKey: ["contract-register"] });
      toast.success("Emissão desfeita.");
      onRemoved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="space-y-4 border-b p-6 pr-12">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">Contrato {r.number}</span>
            <StatusBadge status={r.status} row={r} />
          </div>
          <SheetTitle className="text-xl leading-tight">{r.client_name}</SheetTitle>
          <SheetDescription>{r.subject}</SheetDescription>
        </div>
        <Progress row={r} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={pdf}>
            <FileText aria-hidden /> Abrir PDF
          </Button>
          {unsigned && (
            <ContractAction
              id={r.proposal_id}
              edit
              showIssued={openPdfPreview}
              triggerProps={{ size: "sm", variant: "outline" }}
            />
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/propostas/$proposalId" params={{ proposalId: r.proposal_id }}>
              <ExternalLink aria-hidden />
              Proposta {proposalCode({ year: r.year, number: r.proposal_number })}
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/30 p-4">
          <Info label="Prazo">{r.term_months ? r.term_months + " meses" : "—"}</Info>
          <Info label="Emitido em">{shortDate(r.created_at)}</Info>
          <Info label="Início da vigência">
            {r.starts_on ? shortDate(r.starts_on) : "A informar"}
          </Info>
          <Info label="Fim da vigência">
            {r.ends_on ? shortDate(r.ends_on) : "A informar"}
            {remaining !== undefined && (
              <span
                className={cn(
                  "mt-0.5 block text-xs font-semibold",
                  remaining <= 30 ? "text-amber-600 dark:text-amber-400" : "text-primary",
                )}
              >
                {remainingLabel(remaining)}
              </span>
            )}
          </Info>
          {r.client_cnpj && <Info label="CNPJ">{r.client_cnpj}</Info>}
        </dl>

        <SignatureControl row={r} />

        {r.status === "aguardando" && !r.starts_on && (
          <section className="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <div>
              <h3 className="text-sm font-semibold">Vigência</h3>
              <p className="text-xs text-muted-foreground">
                Assinaturas completas. Informe quando o contrato começa a valer.
              </p>
            </div>
            {!edit ? (
              <Button size="sm" onClick={() => setEdit(true)}>
                Registrar vigência
              </Button>
            ) : (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await commercialRpc("register_contract_period", {
                      target: r.proposal_id,
                      first_day: first,
                      last_day: last,
                    });
                    await qc.invalidateQueries({ queryKey: ["contract-register"] });
                    setEdit(false);
                    toast.success("Vigência registrada.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="grid gap-1 text-sm">
                  Início
                  <Input
                    required
                    type="date"
                    value={first}
                    onChange={(e) => start(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Fim
                  <Input
                    required
                    type="date"
                    min={first}
                    value={last}
                    onChange={(e) => setLast(e.target.value)}
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button size="sm" disabled={busy}>
                    Salvar datas
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </section>
        )}

        {r.term_clause && (
          <details className="group rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Cláusula de prazo</summary>
            <p className="mt-2 leading-relaxed text-muted-foreground">{r.term_clause}</p>
          </details>
        )}
      </div>

      {unsigned && !r.starts_on && (
        <footer className="border-t p-6">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={undo}
          >
            <Undo2 aria-hidden /> Desfazer emissão
          </Button>
        </footer>
      )}
      {pdfPreviewDialog}
    </div>
  );
}
