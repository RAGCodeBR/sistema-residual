import logo from "@/assets/residual-logo-transparent.png?inline";
import { proposalCode, shortDate } from "@/lib/proposals";

export type Order = { id: string; year: number; number: number; client_name: string; subject: string; revision: number; issued: boolean };
export const emptySlip = { company: "", address: "", day: "", residue: "", equipment: "", service: "", cover: "", delivery: "", pickup: "", notes: "", clientSigner: "", driver: "", clientSignature: "", driverSignature: "" };
export type Slip = typeof emptySlip;
export const slipSections = [
  { title: "Dados do cliente", fields: [["company", "Empresa"], ["address", "Endereço / pátio"], ["day", "Data do pedido"]] },
  { title: "Serviço e equipamentos", fields: [["service", "Operação"], ["residue", "Tipo de resíduo"], ["equipment", "Equipamentos"], ["cover", "Tipo de caçamba"]] },
  { title: "Logística", fields: [["delivery", "Entrega"], ["pickup", "Retirada"], ["notes", "Observações"]] },
] as const;
export const slipValue = (s: Slip, k: keyof Slip) => ["day", "delivery", "pickup"].includes(k) ? shortDate(s[k]) : s[k];

export async function buildSlipPdf(order: Order, slip: Slip, kind?: "entrega" | "troca" | "retirada", replacement?: string, exchangeAmount?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const code = proposalCode(order);
  let y = 0;
  function header() {
    doc.addImage(logo, "PNG", 16, 5, 30, 30 * 409 / 515, "residual");
    doc.setTextColor(28, 74, 47);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(kind ? "Ficha de " + kind : "Romaneio de equipamentos", 194, 16, {align:"right"});
    doc.setFontSize(10);
    doc.text(code, 194, 24, {align:"right"});
    doc.setDrawColor(169,193,174);
    doc.line(16,33,194,33);
    y = 45;
  }
  function fit(height: number) {
    if (y + height > 274) { doc.addPage(); header(); }
  }
  function heading(title: string) {
    fit(25);
    doc.setTextColor(28, 74, 47);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, 16, y);
    doc.setDrawColor(169, 193, 174);
    doc.line(16, y + 2, 194, y + 2);
    y += 10;
  }
  function field(label: string, value: string) {
    fit(12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(value || "—", 119) as string[];
    doc.setTextColor(85);
    doc.text(label, 16, y);
    for (const line of lines) {
      fit(5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(32);
      doc.text(line, 72, y);
      y += 5;
    }
    y += 2;
  }
  header();
  for (const section of slipSections) {
    if (kind && section.title === "Logística" && !slip.notes) continue;
    heading(kind && section.title === "Logística" ? "Observações da operação" : section.title);
    for (const [k, label] of section.fields) {
      if (kind && ["service","cover","delivery","pickup"].includes(k)) continue;
      if (kind && k==="equipment" && replacement) { field("Equipamento retirado",slip.equipment); field("Equipamento entregue",replacement); if(exchangeAmount)field("Valor da troca",exchangeAmount);continue; }
      if (k === "notes" && !slip.notes) continue;
      field(kind && k==="day" ? "Data da "+kind : label, slipValue(slip, k));
    }
    y += 4;
  }
  heading("Assinaturas");
  field("Responsável do cliente", slip.clientSigner);
  field("Motorista", slip.driver);
  fit(31);
  for (const [index, signature] of [slip.clientSignature, slip.driverSignature].entries()) {
    const x = index === 0 ? 16 : 111;
    if (signature) doc.addImage(signature, "PNG", x, y, 80, 20);
    doc.setDrawColor(105);
    doc.line(x, y + 21, x + 80, y + 21);
    doc.setFontSize(9); doc.setTextColor(65);
    doc.text(index === 0 ? "Assinatura do cliente" : "Assinatura do motorista", x, y + 26);
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setTextColor(90); doc.setFontSize(8);
    doc.text("Residual Assessoria em Meio Ambiente", 16, 287);
    doc.text(`${page} / ${doc.getNumberOfPages()}`, 194, 287, { align: "right" });
  }
  return doc.output("blob");
}
