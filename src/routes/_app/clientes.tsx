import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CnpjInput } from "@/components/proposals/ProposalFields";
import { CommercialAddress } from "@/components/CommercialAddress";
import {
  addressesOf,
  commercialRpc,
  companyLabels,
  useCommercialClients,
  type Customer,
  type CompanyDetails,
} from "@/lib/commercial-clients";
export const Route = createFileRoute("/_app/clientes")({ component: Clients });
function Clients() {
  const list = useCommercialClients(),
    qc = useQueryClient(),
    [search, setSearch] = useState(""),
    [id, setId] = useState<string | null>(null),
    [form, setForm] = useState<CompanyDetails | null>(null),
    [address, setAddress] = useState("");
  const start = (c?: Customer) => {
    setForm(c ? { ...c, legal_name: c.legal_name || c.name } : {});
    setId(c?.id ?? null);
    setAddress("");
  };
  const save = useMutation({
    mutationFn: () =>
      commercialRpc<string>("save_commercial_customer", {
        target: id,
        details: Object.fromEntries(
          Object.keys(companyLabels).map((k) => [k, form?.[k as keyof CompanyDetails] ?? ""]),
        ),
      }),
    onSuccess: async (saved) => {
      setId(saved);
      await qc.invalidateQueries({ queryKey: ["commercial-clients"] });
      toast.success("Cadastro salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={() => start()}>Novo cliente</Button>
      </header>
      {form && (
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{id ? "Cadastro da empresa" : "Nova empresa"}</h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {(Object.entries(companyLabels) as [keyof CompanyDetails, string][]).map(
              ([k, label]) => (
                <label key={k} className="grid gap-1 text-sm">
                  {label}
                  {k === "cnpj" ? (
                    <CnpjInput
                      value={form[k] || ""}
                      onChange={(v) => setForm({ ...form, [k]: v })}
                    />
                  ) : (
                    <Input
                      type={k === "email" ? "email" : "text"}
                      required={k === "legal_name"}
                      value={form[k] || ""}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  )}
                </label>
              ),
            )}
            <div className="flex gap-2">
              <Button disabled={save.isPending}>Salvar cadastro</Button>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Fechar
              </Button>
            </div>
          </form>
          {id && (
            <div className="space-y-2">
              <label className="grid gap-1 text-sm">
                Endereços de atendimento
                <Input
                  value={address}
                  placeholder="Endereço completo da unidade ou pátio"
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <CommercialAddress
                customer={id}
                value={address}
                addresses={addressesOf(list.data?.find((c) => c.id === id))}
                onChange={setAddress}
              />
            </div>
          )}
        </section>
      )}
      <Input
        aria-label="Buscar cliente"
        placeholder="Buscar por empresa ou CNPJ"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.isLoading ? (
        "Carregando clientes…"
      ) : list.isError ? (
        <p role="alert">{list.error.message}</p>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {list.data
            ?.filter((c) =>
              [c.name, c.legal_name, c.cnpj, c.cnpj?.replace(/\D/g, "")]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((c) => (
              <button
                key={c.id}
                className="block w-full p-4 text-left hover:bg-muted"
                onClick={() => start(c)}
              >
                <strong>{c.legal_name || c.name}</strong>
                <div className="text-sm text-muted-foreground">
                  {[c.cnpj, c.commercial_city].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          {!list.data?.length && <p className="p-4">Nenhum cliente cadastrado.</p>}
        </div>
      )}
    </main>
  );
}
