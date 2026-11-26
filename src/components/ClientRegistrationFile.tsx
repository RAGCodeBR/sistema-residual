import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const storage = () => supabase.storage.from("client-registration");
export const acceptedFiles = "application/pdf,image/jpeg,image/png";
export function validateFile(file: File) {
  if (!acceptedFiles.split(",").includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)
    throw new Error("Escolha um PDF, JPG ou PNG com até 10 MB.");
}
export async function uploadRegistration(customer: string, file: File) {
  validateFile(file);
  const { error } = await storage().upload(customer + "/ficha", file, {
    upsert: true,
    cacheControl: "0",
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
}
export function ClientRegistrationFile({
  id,
  hasFile,
  editing = false,
}: {
  id: string;
  hasFile: boolean;
  editing?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    qc = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => uploadRegistration(id, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["commercial-clients"] });
      toast.success("Ficha cadastral salva.");
    },
    onError: (e) => toast.error(e.message),
  });
  async function open() {
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      toast.error("Permita abrir uma nova aba para visualizar a ficha.");
      return;
    }
    tab.opener = null;
    try {
      const { data, error } = await storage().createSignedUrl(id + "/ficha", 60);
      if (error) throw error;
      tab.location.replace(data.signedUrl);
    } catch {
      tab.close();
      toast.error("Não foi possível abrir a ficha cadastral.");
    }
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {hasFile && (
        <Button type="button" size="sm" variant="outline" onClick={() => void open()}>
          <FileText />
          Abrir ficha
        </Button>
      )}
      {(!hasFile || editing) && (
        <>
          <input
            className="hidden"
            aria-label="Arquivo da ficha cadastral"
            ref={input}
            type="file"
            accept={acceptedFiles}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload.mutate(f);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
            {upload.isPending ? "Enviando…" : hasFile ? "Substituir ficha" : "Anexar ficha"}
          </Button>
        </>
      )}
    </div>
  );
}
