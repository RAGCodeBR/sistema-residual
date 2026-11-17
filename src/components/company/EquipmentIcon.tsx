import { Cog, Package, Truck, Wrench, type LucideProps } from "lucide-react";

/** Ícone conforme o tipo do equipamento. */
export function EquipmentIcon({ kind, ...props }: { kind: string } & LucideProps) {
  if (kind === "Veículo") return <Truck {...props} />;
  if (kind === "Máquina") return <Cog {...props} />;
  if (kind === "Ferramenta" || kind === "Equipamento") return <Wrench {...props} />;
  return <Package {...props} />;
}
