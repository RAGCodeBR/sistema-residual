/**
 * Escolha de arquivos adaptada ao aparelho:
 * - computador (mouse): área para arrastar ou escolher os digitalizados;
 * - celular (toque): "Tirar foto" abre a câmera e "Galeria ou arquivos" abre
 *   as fotos e arquivos do aparelho.
 * Também mostra a lista do que já foi escolhido, com miniatura e remoção.
 */
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Camera, FileText, ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageFile } from "@/lib/scan-files";

const toArray = (list: FileList | null) => {
  if (!list || !list.length) return [];
  // Cópia estável: o campo é limpo logo depois.
  return Array.from(list);
};

export function FileSourcePicker({
  onFiles,
  accept,
  multiple = true,
  photosOnly = false,
  disabled = false,
  computerHint = "PDF, imagens ou qualquer arquivo digitalizado",
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  /** EPIs: só fotos. Muda os textos e o filtro do seletor. */
  photosOnly?: boolean;
  disabled?: boolean;
  computerHint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const acceptValue = accept ?? (photosOnly ? "image/*" : undefined);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = toArray(event.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div className="space-y-2">
      {/* Computador */}
      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "hidden cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors pointer-fine:flex",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">
          Arraste aqui ou <span className="text-primary underline underline-offset-4">escolha do computador</span>
        </span>
        <span className="text-xs text-muted-foreground">{computerHint}</span>
        <input
          type="file"
          className="sr-only"
          accept={acceptValue}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            const files = toArray(event.currentTarget.files);
            event.currentTarget.value = "";
            if (files.length) onFiles(files);
          }}
        />
      </label>

      {/* Celular / toque */}
      <div className="grid grid-cols-2 gap-2 pointer-fine:hidden">
        <label
          className={cn(
            "flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-transform active:scale-[0.98]",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Camera className="h-5 w-5" />
          Tirar foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const files = toArray(event.currentTarget.files);
              event.currentTarget.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </label>
        <label
          className={cn(
            "flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-3 py-3 text-sm font-medium transition-transform active:scale-[0.98]",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <ImageIcon className="h-5 w-5 text-primary" />
          {photosOnly ? "Da galeria" : "Galeria ou arquivos"}
          <input
            type="file"
            accept={acceptValue}
            multiple={multiple}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const files = toArray(event.currentTarget.files);
              event.currentTarget.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </label>
      </div>
    </div>
  );
}

/** Miniaturas dos arquivos escolhidos, na ordem em que viram páginas. */
export function PickedFiles({ files, onRemove, disabled }: { files: File[]; onRemove: (index: number) => void; disabled?: boolean }) {
  const previews = useMemo(() => files.map((file) => (isImageFile(file) ? URL.createObjectURL(file) : null)), [files]);
  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);
  if (!files.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {files.map((file, index) => (
        <li key={`${file.name}-${file.lastModified}-${index}`} className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-muted/40">
          {previews[index] ? (
            <img src={previews[index]!} alt={file.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
              <FileText className="h-6 w-6 text-primary" />
              <span className="line-clamp-3 text-[10px] leading-tight text-muted-foreground [overflow-wrap:anywhere]">{file.name}</span>
            </span>
          )}
          {files.length > 1 && (
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold tabular-nums text-white">{index + 1}</span>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(index)}
            aria-label={`Remover ${file.name}`}
            className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
