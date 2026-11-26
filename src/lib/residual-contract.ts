import { wasteScopeSections } from "./waste-proposal-scope";
import template from "./residual-contract-template.txt?raw";
import logo from "@/assets/residual-logo-transparent.png?inline";
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
  const pdf = new jsPDF();
  let y = 0;
  function header() {
    pdf.addImage(logo, "PNG", 17, 6, 23, 18, "residual");
    pdf.setTextColor(26, 77, 44);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Contrato nº " + number, 193, 18, { align: "right" });
    pdf.setDrawColor(160, 188, 167);
    pdf.line(17, 28, 193, 28);
    y = 38;
  }
  header();
  for (const paragraph of body.split(/\n\s*\n/)) {
    const heading = /^[IVX]+\s*[-–]/.test(paragraph);
    if (y + (paragraph.startsWith("Praia Grande, ______") ? 96 : heading ? 17 : 8) > 275) {
      pdf.addPage();
      header();
    }
    if (paragraph.startsWith("____") || /^[12]\. ___/.test(paragraph)) y += 5;
    pdf.setFont("helvetica", heading ? "bold" : "normal");
    pdf.setFontSize(heading ? 12 : 10.5);
    const lines = pdf.splitTextToSize(paragraph, 176) as string[];
    for (const line of lines) {
      if (y > 275) {
        pdf.addPage();
        header();
        pdf.setFont("helvetica", heading ? "bold" : "normal");
        pdf.setFontSize(heading ? 12 : 10.5);
      }
      pdf.setTextColor(34);
      pdf.text(line, 17, y);
      y += 5;
    }
    y += 3;
  }
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf.text("Residual Assessoria em Meio Ambiente", 17, 287);
    pdf.text(i + " / " + pdf.getNumberOfPages(), 193, 287, { align: "right" });
  }
  return pdf.output("blob");
}
