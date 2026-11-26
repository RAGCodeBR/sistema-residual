import { freightLast } from "@/lib/proposal-billing";
/**
 * PDF das propostas comerciais (A4). Desenhado direto com jsPDF para sair um
 * arquivo leve, com texto selecionável, pronto para enviar pelo WhatsApp.
 *
 * Melhorias em relação ao modelo em Word:
 *  - validade com data calculada ("válida até …");
 *  - preços em tabela (item · valor · unidade · faturamento mínimo);
 *  - numeração de seções contínua e textos revisados;
 *  - campos vazios do cliente (ex.: CNPJ) não aparecem em branco;
 *  - bloco de aceite para o cliente assinar e devolver;
 *  - cabeçalho, rodapé e "Página x de y" em todas as páginas.
 */
import residualLogo from "@/assets/residual-logo-transparent.png";
import {
  RESIDUAL,
  longDate,
  money,
  moneyInWords,
  proposalCode,
  paymentTerms,
  idleFeeClause,
  wasteServiceDescription,
  defaultOperationalResources,
  validUntil,
  type ConsultingContent,
  type ProposalFields,
  type WasteContent,
} from "@/lib/proposals";

type RGB = [number, number, number];
const GREEN: RGB = [46, 125, 50];
const GREEN_DARK: RGB = [27, 94, 32];
const GREEN_SOFT: RGB = [237, 246, 236];
const GREEN_LINE: RGB = [200, 225, 196];
const INK: RGB = [33, 37, 41];
const MUTED: RGB = [110, 117, 125];

const PAGE_W = 210;
const PAGE_H = 297;
const M_LEFT = 20;
const M_RIGHT = 24; // deixa espaço para a faixa verde lateral
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;
const TOP_FIRST = 58;
const TOP_NEXT = 34;
const BOTTOM = PAGE_H - 22;

let logoCache: Promise<string | null> | null = null;
function loadLogo(): Promise<string | null> {
  logoCache ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = residualLogo;
  });
  return logoCache;
}

