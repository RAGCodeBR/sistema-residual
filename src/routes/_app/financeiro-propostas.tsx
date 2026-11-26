import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { table } from "@/lib/company";
import { commercialRpc } from "@/lib/commercial-clients";
import { billingLines, executionDays } from "@/lib/proposal-billing";
import {
  addDays,
  isWaste,
  money,
  paymentTerms,
  proposalCode,
  shortDate,
  type Proposal,
  type WasteContent,
  type ConsultingContent,
} from "@/lib/proposals";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
type Bill = Proposal & {
  base_date: string | null;
  registered_address: string | null;
  legal_name: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
};
export const Route = createFileRoute("/_app/financeiro-propostas")({ component: Finance });
function Finance() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const list = useQuery({
    queryKey: ["approved-billing", user?.id, page],
    refetchOnMount: "always",
    refetchInterval: 15000,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await table("approved_billing")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: false })
        .range(page * 25, page * 25 + 25);
      if (error) throw new Error(error.message);
      return data as Bill[];
    },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-bold">Financeiro</h1>
      <Tabs defaultValue="faturamento">
        <TabsList aria-label="Financeiro">
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-4" value="faturamento">
          {list.isLoading ? (
            "Carregando propostas aprovadas…"
          ) : list.isError ? (
            <p role="alert">{list.error.message}</p>
          ) : !list.data?.length ? (
            "Nenhuma proposta aprovada nesta página."
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card divide-y">
              {list.data.slice(0, 25).map((p) => (
                <BillingRow key={p.id} p={p} />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {page > 0 && (
              <Button variant="outline" onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
            )}
            {(list.data?.length ?? 0) > 25 && (
              <Button variant="outline" onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
function BillingRow({ p }: { p: Bill }) {
  const qc = useQueryClient();
  const waste = isWaste(p.template) ? (p.content as WasteContent) : null;
  const days = waste ? executionDays(waste) : (p.content as ConsultingContent).due_days;
  const [edited, setEdited] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => commercialRpc("set_billing_date", { target: p.id, day: edited || null }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["approved-billing"] });
      setEdited(null);
      toast.success("Data salva.");
    },
    onError: (e) => toast.error(e.message),
  });
  const totals =
    waste?.groups?.flatMap((group) => billingLines(group).map((line) => line.total)) ?? [];
  const value = !waste
    ? money((p.content as ConsultingContent).monthly_price)
    : totals.length === 1 && totals[0] !== null
      ? money(totals[0])
      : totals.length > 1
        ? "Por material"
        : "Conferir valor";
  const due =
    days == null
      ? "Conferir prazo"
      : p.base_date
        ? shortDate(addDays(p.base_date, days))
        : waste
          ? "Aguardando execução"
          : "Aguardando nota";
  const contact = [
    ["CNPJ", p.client_cnpj],
    ["Contato", p.client_contact],
    ["Telefone", p.client_phone],
    ["E-mail", p.client_email],
    ["Cidade", p.client_city],
    ["Endereço", p.service_address || p.registered_address],
    ["Inscrição estadual", p.state_registration],
    ["Inscrição municipal", p.municipal_registration],
  ].filter(([, v]) => v);
  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 focus-visible:outline-offset-[-3px] sm:grid-cols-[minmax(0,1fr)_8rem_10rem_1rem] sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">{proposalCode(p)}</span>
          <span className="block truncate text-sm font-semibold" title={p.client_name}>
            {p.client_name}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xs text-muted-foreground">
            {waste ? "Mínimo + frete" : "Mensalidade"}
          </span>
          <strong className="text-sm tabular-nums text-primary">{value}</strong>
        </span>
        <span className="col-span-2 row-start-2 text-xs text-muted-foreground sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:text-right">
          <span className="sm:block">Vencimento </span>
          <span className="font-medium text-foreground">{due}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="col-start-3 row-start-1 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 sm:col-start-4"
        />
      </summary>
      <div className="grid gap-5 border-t bg-muted/15 p-4 sm:p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">{p.subject}</h3>
          {waste ? (
            (waste.groups || []).map((g) => (
              <section key={g.id} className="space-y-1">
                <h4 className="font-medium">{g.title || "Condições comerciais"}</h4>
                {g.items.map((i) => (
                  <p key={i.id} className="text-sm">
                    {i.description || "Item"} · {money(i.price)} / {i.unit}
                    {i.minimum && " · mínimo: " + i.minimum}
                  </p>
                ))}
                {billingLines(g).map((l) => (
                  <p key={l.item.id} className="rounded bg-muted px-3 py-2 text-sm">
                    <strong>{l.item.description || "Item"}</strong> · {l.units ?? "?"} {l.item.unit}{" "}
                    = {money(l.base)} + frete {money(l.shipping)} ·{" "}
                    <strong>{l.total === null ? "Conferir valores" : money(l.total)}</strong>
                  </p>
                ))}
              </section>
            ))
          ) : (
            <p>Mensalidade · {money((p.content as ConsultingContent).monthly_price)}</p>
          )}
        </div>
        <div className="min-w-0 space-y-3 lg:border-l lg:pl-5">
          <h4 className="text-sm font-semibold">Pagamento</h4>
          <p className="text-sm text-muted-foreground">
            {waste
              ? paymentTerms(waste)
              : "Prazo de " + days + " dias após emissão da nota fiscal."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              {waste ? "Data de execução" : "Data de emissão da nota fiscal"}
              <Input
                type="date"
                value={edited ?? p.base_date ?? ""}
                onChange={(e) => setEdited(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              disabled={edited === null || save.isPending}
              onClick={() => save.mutate()}
            >
              Salvar data
            </Button>
          </div>
          {contact.length > 0 && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-3 text-xs">
              {contact.map(([label, v]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </details>
  );
}
