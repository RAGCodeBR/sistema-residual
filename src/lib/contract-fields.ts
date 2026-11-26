// Capture only the editable portion of each standard clause. Custom clauses
// that do not match the template remain available in the full-text editor.
const fields = [
  {
    label: "Escopo dos serviços",
    pattern:
      /(?:Os serviços contratados seguem a proposta|assessoria ambiental descrita na proposta) RESD [^:\n]+: ([\s\S]*?)\.(?=\n\n(?:A classificação dos resíduos|II - DO PRAZO))/d,
  },
  {
    label: "Preços, frete e faturamento mínimo",
    pattern: /por meio de aditivo contratual\.\n\n([\s\S]*?)\n\nPARÁGRAFO PRIMEIRO: Os preços/d,
  },
  { label: "Condições de pagamento", pattern: /CLÁUSULA SEXTA – ([\s\S]*?)\n\nCLÁUSULA SÉTIMA/d },
  {
    label: "Vigência em meses",
    pattern: /vigência pelo prazo de (\d{1,3}(?: \([^)]+\))? meses), contados a partir/d,
  },
  { label: "Cidade da assinatura", pattern: /\n\n([^\n]+), _+ de _+ de _+\.?\n\n____/d },
];

export function contractFields(text: string) {
  return fields.flatMap(({ label, pattern }) => {
    const match = pattern.exec(text);
    if (!match?.indices) return [];
    const [start, end] = match.indices[1];
    const months = label === "Vigência em meses";
    const initial = months ? String(parseInt(match[1], 10)) : match[1];
    return [{ label, start, end, initial, value: initial, months }];
  });
}

export function applyContractFields(text: string, fields: ReturnType<typeof contractFields>) {
  for (const field of [...fields].sort((a, b) => b.start - a.start)) {
    if (field.value === field.initial) continue;
    const value = field.months ? field.value + " meses" : field.value;
    text = text.slice(0, field.start) + value + text.slice(field.end);
  }
  return text;
}
