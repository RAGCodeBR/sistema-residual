import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { table } from "@/lib/company";
export const companyLabels = {
  legal_name: "Razão social",
  trade_name: "Nome fantasia",
  cnpj: "CNPJ",
  state_registration: "Inscrição estadual",
  municipal_registration: "Inscrição municipal",
  address: "Endereço da matriz (com CEP)",
  commercial_city: "Cidade / UF",
  responsible: "Contato",
  phone: "Telefone",
  email: "E-mail",
};
export type CompanyDetails = Partial<Record<keyof typeof companyLabels, string | null>>;
export type Customer = CompanyDetails & {
  id: string;
  name: string;
  addresses: string[];
  has_registration_file: boolean;
};
export const addressesOf = (customer?: Customer) => [
  ...new Set([customer?.address, ...(customer?.addresses ?? [])].filter((a): a is string => !!a)),
];
export async function commercialRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export function useCommercialClients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["commercial-clients", user?.id],
    queryFn: async () => {
      const result: Customer[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await table("commercial_clients")
          .select("*")
          .order("name")
          .order("id")
          .range(start, start + 499);
        if (error) throw new Error(error.message);
        result.push(...data);
        if (data.length < 500) return result;
      }
    },
  });
}
