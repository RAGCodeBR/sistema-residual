import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CnpjInput } from "@/components/proposals/ProposalFields";
import {
  ClientRegistrationFile,
  acceptedFiles,
  uploadRegistration,
  validateFile,
} from "@/components/ClientRegistrationFile";
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
    [pendingFile, setPendingFile] = useState<File | null>(null),
    [address, setAddress] = useState("");
  const start = (c?: Customer) => {
    setForm(c ? { ...c, legal_name: c.legal_name || c.name } : {});
    setId(c?.id ?? null);
    setAddress("");
    setPendingFile(null);
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
      if (pendingFile) {
        try {
          await uploadRegistration(saved, pendingFile);
        } catch {
          toast.error("Cliente salvo. Use Anexar ficha para tentar enviar o arquivo novamente.");
          await qc.invalidateQueries({ queryKey: ["commercial-clients"] });
          return;
        } finally {
          setPendingFile(null);
        }
      }
      await qc.invalidateQueries({ queryKey: ["commercial-clients"] });
      toast.success("Cadastro salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button disabled={save.isPending} onClick={() => start()}>
          Novo cliente
        </Button>
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
            <div className="sm:col-span-2 space-y-1">
              <p className="text-sm font-medium">Ficha cadastral</p>
              {id ? (
                <ClientRegistrationFile
                  key={id}
                  id={id}
                  hasFile={!!list.data?.find((c) => c.id === id)?.has_registration_file}
                  editing
                />
              ) : (
                <Input
                  key="new-file"
                  aria-label="Anexar ficha cadastral"
                  type="file"
                  accept={acceptedFiles}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    try {
                      if (f) validateFile(f);
                      setPendingFile(f ?? null);
                    } catch (err) {
                      e.target.value = "";
                      setPendingFile(null);
                      toast.error((err as Error).message);
                    }
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">PDF, JPG ou PNG · até 10 MB</p>
            </div>
            <div className="flex gap-2">
              <Button disabled={save.isPending}>Salvar cadastro</Button>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setForm(null)}
              >
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
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <button
                  className="min-w-40 flex-1 rounded py-2 text-left hover:bg-muted"
                  disabled={save.isPending}
                  onClick={() => start(c)}
                >
                  <strong>{c.legal_name || c.name}</strong>
                  <div className="text-sm text-muted-foreground">
                    {[c.cnpj, c.commercial_city].filter(Boolean).join(" · ")}
                  </div>
                </button>
                <ClientRegistrationFile id={c.id} hasFile={c.has_registration_file} />
              </div>
            ))}
          {!list.data?.length && <p className="p-4">Nenhum cliente cadastrado.</p>}
        </div>
      )}
    </main>
  );
}
