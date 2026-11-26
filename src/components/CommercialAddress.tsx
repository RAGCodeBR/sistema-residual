import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { commercialRpc } from "@/lib/commercial-clients";
import { Button } from "@/components/ui/button";
export function CommercialAddress({
  customer,
  proposal,
  value,
  addresses,
  onChange,
}: {
  customer?: string | null;
  proposal?: string;
  value: string;
  addresses: string[];
  onChange: (v: string) => void;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      commercialRpc("add_commercial_address", {
        customer,
        location: value,
        proposal: proposal ?? null,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["commercial-clients"] }),
        qc.invalidateQueries({ queryKey: ["operational-addresses"] }),
      ]);
      toast.success("Endereço salvo no cadastro.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      {addresses.length > 0 && (
        <select
          aria-label="Endereços cadastrados"
          className="h-10 w-full rounded-md border bg-background px-3"
          value={addresses.includes(value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecionar endereço cadastrado</option>
          {addresses.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      )}
      {customer && value.trim() && !addresses.includes(value.trim()) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Salvar novo endereço no cadastro
        </Button>
      )}
    </div>
  );
}
