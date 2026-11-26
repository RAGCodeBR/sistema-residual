import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
            list.data.slice(0, 25).map((p) => <BillingCard key={p.id} p={p} />)
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
function BillingCard({ p }: { p: Bill }) {
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
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <header>
        <span className="text-xs font-semibold text-primary">{proposalCode(p)}</span>
        <h3 className="text-lg font-semibold">{p.client_name}</h3>
        <p>{p.subject}</p>
      </header>
      <p className="break-words text-sm text-muted-foreground">
        {[
          p.client_cnpj,
          p.client_contact,
          p.client_phone,
          p.client_email,
          p.client_city,
          p.service_address || p.registered_address,
          p.state_registration && "IE " + p.state_registration,
          p.municipal_registration && "IM " + p.municipal_registration,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
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
                <strong>{l.item.description || "Item"}</strong> · {l.units ?? "?"} {l.item.unit} ={" "}
                {money(l.base)} + frete {money(l.shipping)} ·{" "}
                <strong>{l.total === null ? "Conferir valores" : money(l.total)}</strong>
              </p>
            ))}
          </section>
        ))
      ) : (
        <p>Mensalidade · {money((p.content as ConsultingContent).monthly_price)}</p>
      )}
      <p className="text-sm">
        {waste ? paymentTerms(waste) : "Prazo de " + days + " dias após emissão da nota fiscal."}
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
      <p className="text-sm font-semibold">
        {days == null
          ? "Conferir vencimento nas condições da proposta"
          : p.base_date
            ? "Vencimento em " + shortDate(addDays(p.base_date, days))
            : waste
              ? "Aguardando execução"
              : "Aguardando emissão da nota"}
      </p>
    </article>
  );
}
