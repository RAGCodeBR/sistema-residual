/**
 * Preparação de arquivos "digitalizados" antes do envio:
 * - fotos do celular (5–10 MB) são reduzidas para um JPEG leve e legível;
 * - várias fotos de um mesmo documento viram um único PDF, uma página por foto.
 */

const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.82;

export const isImageFile = (file: File) =>
  file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "documento";

type Prepared = { blob: Blob; width: number; height: number; dataUrl: string };

async function drawToJpeg(file: File): Promise<Prepared> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    // createImageBitmap respeita a orientação EXIF das fotos do celular.
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
    width = source.width;
    height = source.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Não foi possível ler a imagem “${file.name}”.`));
        img.src = url;
      });
    } finally {
      // A imagem já foi decodificada no onload.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    width = source.naturalWidth;
    height = source.naturalHeight;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const blob = await (await fetch(dataUrl)).blob();
  return { blob, width: w, height: h, dataUrl };
}

/** Reduz uma foto para JPEG. Se não for possível processar, devolve o original. */
export async function compressImage(file: File): Promise<File> {
  if (!isImageFile(file) || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const { blob } = await drawToJpeg(file);
    if (blob.size >= file.size && file.type === "image/jpeg") return file;
    return new File([blob], `${baseName(file.name)}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Junta várias imagens em um PDF A4, uma imagem por página, centralizada. */
export async function imagesToPdf(files: File[], title: string): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 6;
  for (let i = 0; i < files.length; i += 1) {
    const { width, height, dataUrl } = await drawToJpeg(files[i]);
    if (i > 0) pdf.addPage("a4", "portrait");
    const ratio = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
    const w = width * ratio;
    const h = height * ratio;
    pdf.addImage(dataUrl, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, "FAST");
  }
  const blob = pdf.output("blob");
  return new File([blob], `${baseName(title || "documento")}.pdf`, { type: "application/pdf", lastModified: Date.now() });
}

/**
 * Arquivo final de um documento:
 * - um arquivo só → enviado como está (fotos são reduzidas);
 * - várias imagens → um PDF com todas as páginas.
 */
export async function prepareDocumentFile(files: File[], title: string): Promise<File> {
  if (files.length === 0) throw new Error("Anexe o arquivo do documento.");
  if (files.length === 1) return compressImage(files[0]);
  if (!files.every(isImageFile))
    throw new Error("Para juntar várias páginas, use apenas fotos ou imagens. Um PDF deve ser enviado sozinho.");
  return imagesToPdf(files, title);
}
