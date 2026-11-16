/**
 * Botão "Câmera" para telas de toque: abre a câmera do celular direto para
 * fotografar e anexar. Fica oculto em computadores (mouse), onde só existe
 * o seletor de arquivos tradicional.
 */
import { Camera } from "lucide-react";
import type { MouseEvent, TouchEvent } from "react";
import { cn } from "@/lib/utils";

export function CameraCaptureButton({
  onFiles,
  disabled = false,
  label = "Câmera",
  className,
  iconClassName = "h-4 w-4",
}: {
  /** Recebe uma cópia estável dos arquivos, já que o campo é limpo em seguida. */
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  iconClassName?: string;
}) {
  // Evita que o toque inicie o arraste de cards do Kanban.
  const stop = (event: MouseEvent | TouchEvent) => event.stopPropagation();
  return (
    <label
      onClick={stop}
      onPointerDown={stop}
      onTouchStart={stop}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 pointer-fine:hidden",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <Camera className={iconClassName} />
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const input = event.currentTarget;
          const picked = input.files;
          if (picked && picked.length) {
            let files: FileList = picked;
            try {
              const copy = new DataTransfer();
              for (const file of Array.from(picked)) copy.items.add(file);
              files = copy.files;
            } catch {
              // Navegadores sem DataTransfer: usa a lista original.
            }
            onFiles(files);
          }
          input.value = "";
        }}
      />
    </label>
  );
}
