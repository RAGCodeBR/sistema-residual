import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, PenLine } from "lucide-react";
import { table } from "@/lib/company";
import { commercialRpc } from "@/lib/commercial-clients";
import { shortDate } from "@/lib/proposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { signatureCount, todaySaoPaulo, type ContractRecord } from "./contract-status";

export function SignatureControl({ row }: { row: ContractRecord }) {
  const qc = useQueryClient(),
    [party, setParty] = useState<"cliente" | "residual" | null>(null),
    [snapshot, setSnapshot] = useState<{ body: string; number: string } | null>(null),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [day, setDay] = useState("");
  const today = todaySaoPaulo();
  async function start(p: "cliente" | "residual") {
    setBusy(true);
    try {
      const { data, error } = await table("residual_contracts")
        .select("number,body")
        .eq("proposal_id", row.proposal_id)
        .single();
      if (error) throw error;
      setSnapshot(data);
      setName("");
      setDay(today);
      setParty(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!snapshot) return;
    setBusy(true);
    try {
      await commercialRpc("record_contract_signature", {
        target: row.proposal_id,
        party_name: party,
        signer_name: name,
        signature_day: day,
        expected_number: snapshot.number,
        expected_body: snapshot.body,
      });
      setParty(null);
      await qc.invalidateQueries({ queryKey: ["contract-register"] });
      toast.success("Assinatura registrada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const count = signatureCount(row);
  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border p-4",
        count < 2 && "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Assinaturas</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count} de 2</span>
      </div>
      <ul className="divide-y rounded-lg border bg-background">
        {(["cliente", "residual"] as const).map((p) => {
          const signer = p === "cliente" ? row.customer_signer : row.residual_signer,
            date = p === "cliente" ? row.customer_signed_on : row.residual_signed_on,
            label = p === "cliente" ? "Contratante" : "Residual";
          return (
            <li key={p} className="flex flex-wrap items-center gap-3 p-3">
              {signer ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {signer ? signer + " · " + shortDate(date) : "Pendente"}
                </p>
              </div>
              {!signer && party !== p && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(p)}>
                  <PenLine aria-hidden /> Registrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {party && (
        <form
          className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="text-sm font-medium sm:col-span-2">
            Assinatura da {party === "cliente" ? "contratante" : "Residual"}
          </p>
          <label className="grid gap-1 text-sm">
            Quem assinou
            <Input
              required
              autoFocus
              maxLength={180}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Data da assinatura
            <Input
              type="date"
              required
              max={today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={busy || !name.trim()}>
              Confirmar registro
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setParty(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
