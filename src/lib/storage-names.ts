/**
 * Nome seguro para o caminho no Supabase Storage. O Storage recusa chaves com
 * acentos, "ç" e vários símbolos ("Invalid key"), o que é comum em fotos e
 * documentos vindos do celular. O nome original continua salvo em `file_name`.
 */
export function safeStorageName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-120) || "arquivo"
  );
}
