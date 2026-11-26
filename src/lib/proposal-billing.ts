import type { PriceItem, PriceGroup, WasteContent } from "./proposals";
export function minimumUnits(item: PriceItem) {
  const unit = item.unit.toLowerCase(),
    minimum = (item.minimum ?? "").trim().toLowerCase();
  const weight = unit === "kg" || unit === "tonelada";
  if (!minimum) return weight && unit === "kg" ? 1000 : 1;
  const match = minimum.match(
    /^(\d+(?:\.\d{3})*(?:,\d+)?)\s*(kg|quilos?|toneladas?|t|caçambas?|viagens|viagem|m³|unidades?|litros?|mês)?$/,
  );
  if (!match) return null;
  const amount = Number(match[1].replace(/\./g, "").replace(",", ".")),
    basis = match[2] || unit;
  if (weight && /^(kg|quilo|t)/.test(basis))
    return (amount * (basis.startsWith("t") ? 1000 : 1)) / (unit === "kg" ? 1 : 1000);
  return basis === unit || basis === unit + "s" ? amount : null;
}
export const isFreight = (i: PriceItem) =>
  i.freight ?? /\b(frete|transporte)\b/i.test(i.description);
export function freightLast(items: PriceItem[]) {
  return [...items.filter(item => !isFreight(item)), ...items.filter(isFreight)];
}
export function billingLines(group: PriceGroup) {
  const freight = group.items.filter(isFreight);
  return group.items
    .filter((i) => !freight.includes(i))
    .map((item) => {
      const units = minimumUnits(item),
        base = units !== null && item.price != null ? units * item.price : null;
      const f = freight[0],
        freightUnits = f ? minimumUnits(f) : null;
      const shipping = !freight.length
        ? 0
        : freight.length === 1 && f.price != null && freightUnits !== null
          ? f.price * freightUnits
          : null;
      return {
        item,
        units,
        base,
        shipping,
        total: base !== null && shipping !== null ? base + shipping : null,
      };
    });
}
export function executionDays(w: WasteContent) {
  if (!w.payment_terms?.trim()) return Number.isInteger(w.due_days) ? w.due_days : null;
  const terms = w.payment_terms.toLocaleLowerCase("pt-BR");
  const matches = [...terms.matchAll(/(\d+)\s+dias?\s+(?:corridos\s+)?após\s+(?:a\s+)?execução/g)];
  return matches.length === 1 && (terms.match(/\d+\s+dias?/g) || []).length === 1
    ? Number(matches[0][1])
    : null;
}
