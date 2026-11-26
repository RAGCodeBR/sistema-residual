import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { table } from "@/lib/company";
import { commercialRpc } from "@/lib/commercial-clients";
import { shortDate } from "@/lib/proposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractRecord } from "./ContractRow";
export function SignatureControl({ row }: { row: ContractRecord }) {
  const qc = useQueryClient(),
    [party, setParty] = useState<"cliente" | "residual" | null>(null),
    [snapshot, setSnapshot] = useState<{ body: string; number: string } | null>(null),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [day, setDay] = useState("");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
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
  return (
    <section className="space-y-2 rounded-lg bg-muted/40 p-3">
      <h3 className="text-sm font-semibold">Controle de assinaturas</h3>
      {(["cliente", "residual"] as const).map((p) => {
        const signer = p === "cliente" ? row.customer_signer : row.residual_signer,
          date = p === "cliente" ? row.customer_signed_on : row.residual_signed_on,
          label = p === "cliente" ? "Cliente" : "Residual";
        return (
          <div key={p} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {label} · {signer ? signer + " · " + shortDate(date) : "Pendente"}
            </span>
            {!signer && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(p)}>
                Registrar assinatura · {label}
              </Button>
            )}
          </div>
        );
      })}
      {party && (
        <form
          className="grid gap-2 border-t pt-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="grid gap-1 text-sm">
            Quem assinou pela {party === "cliente" ? "contratante" : "Residual"}?
            <Input
              required
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
          <div className="flex gap-2">
            <Button disabled={busy || !name.trim()}>Confirmar registro</Button>
            <Button type="button" variant="ghost" onClick={() => setParty(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
