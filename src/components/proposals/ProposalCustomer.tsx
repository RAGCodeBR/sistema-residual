import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CommercialAddress } from "@/components/CommercialAddress";
import { addressesOf, commercialRpc, useCommercialClients } from "@/lib/commercial-clients";
import { isWaste, type ProposalFields, type WasteContent } from "@/lib/proposals";
export function ProposalCustomer({
  form,
  update,
}: {
  form: ProposalFields;
  update: (p: Partial<ProposalFields>) => void;
}) {
  const list = useCommercialClients(),
    qc = useQueryClient();
  const selected = list.data?.find((c) => c.id === form.client_id);
  const patchAddress = (address: string) => ({
    service_address: address,
    ...(isWaste(form.template)
      ? { content: { ...form.content, site: address } as WasteContent }
      : {}),
  });
  const save = useMutation({
    mutationFn: () =>
      commercialRpc<string>("save_commercial_customer", {
        details: {
          legal_name: form.client_name,
          cnpj: form.client_cnpj,
          address: form.service_address,
          commercial_city: form.client_city,
          email: form.client_email,
          phone: form.client_phone,
          responsible: form.client_contact,
        },
      }),
    onSuccess: async (id) => {
      update({ client_id: id });
      await qc.invalidateQueries({ queryKey: ["commercial-clients"] });
      toast.success("Cliente cadastrado e selecionado.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mb-4 grid gap-3">
      <label className="grid gap-1 text-sm">
        Cliente cadastrado
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={form.client_id ?? ""}
          onChange={(e) => {
            const c = list.data?.find((c) => c.id === e.target.value);
            if (c)
              update({
                client_id: c.id,
                client_name: c.legal_name || c.name,
                client_cnpj: c.cnpj,
                client_email: c.email,
                client_city: c.commercial_city,
                client_phone: c.phone,
                client_contact: c.responsible,
                ...patchAddress(c.address || ""),
              });
            else update({ client_id: null });
          }}
        >
          <option value="">Preencher manualmente</option>
          {list.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name || c.name} {c.cnpj}
            </option>
          ))}
        </select>
      </label>
      {list.isError && <p role="alert">{list.error.message}</p>}
      <label className="grid gap-1 text-sm">
        Endereço do serviço
        <Input
          value={form.service_address ?? ""}
          onChange={(e) => update(patchAddress(e.target.value))}
        />
      </label>
      <CommercialAddress
        customer={form.client_id}
        value={form.service_address ?? ""}
        addresses={addressesOf(selected)}
        onChange={(address) => update(patchAddress(address))}
      />
      {!form.client_id && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={!form.client_name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          Cadastrar cliente com os dados da proposta
        </Button>
      )}
    </div>
  );
}
