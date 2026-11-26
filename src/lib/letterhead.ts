/**
 * Papel timbrado da Residual (A4) aplicado nos PDFs de proposta e contrato.
 * As duas faixas foram recortadas do "Papel timbrado - novo.pdf" em 300 dpi:
 * cabeçalho de 0 a 41 mm e rodapé de 264 a 297 mm. O conteúdo deve ficar
 * entre CONTENT_TOP e CONTENT_BOTTOM.
 */
import top from "@/assets/letterhead-top.jpg?inline";
import bottom from "@/assets/letterhead-bottom.jpg?inline";
import type { jsPDF } from "jspdf";

export const LETTERHEAD = {
  /** Primeira linha livre abaixo do cabeçalho. */
  contentTop: 50,
  /** Última linha de texto acima da linha de paginação. */
  contentBottom: 252,
  /** Linha de identificação e paginação, logo acima do rodapé verde. */
  pageLine: 259,
};

/** Desenha cabeçalho e rodapé na página atual. O alias reaproveita a imagem. */
export function drawLetterhead(doc: jsPDF) {
  doc.addImage(top, "JPEG", 0, 0, 210, 41, "residual-letterhead-top", "NONE");
  doc.addImage(bottom, "JPEG", 0, 264, 210, 33, "residual-letterhead-bottom", "NONE");
}

/** Verde do "RESIDUAL" do logotipo no timbrado. */
export const BRAND_GREEN = "#106C30";

const BRAND_NAME = /\b(?:RESIDUAL(?:\s+COMÉRCIO\s+E\s+ASSESSORIA\s+AMBIENTAL\s+LTDA)?|Residual)\b/g;

/**
 * Quebra o texto em linhas. Se houver o nome da Residual, mede em negrito
 * para a linha caber na margem mesmo com o destaque.
 */
export function splitBrandAware(doc: jsPDF, text: string, width: number): string[] {
  if (!new RegExp(BRAND_NAME.source).test(text))
    return doc.splitTextToSize(text, width) as string[];
  const { fontName, fontStyle } = doc.getFont();
  doc.setFont(fontName, "bold");
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.setFont(fontName, fontStyle);
  return lines;
}

/**
 * Marca, palavra por palavra, onde aparece o nome da Residual num parágrafo
 * já quebrado em linhas (a razão social pode atravessar a quebra de linha).
 */
export function brandFlags(lines: string[]): boolean[][] {
  const words = lines.map((line) => line.trim().split(/\s+/).filter(Boolean));
  const starts: number[] = [];
  let joined = "";
  for (const word of words.flat()) {
    if (joined) joined += " ";
    starts.push(joined.length);
    joined += word;
  }
  const marked = new Array<boolean>(starts.length).fill(false);
  for (const match of joined.matchAll(BRAND_NAME)) {
    const from = match.index,
      to = from + match[0].length;
    starts.forEach((start, i) => {
      if (start < to && start + words.flat()[i].length > from) marked[i] = true;
    });
  }
  let k = 0;
  return words.map((line) => line.map(() => marked[k++]));
}

/**
 * Escreve uma linha destacando o nome da Residual em negrito verde.
 * Com `justify`, distribui o espaço restante entre as palavras até `width`.
 */
export function drawBrandLine(
  doc: jsPDF,
  line: string,
  x: number,
  y: number,
  opts: { flags?: boolean[]; justify?: boolean; width?: number },
) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const flags = opts.flags ?? [];
  const justify = !!opts.justify && !!opts.width && words.length >= 3;
  if (!flags.some(Boolean) && !justify) {
    doc.text(line, x, y);
    return;
  }
  const base = doc.getFont(),
    color = doc.getTextColor();
  const setStyle = (brand: boolean) => {
    doc.setFont(base.fontName, brand ? "bold" : base.fontStyle);
    doc.setTextColor(brand ? BRAND_GREEN : color);
  };
  const widths = words.map((word, i) => {
    setStyle(!!flags[i]);
    return doc.getTextWidth(word);
  });
  setStyle(false);
  const free = (opts.width ?? Infinity) - widths.reduce((sum, w) => sum + w, 0);
  // O negrito é mais largo: o espaço ao lado do nome cresce um pouco para não
  // parecer colado, e tudo encolhe se a linha passar da margem.
  const normal = doc.getTextWidth(" ");
  const gaps = words
    .slice(1)
    .map((_, i) => (!justify && (flags[i] || flags[i + 1]) ? normal * 1.5 : normal));
  const natural = gaps.reduce((sum, g) => sum + g, 0);
  const factor = justify ? free / natural : natural > free ? Math.max(free / natural, 0.5) : 1;
  words.forEach((word, i) => {
    setStyle(!!flags[i]);
    doc.text(word, x, y);
    x += widths[i] + (gaps[i] ?? 0) * factor;
  });
  setStyle(false);
}

/** Aplica o timbrado e a linha "documento · Página x de y" em todas as páginas. */
export function finishLetterheadPages(
  doc: jsPDF,
  label: string,
  opts: { left: number; right: number; color: string },
) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    drawLetterhead(doc);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(opts.color);
    doc.text(label, opts.left, LETTERHEAD.pageLine, {
      maxWidth: opts.right - opts.left - 30,
    });
    doc.text(`Página ${page} de ${total}`, opts.right, LETTERHEAD.pageLine, { align: "right" });
  }
}
