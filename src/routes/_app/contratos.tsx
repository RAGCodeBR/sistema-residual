import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { table } from "@/lib/company";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { ContractAction } from "@/components/contracts/ContractAction";
import { proposalCode } from "@/lib/proposals";
import { ContractRow, statuses, type ContractRecord } from "@/components/contracts/ContractRow";
export const Route = createFileRoute("/_app/contratos")({ component: Contracts });
function Contracts() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("ativo"),
    [page, setPage] = useState(0);
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const approvals = useQuery({
    queryKey: ["contract-register", user?.id, "approved-queue", page],
    enabled: filter === "propostas",
    staleTime: 0,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await table("contract_proposal_queue")
        .select("*")
        .order("year", { ascending: false })
        .order("number", { ascending: false })
        .range(page * 25, page * 25 + 25);
      if (error) throw new Error(error.message);
      return data as {
        id: string;
        year: number;
        number: number;
        client_name: string;
        subject: string;
      }[];
    },
  });
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
    enabled: filter !== "propostas",
    refetchOnMount: "always",
    refetchInterval: 60000,
    queryFn: async () => {
      let q = table("contract_register").select("*");
      if (filter !== "todos") q = q.eq("status", filter);
      const { data, error } = await q
        .order(filter === "ativo" ? "ends_on" : "created_at", { ascending: filter === "ativo" })
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
          <TabsTrigger value="propostas">Propostas aprovadas</TabsTrigger>
          <TabsTrigger value="assinatura">Assinaturas</TabsTrigger>
          <TabsTrigger value="aguardando">Aguardando vigência</TabsTrigger>
          <TabsTrigger value="agendado">Início futuro</TabsTrigger>
          <TabsTrigger value="encerrado">Encerrados</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="space-y-3">
          <h2 className="font-semibold">
            {filter === "ativo"
              ? "Contratos ativos"
              : filter === "propostas"
                ? "Preparar contratos"
                : filter === "todos"
                  ? "Todos os contratos"
                  : statuses[filter as keyof typeof statuses]}
          </h2>
          {filter === "propostas" ? (
            approvals.isPending ? (
              "Carregando propostas aprovadas…"
            ) : approvals.isError ? (
              <p role="alert">{approvals.error.message}</p>
            ) : approvals.data.length ? (
              <div className="divide-y rounded-xl border bg-card">
                {approvals.data.slice(0, 25).map((p) => (
                  <article
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">{proposalCode(p)}</p>
                      <strong>{p.client_name}</strong>
                      <p className="text-sm">{p.subject}</p>
                    </div>
                    <ContractAction
                      id={p.id}
                      showIssued={(target) => {
                        openPdfPreview(target);
                        setPage(0);
                        setFilter("assinatura");
                      }}
                    />
                  </article>
                ))}
              </div>
            ) : (
              "Nenhuma proposta aprovada pendente de contrato."
            )
          ) : list.isPending ? (
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
                      setFilter("propostas");
                    }}
                  >
                    Ver propostas aprovadas
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
            {((filter === "propostas" ? approvals.data : list.data)?.length ?? 0) > 25 && (
              <Button variant="outline" onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {pdfPreviewDialog}
    </main>
  );
}
