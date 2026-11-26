import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { table } from "@/lib/company";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContractRow, statuses, type ContractRecord } from "@/components/contracts/ContractRow";
export const Route = createFileRoute("/_app/contratos")({ component: Contracts });
function Contracts() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("ativo"),
    [page, setPage] = useState(0);
  const activeCount = useQuery({
    queryKey: ["contract-register", user?.id, "count-active"],
    refetchInterval: 60000,
    queryFn: async () => {
      const { count, error } = await table("contract_register")
        .select("proposal_id", { head: true, count: "exact" })
        .eq("status", "ativo");
      if (error) throw new Error(error.message);
      return count as number;
    },
  });
  const list = useQuery({
    queryKey: ["contract-register", user?.id, filter, page],
    refetchOnMount: "always",
    refetchInterval: 60000,
    queryFn: async () => {
      let q = table("contract_register").select("*");
      if (filter !== "todos") q = q.eq("status", filter);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .order("proposal_id")
        .range(page * 25, page * 25 + 25);
      if (error) throw new Error(error.message);
      return data as ContractRecord[];
    },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Contratos</h1>
      </header>
      <Tabs
        value={filter}
        onValueChange={(value) => {
          setPage(0);
          setFilter(value);
        }}
      >
        <TabsList
          aria-label="Situação dos contratos"
          className="h-auto max-w-full flex-wrap justify-start gap-1"
        >
          <TabsTrigger value="ativo">
            Ativos{" "}
            {activeCount.data != null && (
              <span className="ml-1 tabular-nums">({activeCount.data})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="aguardando">Aguardando vigência</TabsTrigger>
          <TabsTrigger value="agendado">Início futuro</TabsTrigger>
          <TabsTrigger value="encerrado">Encerrados</TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="space-y-3">
          <h2 className="font-semibold">
            {filter === "ativo"
              ? "Contratos ativos"
              : filter === "todos"
                ? "Todos os contratos"
                : statuses[filter as keyof typeof statuses]}
          </h2>
          {list.isPending ? (
            "Carregando contratos…"
          ) : list.isError ? (
            <p role="alert">{list.error.message}</p>
          ) : list.data.length ? (
            <div className="divide-y rounded-xl border bg-card">
              {list.data.slice(0, 25).map((row) => (
                <ContractRow key={row.proposal_id} row={row} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border p-4 text-sm">
              {filter === "ativo" ? (
                <>
                  Nenhum contrato ativo nesta página.{" "}
                  <button
                    className="font-semibold text-primary underline"
                    onClick={() => {
                      setPage(0);
                      setFilter("aguardando");
                    }}
                  >
                    Ver contratos aguardando vigência
                  </button>
                </>
              ) : (
                "Nenhum contrato nesta seleção."
              )}
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
