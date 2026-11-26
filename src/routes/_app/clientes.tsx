import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, ChevronRight, Plus, Search } from "lucide-react";
import { CnpjInput, formatCnpj } from "@/components/proposals/ProposalFields";
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
  const matches =
    list.data?.filter((c) =>
      [c.name, c.legal_name, c.cnpj, c.cnpj?.replace(/\D/g, "")]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      {form ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            disabled={save.isPending}
            onClick={() => setForm(null)}
          >
            <ArrowLeft />
            Voltar para clientes
          </Button>
          <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            <header className="flex items-center gap-3 border-b pb-4">
              <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <Building2 />
              </span>
              <h1 className="text-xl font-semibold">
                {id
                  ? list.data?.find((c) => c.id === id)?.legal_name || "Cadastro da empresa"
                  : "Novo cliente"}
              </h1>
            </header>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              {(
                [
                  [
                    "Dados da empresa",
                    [
                      "legal_name",
                      "trade_name",
                      "cnpj",
                      "state_registration",
                      "municipal_registration",
                    ],
                  ],
                  [
                    "Localização e contato",
                    ["address", "commercial_city", "responsible", "phone", "email"],
                  ],
                ] as const
              ).map(([title, keys]) => (
                <fieldset key={title} className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <legend className="mb-3 text-sm font-semibold text-primary">{title}</legend>
                  {keys.map((k) => (
                    <label key={k} className="grid gap-1 text-sm">
                      {companyLabels[k]}
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
                  ))}
                </fieldset>
              ))}
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
        </>
      ) : (
        <>
          <header className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Clientes</h1>
            <Button onClick={() => start()}>
              <Plus />
              Novo cliente
            </Button>
          </header>
          <div className="relative max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              className="pl-9"
              aria-label="Buscar cliente"
              placeholder="Buscar por empresa ou CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {list.isLoading ? (
            "Carregando clientes…"
          ) : list.isError ? (
            <p role="alert">{list.error.message}</p>
          ) : (
            <div className="divide-y rounded-xl border bg-card">
              {matches.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 sm:px-5"
                >
                  <button
                    className="group flex min-w-0 basis-full items-center gap-3 rounded-md py-2 text-left sm:flex-1"
                    onClick={() => start(c)}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary"
                      aria-hidden="true"
                    >
                      {(c.legal_name || c.name).trim().slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words text-sm group-hover:text-primary">
                        {c.legal_name || c.name}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {[c.cnpj && formatCnpj(c.cnpj), c.commercial_city]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </button>
                  <ClientRegistrationFile id={c.id} hasFile={c.has_registration_file} />
                </div>
              ))}
              {!matches.length && (
                <p className="p-4">
                  {search ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
