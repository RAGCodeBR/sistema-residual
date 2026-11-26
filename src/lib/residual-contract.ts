import { wasteScopeSections } from "./waste-proposal-scope";
import template from "./residual-contract-template.txt?raw";
import {
  BRAND_GREEN,
  LETTERHEAD,
  brandFlags,
  drawBrandLine,
  finishLetterheadPages,
  splitBrandAware,
} from "./letterhead";
import { freightLast } from "./proposal-billing";
import {
  isWaste,
  money,
  paymentTerms,
  proposalCode,
  type Proposal,
  type WasteContent,
  type ConsultingContent,
} from "./proposals";
export function contractDraft(p: Proposal, address: string) {
  const waste = isWaste(p.template) ? (p.content as WasteContent) : null;
  const consulting = !waste ? (p.content as ConsultingContent) : null;
  const prices = waste
    ? waste.groups
        .map((g) =>
          [
            g.title,
            ...freightLast(g.items).map((i) =>
              [
                i.description,
                i.price == null ? "A combinar" : money(i.price) + " / " + i.unit,
                i.minimum && "Faturamento mínimo: " + i.minimum,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ].join("\n"),
        )
        .join("\n\n")
    : "Mensalidade: " + money(consulting!.monthly_price);
  const terms = waste
    ? paymentTerms(waste)
    : "Faturamento mensal, com vencimento em " +
      consulting!.due_days +
      " dias após emissão da nota fiscal.";
  const vars: Record<string, string> = {
    CLIENTE: p.client_name,
    ENDERECO: address || "[preencher sede da contratante]",
    CNPJ: p.client_cnpj || "[preencher CNPJ]",
    PROPOSTA: proposalCode(p),
    ESCOPO: waste
      ? [
          p.subject,
          waste.waste_summary,
          (p.service_address || waste.site) &&
            "Local de atendimento: " + (p.service_address || waste.site),
          ...wasteScopeSections.map((section) => section.title + "\n" + section.lines.join("\n")),
          waste.equipment && "Equipamentos: " + waste.equipment,
          waste.operational_resources,
          waste.rental_days && "Período de locação: " + waste.rental_days + " dias.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          ...consulting!.scope
            .filter((s) => s.enabled && s.title.trim())
            .map((s) => [s.title, s.text].filter(Boolean).join("\n")),
          consulting!.deliverables?.some((d) => d.trim()) &&
            "Entregáveis\n" + consulting!.deliverables.filter((d) => d.trim()).join("\n"),
        ]
          .filter(Boolean)
          .join("\n\n"),
    PREÇOS: prices,
    PAGAMENTO: terms,
  };
  let body = template;
  if (consulting)
    body = body
      .replace(
        /CLÁUSULA PRIMEIRA .*?II - DO PRAZO/s,
        "CLÁUSULA PRIMEIRA – O objeto deste contrato é a assessoria ambiental descrita na proposta {{PROPOSTA}}: {{ESCOPO}}.\n\nII - DO PRAZO",
      )
      .replace("12 (doze) meses,", consulting.term_months + " meses,")
      .replace(
        "índice IGP-M (Índice Geral de Preços – Mercado), divulgado pela Fundação Getulio Vargas",
        "índice " + consulting.adjustment_index,
      );
  if (waste?.idle_fee != null)
    vars.PREÇOS += "\n\nMês sem movimentação: " + money(waste.idle_fee) + " por caçamba.";
  return (
    body.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key]) +
    "\n\nPraia Grande, ______ de __________________ de ______.\n\n____________________________________\nRESIDUAL COMÉRCIO E ASSESSORIA AMBIENTAL LTDA · CONTRATADA\n\n____________________________________\n" +
    p.client_name +
    " · CONTRATANTE\n\nTestemunhas:\n\n1. ____________________________  Nome / CPF: ______________________\n\n2. ____________________________  Nome / CPF: ______________________"
  );
}
export async function contractPdf(number: string, body: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ compress: true });
  const left = 21,
    right = 189,
    width = right - left,
    bottom = LETTERHEAD.contentBottom;
  const green = "#204C38",
    ink = "#222E29",
    muted = "#56655C",
    rule = "#C4D3CA";
  let y = 0;
  function style(
    font: "times" | "helvetica",
    weight: "normal" | "bold",
    size: number,
    color = ink,
  ) {
    pdf.setFont(font, weight);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  }
  // O timbrado (cabeçalho e rodapé) entra no fim, em todas as páginas.
  function header() {
    y = LETTERHEAD.contentTop + 4;
  }
  function ensure(height: number) {
    if (y + height > bottom) {
      pdf.addPage();
      header();
    }
  }
  function paragraph(value: string, kind: "body" | "label" | "title" = "body") {
    const format = () =>
      kind === "title"
        ? style("times", "bold", 19, green)
        : kind === "label"
          ? style("helvetica", "bold", 10, green)
          : style("times", "normal", 11.5);
    format();
    const lines =
      kind === "body"
        ? splitBrandAware(pdf, value, width)
        : (pdf.splitTextToSize(value, width) as string[]);
    const flags = kind === "body" ? brandFlags(lines) : [];
    const step = kind === "title" ? 8 : 5.15;
    ensure(step * Math.min(lines.length, 2) + (kind === "body" ? 0 : 10));
    format();
    for (let i = 0; i < lines.length; i++) {
      ensure(i === lines.length - 2 ? step * 2 : step);
      format();
      drawBrandLine(pdf, lines[i], left, y, { flags: flags[i], width });
      y += step;
    }
    y += kind === "label" ? 0.5 : 2;
  }
  function section(title: string) {
    ensure(24);
    y += 2;
    pdf.setFillColor("#EEF4EF");
    pdf.rect(left, y - 4.7, width, 9, "F");
    pdf.setFillColor(green);
    pdf.rect(left, y - 4.7, 1, 9, "F");
    style("helvetica", "bold", 11, green);
    pdf.text(title, left + 4, y + 1, { maxWidth: width - 8 });
    y += 12;
  }
  function signatures(date: string, names: string[]) {
    const gap = 12,
      col = (width - gap) / 2;
    // O nome da Residual (contratada) sai em negrito verde, como no texto.
    const nameStyle = (i: number) =>
      i === 0 ? style("times", "bold", 11, BRAND_GREEN) : style("times", "normal", 11);
    const labels = names.map((name, i) => {
      nameStyle(i);
      return pdf.splitTextToSize(name, col) as string[];
    });
    style("times", "normal", 11);
    const namesHeight = Math.max(...labels.map((lines) => lines.length)) * 4.8;
    const dateLine = date.replace(/, _+ de _+ de _+\.?$/, ", ____ / ____ / ______");
    const dateLines = pdf.splitTextToSize(dateLine, width) as string[];
    ensure(125 + namesHeight + dateLines.length * 5);
    paragraph("Local e data", "label");
    paragraph(dateLine);
    y += 4;

    section("Assinaturas das partes");
    const roles = ["Contratada · Residual", "Contratante · Cliente"];
    for (let i = 0; i < roles.length; i++) {
      const x = left + i * (col + gap);
      style("helvetica", "bold", 10, green);
      pdf.text(roles[i], x, y);
      nameStyle(i);
      pdf.text(labels[i], x, y + 6, { lineHeightFactor: 1.24 });
      const lineY = y + namesHeight + 21;
      pdf.setDrawColor(muted);
      pdf.line(x, lineY, x + col, lineY);
      style("helvetica", "normal", 8, muted);
      pdf.text("Assinatura do representante", x, lineY + 5);
    }
    y += 36 + namesHeight;
    section("Testemunhas");
    for (let i = 0; i < 2; i++) {
      const x = left + i * (col + gap);
      style("helvetica", "bold", 9, green);
      pdf.text("Testemunha " + (i + 1), x, y);
      pdf.setDrawColor(muted);
      pdf.line(x, y + 18, x + col, y + 18);
      style("helvetica", "normal", 8, muted);
      pdf.text("Assinatura", x, y + 22);
      for (const [label, offset] of [
        ["Nome", 32],
        ["CPF", 42],
      ] as const) {
        pdf.text(label, x, y + offset);
        pdf.line(x + 11, y + offset, x + col, y + offset);
      }
    }
    y += 52;
  }
  header();
  const parts = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    const partyA = parts[i + 1]?.match(/^_{4,}\n([^\n]+) · CONTRATADA$/);
    const partyB = parts[i + 2]?.match(/^_{4,}\n([^\n]+) · CONTRATANTE$/);
    if (
      text.length < 150 &&
      !text.includes("\n") &&
      partyA &&
      partyB &&
      parts[i + 3] === "Testemunhas:" &&
      /^1\. _+\s+Nome \/ CPF: _+$/.test(parts[i + 4] ?? "") &&
      /^2\. _+\s+Nome \/ CPF: _+$/.test(parts[i + 5]?.split("\n", 1)[0] ?? "")
    ) {
      signatures(text, [partyA[1], partyB[1]]);
      const afterWitnesses = parts[i + 5].split("\n").slice(1).join("\n").trim();
      if (afterWitnesses) paragraph(afterWitnesses);
      i += 5;
      continue;
    }
    if (i === 0 && /^CONTRATO\b/.test(text)) {
      paragraph(text, "title");
      continue;
    }
    if (/^[IVX]+\s*[-–]/.test(text) && text.length < 85 && !text.includes("\n")) {
      section(text);
      continue;
    }
    const clause = text.match(/^(CLÁUSULA [A-ZÀ-Ü ]+?)\s*[-–]\s*([\s\S]+)$/);
    if (clause) {
      paragraph(clause[1], "label");
      paragraph(clause[2]);
      continue;
    }
    const [first, ...rest] = text.split("\n");
    if (rest.length && first.length < 65 && !first.includes("_")) {
      paragraph(first, "label");
      paragraph(rest.join("\n"));
      continue;
    }
    paragraph(text);
  }
  finishLetterheadPages(pdf, "Contrato nº " + number, { left, right, color: muted });
  return pdf.output("blob");
}
