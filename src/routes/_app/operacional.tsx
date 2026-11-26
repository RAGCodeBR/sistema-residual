import { OperationalOrder, type EquipmentOrder } from "@/components/operations/OperationalOrder";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { table } from "@/lib/company";
import { proposalCode } from "@/lib/proposals";

export const Route = createFileRoute("/_app/operacional")({ component: Operations });
const pageSize = 25;

function Operations() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<EquipmentOrder | null>(null);
  const queue = useQuery({
    queryKey: ["operational-queue", user?.id, page],
    enabled: !selected,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15_000,

    queryFn: async () => {
      const { data, error } = await table("equipment_queue")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      if (error) throw error;
      return data as EquipmentOrder[];
    },
  });
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 sm:p-6">
      {selected ? (
        <>
          <Button variant="outline" onClick={() => setSelected(null)}>
            Voltar ao operacional
          </Button>
          <OperationalOrder key={selected.id} order={selected} />
        </>
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-bold">Operacional</h1>
            <p className="text-muted-foreground">
              Entregas, trocas e retiradas das propostas aprovadas
            </p>
          </header>
          {queue.isError ? (
            <p role="alert">
              Não foi possível carregar as propostas.{" "}
              <Button variant="outline" onClick={() => queue.refetch()}>
                Tentar novamente
              </Button>
            </p>
          ) : queue.isPending ? (
            <p>Carregando propostas…</p>
          ) : !queue.data?.length ? (
            <p className="rounded-xl border p-5">Nenhuma proposta aprovada nesta página.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {queue.data.slice(0, pageSize).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{o.client_name}</h2>
                    <p className="text-sm">
                      {proposalCode(o)} · {o.subject}
                    </p>
                  </div>
                  <Button variant={o.issued ? "outline" : "default"} onClick={() => setSelected(o)}>
                    Abrir operação
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(page > 0 || (queue.data?.length ?? 0) > pageSize) && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={(queue.data?.length ?? 0) <= pageSize}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
