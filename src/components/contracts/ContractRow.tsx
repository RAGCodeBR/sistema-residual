import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { table } from "@/lib/company";
import { commercialRpc } from "@/lib/commercial-clients";
import { contractPdf } from "@/lib/residual-contract";
import { proposalCode, shortDate } from "@/lib/proposals";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const statuses = {
  ativo: "Ativo",
  aguardando: "Aguardando vigência",
  agendado: "Início futuro",
  encerrado: "Encerrado",
};
export type ContractRecord = {
  proposal_id: string;
  number: string;
  proposal_number: number;
  year: number;
  client_name: string;
  client_cnpj: string | null;
  subject: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  term_months: number | null;
  term_clause: string | null;
  status: keyof typeof statuses;
};
export function ContractRow({ row: r, remaining }: { row: ContractRecord; remaining?: number }) {
  const qc = useQueryClient(),
    { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [edit, setEdit] = useState(false),
    [first, setFirst] = useState(""),
    [last, setLast] = useState(""),
    [busy, setBusy] = useState(false);
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
      const blob = await contractPdf(r.number, data.body);
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
  return (
    <article className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            Contrato {r.number} · {statuses[r.status]}
          </p>
          <h2 className="font-semibold">{r.client_name}</h2>
        </div>
        {remaining !== undefined && (
          <div className="ml-auto text-right">
            <strong className="block text-sm text-primary">
              {remaining === 0
                ? "Vence hoje"
                : remaining === 1
                  ? "Vence amanhã"
                  : "Faltam " + remaining + " dias"}
            </strong>
            <span className="text-xs text-muted-foreground">
              Vencimento · {shortDate(r.ends_on)}
            </span>
          </div>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={pdf}>
          Abrir PDF
        </Button>
      </div>
      <p className="text-sm">{r.subject}</p>
      <p className="text-sm text-muted-foreground">
        {r.term_months ? r.term_months + " meses · " : ""}
        {r.starts_on
          ? shortDate(r.starts_on) + " até " + shortDate(r.ends_on)
          : "Datas de vigência a informar"}{" "}
        ·{" "}
        <Link
          className="underline"
          to="/propostas/$proposalId"
          params={{ proposalId: r.proposal_id }}
        >
          {proposalCode({ year: r.year, number: r.proposal_number })}
        </Link>
      </p>
      {r.term_clause && (
        <details className="text-sm">
          <summary className="cursor-pointer text-primary">Prazo no contrato</summary>
          <p className="mt-1 text-muted-foreground">{r.term_clause}</p>
        </details>
      )}
      {!r.starts_on && !edit && (
        <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
          Registrar vigência
        </Button>
      )}
      {edit && !r.starts_on && (
        <form
          className="flex flex-wrap items-end gap-2"
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
          <label className="text-sm">
            Início da vigência
            <Input required type="date" value={first} onChange={(e) => start(e.target.value)} />
          </label>
          <label className="text-sm">
            Fim da vigência
            <Input
              required
              type="date"
              min={first}
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Salvar datas</Button>
          <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
            Cancelar
          </Button>
        </form>
      )}
      {pdfPreviewDialog}
    </article>
  );
}
