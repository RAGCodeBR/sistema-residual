import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ContractRow, type ContractRecord } from "@/components/contracts/ContractRow";
import { table } from "@/lib/company";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/_app/contratos-ativos")({ component: ActiveContracts });
const businessDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });
function ActiveContracts() {
  const { user } = useAuth(),
    [page, setPage] = useState(0);
  const list = useQuery({
    queryKey: ["contract-register", user?.id, "expirations", page],
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await table("contract_register")
        .select("*")
        .eq("status", "ativo")
        .order("ends_on")
        .order("proposal_id")
        .range(page * 25, page * 25 + 25);
      if (error) throw new Error(error.message);
      const today = Date.parse(businessDate.format(new Date()));
      return (data as ContractRecord[])
        .map((row) => ({
          row,
          remaining: Math.round((Date.parse(row.ends_on!) - today) / 86400000),
        }))
        .filter((item) => item.remaining >= 0);
    },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Contratos ativos</h1>
      {list.isPending ? (
        "Carregando contratos ativos…"
      ) : list.isError ? (
        <p role="alert">{list.error.message}</p>
      ) : list.data.length ? (
        <div className="divide-y rounded-xl border bg-card">
          {list.data.slice(0, 25).map(({ row, remaining }) => (
            <ContractRow key={row.proposal_id} row={row} remaining={remaining} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-4">
          <p>Nenhum contrato ativo{page ? " nesta página" : " no momento"}.</p>
          <Link to="/contratos" className="text-sm text-primary underline">
            Consultar todos os contratos
          </Link>
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
    </main>
  );
}