export async function buildProposalPdf(p: ProposalFields): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  const code = proposalCode(p);
  let y = TOP_FIRST;
  let section = 0;

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold" | "italic", size: number, c: RGB = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    color(c);
  };
  const lineH = (size: number) => size * 0.3528 * 1.45;

  const newPage = () => {
    doc.addPage();
    y = TOP_NEXT;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  // O jsPDF trata uma linha isolada como a última do parágrafo. Distribuímos
  // os espaços somente nas linhas internas, mesmo quando há quebra de página.
  const drawLine = (line: string, x: number, width: number, justify: boolean) => {
    const words = line.trim().split(/\s+/);
    if (!justify || words.length < 3) {
      doc.text(line, x, y);
      return;
    }
    const widths = words.map(word => doc.getTextWidth(word));
    const space = (width - widths.reduce((sum, w) => sum + w, 0)) / (words.length - 1);
    words.forEach((word, i) => {
      doc.text(word, x, y);
      x += widths[i] + space;
    });
  };

  /** Parágrafo justificado, com quebra de página linha a linha. */
  const paragraph = (text: string, opts: { size?: number; style?: "normal" | "bold" | "italic"; c?: RGB; indent?: number; gap?: number; justify?: boolean } = {}) => {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const w = CONTENT_W - indent;
    font(opts.style ?? "normal", size, opts.c ?? INK);
    const lh = lineH(size);
    for (const raw of text.split("\n")) {
      const lines: string[] = doc.splitTextToSize(raw, w);
      lines.forEach((line, i) => {
        ensure(lh);
        const last = i === lines.length - 1;
        drawLine(line, M_LEFT + indent, w, opts.justify !== false && !last);
        y += lh;
      });
    }
    y += opts.gap ?? 2.5;
  };

  const heading = (title: string) => {
    ensure(16);
    y += 3;
    section += 1;
    font("bold", 11, GREEN);
    doc.text(`${section}.`, M_LEFT, y);
    color(INK);
    doc.text(title.toUpperCase(), M_LEFT + 7, y);
    y += 2.2;
    stroke(GREEN_LINE);
    doc.setLineWidth(0.3);
    doc.line(M_LEFT, y, M_LEFT + CONTENT_W, y);
    y += 5.5;
    return section;
  };

  const subheading = (title: string) => {
    ensure(12);
    font("bold", 10, GREEN_DARK);
    doc.text(title, M_LEFT, y);
    y += lineH(10) + 0.5;
  };

  const bullets = (items: string[], size = 10) => {
    const textIndent = 7;
    const width = CONTENT_W - textIndent;
    for (const text of items) {
      font("normal", size);
      const lines: string[] = doc.splitTextToSize(text, width);
      ensure(lineH(size) * Math.min(lines.length, 2));
      fill(GREEN);
      doc.circle(M_LEFT + 4, y - 1.2, 0.8, "F");
      lines.forEach((line, i) => {
        ensure(lineH(size));
        drawLine(line, M_LEFT + textIndent, width, i < lines.length - 1);
        y += lineH(size);
      });
      y += 0.8;
    }
    y += 1.8;
  };

  /** Tabela simples com cabeçalho verde e linhas zebradas. */
  const tableBlock = (cols: { label: string; w: number; align?: "left" | "right" }[], rows: string[][], opts: { title?: string } = {}) => {
    const pad = 2.4;
    const size = 9.2;
    const lh = lineH(size);
    const header = () => {
      fill(GREEN);
      doc.rect(M_LEFT, y, CONTENT_W, 7.5, "F");
      font("bold", 8.2, [255, 255, 255]);
      let x = M_LEFT;
      for (const c of cols) {
        const tx = c.align === "right" ? x + c.w - pad : x + pad;
        doc.text(c.label.toUpperCase(), tx, y + 4.9, { align: c.align === "right" ? "right" : "left" });
        x += c.w;
      }
      y += 7.5;
    };
    // Tabelas que cabem numa página não são quebradas no meio.
    font("normal", size);
    const estimate =
      (opts.title ? 7.5 : 0) +
      7.5 +
      rows.reduce((sum, row) => sum + Math.max(...row.map((text, i) => (doc.splitTextToSize(text || "—", cols[i].w - pad * 2) as string[]).length)) * lh + pad * 1.6, 0);
    if (estimate <= BOTTOM - TOP_NEXT) ensure(estimate);
    if (opts.title) {
      ensure(7.5 + 7.5 + 9);
      fill(GREEN_SOFT);
      doc.rect(M_LEFT, y, CONTENT_W, 7.5, "F");
      font("bold", 9.5, GREEN_DARK);
      doc.text(opts.title, M_LEFT + pad, y + 5);
      y += 7.5;
    } else ensure(7.5 + 9);
    header();
    rows.forEach((row, r) => {
      font("normal", size);
      const cells = row.map((text, i) => doc.splitTextToSize(text || "—", cols[i].w - pad * 2) as string[]);
      const h = Math.max(...cells.map((c) => c.length)) * lh + pad * 1.6;
      if (y + h > BOTTOM) {
        newPage();
        header();
      }
      if (r % 2 === 1) {
        fill([248, 250, 247]);
        doc.rect(M_LEFT, y, CONTENT_W, h, "F");
      }
      let x = M_LEFT;
      cells.forEach((lines, i) => {
        const c = cols[i];
        font(i === 1 ? "bold" : "normal", size, i === 0 || i === 1 ? INK : MUTED);
        lines.forEach((line, li) => {
          const ty = y + pad + lh * li + size * 0.3528 * 0.85;
          doc.text(line, c.align === "right" ? x + c.w - pad : x + pad, ty, { align: c.align === "right" ? "right" : "left" });
        });
        x += c.w;
      });
      y += h;
      stroke([228, 233, 226]);
      doc.setLineWidth(0.2);
      doc.line(M_LEFT, y, M_LEFT + CONTENT_W, y);
    });
    y += 5;
  };

  const keyValueBox = (rows: [string, string][]) => {
    const shown = rows.filter(([, v]) => v && v.trim());
    const labelW = 30;
    const size = 9.6;
    const lh = lineH(size) + 0.6;
    const lines = shown.map(([, v]) => doc.splitTextToSize(v, CONTENT_W - labelW - 8) as string[]);
    const h = lines.reduce((s, l) => s + l.length * lh, 0) + 7;
    ensure(h);
    fill(GREEN_SOFT);
    doc.roundedRect(M_LEFT, y, CONTENT_W, h, 2, 2, "F");
    fill(GREEN);
    doc.rect(M_LEFT, y, 1.4, h, "F");
    let ty = y + 5.6;
    shown.forEach(([label], i) => {
      font("normal", 8.4, MUTED);
      doc.text(label.toUpperCase(), M_LEFT + 5, ty);
      font(i === 0 ? "bold" : "normal", size, INK);
      lines[i].forEach((line, li) => doc.text(line, M_LEFT + 5 + labelW, ty + li * lh));
      ty += lines[i].length * lh;
    });
    y += h + 6;
  };

  /* Cabeçalho da 1ª página ------------------------------------------------- */
  if (logo) doc.addImage(logo, "PNG", M_LEFT, 11, 40, 40 * (409 / 515));
  font("bold", 8, MUTED);
  doc.text(p.template === "assessoria" ? "PROPOSTA TÉCNICA E COMERCIAL" : "PROPOSTA COMERCIAL", PAGE_W - M_RIGHT, 20, { align: "right" });
  font("bold", 20, GREEN_DARK);
  doc.text(code, PAGE_W - M_RIGHT, 29, { align: "right" });
  font("normal", 9.5, INK);
  doc.text([p.issue_city.trim(), longDate(p.issued_on)].filter(Boolean).join(", "), PAGE_W - M_RIGHT, 36, { align: "right" });
  font("normal", 8.6, MUTED);
  doc.text(`Válida até ${longDate(validUntil(p))} (${p.validity_days} dias)`, PAGE_W - M_RIGHT, 41.5, { align: "right" });
  stroke(GREEN);
  doc.setLineWidth(0.8);
  doc.line(M_LEFT, 48, PAGE_W - M_RIGHT, 48);

  /* Cliente e assunto ------------------------------------------------------ */
  if (p.template === "assessoria") heading("Identificação da contratante");
  keyValueBox([
    ["Cliente", p.client_name],
    ["CNPJ", p.client_cnpj ?? ""],
    ["Cidade", p.client_city ?? ""],
    ["Contato", p.client_contact ?? ""],
    ["Telefone", p.client_phone ?? ""],
    ["E-mail", p.client_email ?? ""],
  ]);
  font("normal", 8.4, MUTED);
  doc.text("ASSUNTO", M_LEFT, y);
  y += lineH(11);
  paragraph(p.subject || "Proposta", { size: 12, style: "bold", c: GREEN_DARK, gap: 4 });
  paragraph("Prezados,", { gap: 1.5 });

  if (p.template === "assessoria") renderConsulting(p.content as ConsultingContent);
  else renderWaste(p.content as WasteContent);
  if (p.template !== "assessoria" && p.content.extra_notes?.trim()) {
    heading("Observações");
    paragraph(p.content.extra_notes.trim());
  }

  /* Aceite e assinaturas --------------------------------------------------- */
  ensure(10 + 26 + 36); // agradecimento, assinaturas e aceite ficam juntos
  paragraph("Agradecemos a oportunidade e nos colocamos à disposição para esclarecer eventuais dúvidas.", { gap: 4 });
  font("normal", 10);
  doc.text("Atenciosamente,", M_LEFT, y);
  y += 14;
  const colW = (CONTENT_W - 10) / 2;
  RESIDUAL.signers.forEach((s, i) => {
    const x = M_LEFT + i * (colW + 10);
    stroke([150, 160, 150]);
    doc.setLineWidth(0.25);
    doc.line(x, y, x + colW - 10, y);
    font("bold", 9.5);
    doc.text(s.name, x, y + 4.6);
    font("normal", 8.6, MUTED);
    doc.text(s.role, x, y + 8.6);
  });
  y += 14;

  // Aceite do cliente — devolver assinado formaliza a aprovação.
  stroke(GREEN_LINE);
  doc.setLineWidth(0.4);
  doc.roundedRect(M_LEFT, y, CONTENT_W, 34, 2, 2, "S");
  font("bold", 9.5, GREEN_DARK);
  doc.text("ACEITE DO CLIENTE", M_LEFT + 5, y + 6.5);
  font("normal", 8.6, MUTED);
  doc.text(`Declaramos estar de acordo com as condições da proposta ${code}.`, M_LEFT + 5, y + 11.5);
  const fields = [["Nome", "Cargo"], ["Data", "Assinatura"]];
  fields.forEach((pair, row) => {
    pair.forEach((label, col) => {
      const fx = M_LEFT + 5 + col * ((CONTENT_W - 10) / 2 + 2);
      const fy = y + 20 + row * 9;
      stroke([170, 178, 170]);
      doc.setLineWidth(0.2);
      doc.line(fx + 17, fy, fx + (CONTENT_W - 10) / 2 - 4, fy);
      font("normal", 8.6, MUTED);
      doc.text(`${label}:`, fx, fy);
    });
  });
  y += 36;

  /* Cabeçalho das páginas seguintes, faixa lateral e rodapé ---------------- */
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    fill(GREEN);
    doc.rect(PAGE_W - 7, 0, 7, PAGE_H, "F");
    fill([129, 199, 132]);
    doc.rect(PAGE_W - 9, 0, 2, PAGE_H, "F");
    if (page > 1) {
      if (logo) doc.addImage(logo, "PNG", M_LEFT, 7, 22, 22 * (409 / 515));
      font("bold", 11, GREEN_DARK);
      doc.text(code, PAGE_W - M_RIGHT, 17, { align: "right" });
      font("normal", 8, MUTED);
      doc.text(p.client_name, PAGE_W - M_RIGHT, 22, { align: "right" });
      stroke(GREEN_LINE);
      doc.setLineWidth(0.4);
      doc.line(M_LEFT, 27, PAGE_W - M_RIGHT, 27);
    }
    stroke(GREEN_LINE);
    doc.setLineWidth(0.3);
    doc.line(M_LEFT, PAGE_H - 15, PAGE_W - M_RIGHT, PAGE_H - 15);
    font("bold", 7.4, GREEN_DARK);
    doc.text(`${RESIDUAL.legalName.toUpperCase()}  ·  CNPJ ${RESIDUAL.cnpj}`, M_LEFT, PAGE_H - 10.5);
    font("normal", 7, MUTED);
    doc.text(RESIDUAL.address, M_LEFT, PAGE_H - 7.2);
    doc.text([RESIDUAL.phone, RESIDUAL.email, RESIDUAL.site].filter(Boolean).join("  ·  "), M_LEFT, PAGE_H - 4.2);
    doc.text(`Página ${page} de ${total}`, PAGE_W - M_RIGHT, PAGE_H - 10.5, { align: "right" });
  }

  return doc.output("blob");

  /* Modelos ---------------------------------------------------------------- */

  function renderWaste(c: WasteContent) {
    paragraph(
      `Atendendo à sua solicitação, temos a satisfação de submeter à sua apreciação nossa proposta para execução dos serviços de ${wasteServiceDescription(c, p.template)}`,
    );

    renderWasteScope(c);

    heading("Condições comerciais");
    font("normal", 8.6, MUTED);
    paragraph("Custo de locação, destinação e frete por coleta.", { size: 9, c: MUTED, gap: 3 });
    const cols = [
      { label: "Item", w: CONTENT_W * 0.42 },
      { label: "Valor", w: CONTENT_W * 0.2, align: "right" as const },
      { label: "Unidade", w: CONTENT_W * 0.14 },
      { label: "Faturamento mínimo", w: CONTENT_W * 0.24 },
    ];
    for (const g of c.groups) {
      const items = freightLast(g.items).filter(i => i.description.trim() || i.minimum.trim() || i.price != null);
      if (!items.length) continue;
      tableBlock(
        cols,
        items.map((i) => [i.description, i.price == null ? "A combinar" : money(i.price), i.price == null ? "" : `por ${i.unit}`, i.minimum]),
        { title: g.title },
      );
    }
    const notes: string[] = [];
    const feeClause = idleFeeClause(c.idle_fee);
    if (c.rental_days) notes.push(`O período de locação da caçamba é de ${c.rental_days} dias.`);
    if (feeClause) notes.push(feeClause);
    if (c.separate_wastes) notes.push("Os resíduos não podem ser misturados: deve haver uma caçamba para cada tipo de resíduo.");
    if (notes.length) bullets(notes);

    const payment = paymentTerms(c).trim();
    if (payment) {
      heading("Condições de pagamento");
      paragraph(payment);
    }

    heading("Validade");
    paragraph(`Esta proposta é válida por ${p.validity_days} dias, até ${longDate(validUntil(p))}.`);
  }

  function renderWasteScope(c: WasteContent) {
    const n = heading("Escopo dos serviços");
    paragraph("A RESIDUAL – Assessoria em Meio Ambiente será responsável pela execução dos serviços de coleta, transporte e encaminhamento para destinação final ambientalmente adequada dos resíduos identificados acima, conforme as condições estabelecidas nesta proposta.");
    subheading(`${n}.1  Coleta e remoção dos resíduos`);
    bullets([
      "Disponibilização dos equipamentos descritos nesta proposta para as operações de coleta e transporte.",
      "Mobilização de veículo e equipe operacional devidamente identificada e capacitada para execução dos serviços.",
      "Realização das coletas mediante programação previamente acordada entre as partes, com solicitação mínima de 24 horas de antecedência.",
      "Remoção dos resíduos disponibilizados pelo contratante, desde que em condições adequadas para carregamento e transporte.",
    ]);
    subheading(`${n}.2  Transporte`);
    bullets([
      "Transporte dos resíduos coletados até unidade receptora devidamente licenciada e apta a receber o material, observadas as exigências ambientais aplicáveis.",
      "Cumprimento dos procedimentos e requisitos documentais necessários à movimentação e ao transporte dos resíduos.",
    ]);
    subheading(`${n}.3  Destinação final`);
    bullets([
      "Encaminhamento dos resíduos para destinação final ambientalmente adequada, em instalação devidamente licenciada pelos órgãos ambientais competentes.",
      "Fornecimento do respectivo Certificado de Destinação Final (CDF), após a confirmação do recebimento e da destinação dos resíduos pela unidade receptora.",
      "Disponibilização dos comprovantes e documentos pertinentes à comprovação da destinação, conforme aplicabilidade.",
    ]);
    subheading(`${n}.4  Assessoria e documentação ambiental`);
    paragraph("A RESIDUAL prestará suporte quanto aos procedimentos documentais relacionados à movimentação e à destinação dos resíduos, incluindo orientações para emissão e regularização dos documentos ambientais pertinentes, conforme legislação vigente.");

    heading("Equipamentos e recursos operacionais");
    if (c.equipment.trim()) paragraph(c.equipment.trim());
    const resources = (c.operational_resources ?? defaultOperationalResources).trim();
    if (resources) paragraph(resources);

    heading("Responsabilidades do contratante");
    bullets([
      "Disponibilizar os resíduos devidamente segregados e em condições adequadas para coleta e transporte.",
      "Garantir que o material corresponda à classificação e às características informadas nesta proposta.",
      "Emitir previamente o Manifesto de Transporte de Resíduos (MTR-e), por meio do SIGOR – Módulo MTR, da CETESB, quando aplicável.",
      "Garantir condições adequadas de acesso, circulação e operação dos veículos nas dependências da unidade.",
      "Comunicar previamente qualquer alteração nas características, quantidade ou condições de armazenamento dos resíduos.",
    ]);

    heading("Condições para execução dos serviços");
    paragraph("As coletas serão realizadas mediante agendamento prévio, respeitando a antecedência mínima de 24 horas e a disponibilidade operacional.");
    paragraph("No momento da coleta, os resíduos deverão estar acompanhados da documentação ambiental obrigatória, especialmente o MTR-e, emitido antecipadamente pelo contratante no sistema SIGOR, módulo MTR da CETESB, quando aplicável, além de declaração de transporte ou nota fiscal de simples remessa, conforme o caso.");
    paragraph("Os serviços contemplam exclusivamente os resíduos descritos nesta proposta, conforme a classificação informada pelo contratante. Materiais com características diferentes das declaradas, inclusive contaminação ou mistura não prevista, dependerão de avaliação técnica e comercial específica.");
    paragraph("A destinação será comprovada mediante emissão do respectivo Certificado de Destinação Final (CDF), após a confirmação do recebimento pela unidade receptora.");
  }

  function renderConsulting(c: ConsultingContent) {
    heading("Apresentação");
    paragraph("Atendendo à sua solicitação, temos a satisfação de submeter à sua apreciação nossa proposta de Assessoria Ambiental.");
    paragraph(
      "A Assessoria Ambiental tem a finalidade de apoiar a empresa no acompanhamento e na gestão dos aspectos mais relevantes relacionados ao meio ambiente e à sustentabilidade, adequando o modelo à atividade e à cultura de cada cliente. O serviço envolve visitas periódicas para identificar melhorias, com relatórios e indicadores que permitem reduzir riscos e impactos ambientais.",
    );
    paragraph(
      "A RESIDUAL atua desde 1992 na prestação de serviços de assessoria ambiental em todo o território nacional, com equipe treinada e experiente em gerenciamento de áreas contaminadas e gestão de resíduos e efluentes.",
    );

    heading("Objetivo");
    paragraph(
      "Assegurar rastreabilidade, conformidade documental e controle técnico do gerenciamento de resíduos, reduzindo riscos ambientais e apoiando o atendimento às obrigações legais, às licenças, aos CADRIs, às exigências da CETESB e aos procedimentos internos da CONTRATANTE.",
    );

    const n = heading("Escopo dos serviços");
    c.scope
      .filter((s) => s.enabled && s.title.trim())
      .forEach((s, i) => {
        subheading(`${n}.${i + 1}. ${s.title.trim()}`);
        if (s.text.trim()) paragraph(s.text.trim());
      });

    heading("Metodologia de execução");
    bullets([
      "Diagnóstico e implantação: levantamento inicial de resíduos, CADRIs, MTRs, CDFs, prestadores, áreas e controles existentes.",
      "Regularização documental: atualização de cadastros e homologações e identificação de pendências.",
      "Gestão contínua: emissão e acompanhamento de MTRs, remoções, CDFs e movimentações.",
    ]);

    const deliverables = c.deliverables.map((d) => d.trim()).filter(Boolean);
    if (deliverables.length) {
      heading("Entregáveis");
      bullets(deliverables);
    }

    heading("Atendimento emergencial");
    paragraph(
      "Disponibilidade para suporte em situações emergenciais relacionadas à geração de resíduos ou a possíveis contaminações, orientando a CONTRATANTE quanto à segregação, acondicionamento, identificação, documentação, transporte e destinação ambientalmente adequada. Mobilizações presenciais extraordinárias ou contratação de terceiros poderão ser objeto de orçamento específico quando não abrangidas pela remuneração contratual.",
    );

    heading("Responsabilidades");
    subheading("Da CONTRATADA");
    bullets([
      "Disponibilizar equipe tecnicamente capacitada.",
      "Cumprir prazos e manter os controles atualizados.",
      "Preservar a rastreabilidade documental.",
      "Comunicar pendências e não conformidades.",
      "Observar a legislação aplicável e manter sigilo das informações.",
      "Disponibilizar os documentos e relatórios previstos.",
    ]);
    subheading("Da CONTRATANTE");
    bullets([
      "Disponibilizar as informações, os documentos e os dados de geração e movimentação necessários.",
      "Garantir acesso às áreas e informar alterações operacionais relevantes.",
      "Aprovar previamente orçamentos de terceiros.",
      "Analisar e aprovar documentos quando necessário.",
      "Comunicar ocorrências relacionadas aos resíduos.",
    ]);

    heading("Proposta comercial");
    ensure(22);
    fill(GREEN_SOFT);
    doc.roundedRect(M_LEFT, y, CONTENT_W, 18, 2, 2, "F");
    font("normal", 8.4, MUTED);
    doc.text("INVESTIMENTO MENSAL", M_LEFT + 5, y + 6.5);
    font("bold", 15, GREEN_DARK);
    doc.text(c.monthly_price == null ? "A combinar" : money(c.monthly_price), M_LEFT + 5, y + 13.5);
    if (c.monthly_price != null) {
      font("italic", 9, MUTED);
      doc.text(`(${moneyInWords(c.monthly_price)})`, PAGE_W - M_RIGHT - 5, y + 13.5, { align: "right", maxWidth: CONTENT_W * 0.55 });
    }
    y += 24;
    bullets([
      `Pagamento: faturamento mensal, com vencimento em ${c.due_days} dias após a emissão da nota fiscal.`,
      `Vigência: ${c.term_months} ${c.term_months === 1 ? "mês" : "meses"}.`,
      `Reajuste: anual, a contar da data-base da proposta ou conforme o contrato, pelo índice ${c.adjustment_index || "IPCA"}.`,
    ]);

    heading("Serviços e custos de terceiros");
    paragraph(
      "Não estão incluídos no valor de gerenciamento os custos cobrados por terceiros, tais como taxas de órgãos ambientais, análises laboratoriais, ensaios, laudos, elaboração de licenças, PGRS, transporte, tratamento, reciclagem, coprocessamento, incineração, disposição em aterro, armazenamento temporário, embalagens, equipamentos e serviços emergenciais de terceiros. Quando necessário, a RESIDUAL solicitará cotações e as submeterá à aprovação prévia da CONTRATANTE.",
    );

    if (c.extra_notes.trim()) {
      heading("Observações");
      paragraph(c.extra_notes.trim());
    }

    heading("Validade");
    paragraph(`Esta proposta é válida por ${p.validity_days} dias, até ${longDate(validUntil(p))}. Após esse prazo, os valores poderão ser revisados.`);
  }
}
