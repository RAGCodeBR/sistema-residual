import { OperationalOrder, type EquipmentOrder } from "@/components/operations/OperationalOrder";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { table } from "@/lib/company";
import { proposalCode } from "@/lib/proposals";

export const Route = createFileRoute("/_app/operacional")({ component: Operations });
const pageSize = 25;
function Operations() {
  const [tab, setTab] = useState("entregas");
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pb-28 sm:p-6">
      <h1 className="text-2xl font-bold">Operacional</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Operacional">
          <TabsTrigger value="entregas">Fichas de entrega</TabsTrigger>
          <TabsTrigger value="movimentos">Trocas e retiradas</TabsTrigger>
        </TabsList>
        <TabsContent key={tab} value={tab}>
          <OrderWorkspace delivery={tab === "entregas"} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
function OrderWorkspace({ delivery }: { delivery: boolean }) {
  const { user } = useAuth(),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<EquipmentOrder | null>(null);
  const queue = useQuery({
    queryKey: ["operational-queue", user?.id, delivery, page],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    queryFn: async () => {
      let query = table("delivery_workspace").select("*");
      if (!delivery) query = query.eq("delivered", true);
      const { data, error } = await query
        .order("delivered")
        .order("year", { ascending: false })
        .order("number", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      if (error) throw error;
      return data as EquipmentOrder[];
    },
  });
  // Preserve the current form when another proposal arrives or the queue reorders.
  useEffect(() => {
    if (!selected && queue.data?.[0]) setSelected(queue.data[0]);
  }, [selected, queue.data]);
  function changePage(n: number) {
    setSelected(null);
    setPage(n);
  }
  const rows = queue.data?.slice(0, pageSize) ?? [];
  const options = selected && !rows.some((o) => o.id === selected.id) ? [selected, ...rows] : rows;
  return (
    <section className="space-y-4 pt-2">
      {queue.isError && (
        <p role="alert">
          Não foi possível carregar as fichas.{" "}
          <Button variant="outline" onClick={() => queue.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {queue.isPending ? (
        "Carregando fichas…"
      ) : !options.length && !queue.isError ? (
        <p className="rounded-xl border p-4">
          {delivery
            ? "Nenhuma proposta aprovada para entrega."
            : "Nenhuma entrega concluída nesta página."}
        </p>
      ) : null}
      {!!options.length && (
        <label className="grid gap-1.5 text-sm font-medium">
          Cliente e proposta
          <select
            className="h-11 w-full rounded-md border bg-background px-3"
            value={selected?.id ?? options[0].id}
            onChange={(e) => setSelected(options.find((o) => o.id === e.target.value) ?? null)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.client_name} · {proposalCode(o)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(page > 0 || (queue.data?.length ?? 0) > pageSize) && (
        <div className="flex gap-2">
          <Button variant="outline" disabled={!page} onClick={() => changePage(page - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={(queue.data?.length ?? 0) <= pageSize}
            onClick={() => changePage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      {selected && (
        <OperationalOrder
          key={selected.id}
          order={options.find((o) => o.id === selected.id) ?? selected}
          deliveryOnly={delivery}
        />
      )}
    </section>
  );
}
