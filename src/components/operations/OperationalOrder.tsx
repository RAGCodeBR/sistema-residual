import { ContractAction } from "@/components/proposals/ContractAction";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/residual-logo-transparent.png";
import { commercialRpc } from "@/lib/commercial-clients";
import { useAuth } from "@/hooks/use-auth";
import { buildSlipPdf, emptySlip, type Order, type Slip } from "@/lib/operational-slip";
import { money, proposalCode, shortDate, todayIso } from "@/lib/proposals";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/proposals/ProposalFields";
import { CommercialAddress } from "@/components/CommercialAddress";
import { DeliveryPhotos } from "./DeliveryPhotos";
import { SignatureField } from "./SignatureField";
export type EquipmentOrder = Order & {
  service_address: string | null;
  site: string | null;
  equipment: string | null;
  residue: string | null;
  exchange_price: number | null;
};
type Kind = "entrega" | "troca" | "retirada";
type Fields = Pick<
  Slip,
  | "company"
  | "address"
  | "equipment"
  | "day"
  | "residue"
  | "notes"
  | "driver"
  | "clientSigner"
  | "clientSignature"
  | "driverSignature"
> & { replacement: string };
type Event = { id: string; kind: Kind; seq: number; fields: Fields; amount: number | null };
export function OperationalOrder({ order }: { order: EquipmentOrder }) {
  const { user, hasPermission } = useAuth(),
    qc = useQueryClient(),
    { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [action, setAction] = useState<Kind | null>(null);
  const history = useQuery({
    queryKey: ["equipment-events", user?.id, order.id],
    queryFn: () => commercialRpc<Event[]>("equipment_history", { target: order.id }),
    staleTime: 0,
  });
  const last = history.data?.at(-1);
  async function pdf(fields: Partial<Slip>, e?: Event) {
    try {
      const title = e ? "Ficha de " + e.kind : "Romaneio anterior";
      const blob = await buildSlipPdf(
        order,
        { ...emptySlip, ...fields },
        e?.kind,
        e?.fields.replacement,
        e?.amount == null ? undefined : money(e.amount),
      );
      openPdfPreview({
        title,
        subtitle: proposalCode(order),
        fileName: title + " - " + proposalCode(order).replace("/", "-") + ".pdf",
        url: URL.createObjectURL(blob),
        revokeOnClose: true,
      });
    } catch {
      toast.error("Não foi possível abrir o PDF.");
    }
  }
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <img src={logo} className="h-14 rounded bg-white p-1" alt="Residual" />
        <div>
          <h1 className="text-xl font-bold">{order.client_name}</h1>
          <p>
            {proposalCode(order)} · {order.subject}
          </p>
        </div>
      </header>
      {hasPermission("proposals") && <ContractAction id={order.id} />}
      {history.isPending ? (
        "Carregando fichas…"
      ) : history.isError ? (
        <p role="alert">{history.error.message}</p>
      ) : (
        <>
          {history.data.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
            >
              <div>
                <strong>Ficha de {e.kind}</strong>
                <p className="text-sm">
                  {shortDate(e.fields.day)} · {e.fields.equipment}
                  {e.amount !== null && " · " + money(e.amount)}
                </p>
              </div>
              <Button variant="outline" onClick={() => void pdf(e.fields, e)}>
                Abrir PDF
              </Button>
            </div>
          ))}
          {action ? (
            <EventForm
              key={action}
              order={order}
              kind={action}
              last={last}
              cancel={() => setAction(null)}
              done={async () => {
                await Promise.all([
                  qc.invalidateQueries({ queryKey: ["equipment-events"] }),
                  qc.invalidateQueries({ queryKey: ["approved-billing"] }),
                ]);
                setAction(null);
              }}
            />
          ) : !last ? (
            <Button onClick={() => setAction("entrega")}>Preencher ficha de entrega</Button>
          ) : last.kind !== "retirada" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAction("retirada")}>Preencher ficha de retirada</Button>
              <Button variant="outline" onClick={() => setAction("troca")}>
                Registrar troca solicitada
              </Button>
            </div>
          ) : (
            <p className="text-sm">Retirada concluída · disponível no Financeiro</p>
          )}
        </>
      )}
      <DeliveryPhotos proposalId={order.id} />
      {order.revision > 0 && (
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              const legacy = await commercialRpc<{ fields: Partial<Slip> }>(
                "read_operational_slip",
                { target: order.id },
              );
              await pdf(legacy.fields);
            } catch {
              toast.error("Falha ao abrir o romaneio anterior.");
            }
          }}
        >
          Consultar romaneio anterior
        </Button>
      )}
      {pdfPreviewDialog}
    </div>
  );
}
function EventForm({
  order,
  kind,
  last,
  cancel,
  done,
}: {
  order: EquipmentOrder;
  kind: Kind;
  last?: Event;
  cancel: () => void;
  done: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [previous] = useState(last?.seq ?? 0);
  const [requestId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState<Fields>({
    company: order.client_name,
    address: last?.fields.address || order.service_address || order.site || "",
    equipment: last?.fields.replacement || last?.fields.equipment || order.equipment || "",
    replacement: "",
    day: todayIso(),
    residue: order.residue || "",
    notes: "",
    driver: "",
    clientSigner: "",
    clientSignature: "",
    driverSignature: "",
  });
  const [amount, setAmount] = useState<number | null>(order.exchange_price ?? null),
    [busy, setBusy] = useState(false);
  const locations = useQuery({
    queryKey: ["operational-addresses", user?.id, order.id],
    queryFn: () =>
      commercialRpc<{ customer: string; address: string | null }[]>("operational_addresses", {
        proposal: order.id,
      }),
  });
  const change = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await commercialRpc("complete_equipment_event", {
        target: order.id,
        request_id: requestId,
        previous,
        action: kind,
        details: fields,
        agreed: kind === "troca" ? amount : null,
      });
      await done();
      toast.success("Ficha de " + kind + " registrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar ficha.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <legend className="mb-3 font-semibold">Ficha de {kind}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["company", "Empresa"],
              ["day", "Data da " + kind],
              ["address", "Endereço de atendimento"],
              ["equipment", kind === "troca" ? "Equipamento retirado" : "Equipamento"],
              ...(kind === "troca" ? [["replacement", "Equipamento entregue"]] : []),
              ["residue", "Tipo de resíduo"],
              ["notes", "Observações"],
            ] as [keyof Fields, string][]
          ).map(([k, label]) => (
            <label key={k} className="grid gap-1 text-sm">
              {label}
              <Input
                required={!["residue", "notes"].includes(k)}
                maxLength={1000}
                type={k === "day" ? "date" : "text"}
                min={k === "day" ? last?.fields.day : undefined}
                max={k === "day" ? todayIso() : undefined}
                value={fields[k]}
                onChange={(e) => change(k, e.target.value)}
              />
            </label>
          ))}
        </div>
        <CommercialAddress
          customer={locations.data?.[0]?.customer}
          proposal={order.id}
          value={fields.address}
          addresses={(locations.data ?? []).flatMap((a) => (a.address ? [a.address] : []))}
          onChange={(a) => change("address", a)}
        />
        {kind === "troca" && (
          <label className="grid gap-1 text-sm">
            Valor acordado desta troca
            <MoneyInput value={amount} onChange={setAmount} placeholder="Informe o valor" />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["clientSigner", "driver"] as const).map((k) => {
            const sig = k === "driver" ? "driverSignature" : "clientSignature",
              label = k === "driver" ? "Motorista" : "Responsável do cliente";
            return (
              <div className="space-y-2" key={k}>
                <label className="grid gap-1 text-sm">
                  {label}
                  <Input value={fields[k]} onChange={(e) => change(k, e.target.value)} />
                </label>
                <SignatureField
                  label={"Assinatura · " + label}
                  value={fields[sig]}
                  onChange={(v) => change(sig, v)}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={kind === "troca" && amount === null}>Concluir {kind}</Button>
          <Button type="button" variant="outline" onClick={cancel}>
            Voltar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
