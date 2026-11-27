import { defineConfig, loadEnv, mergeConfig } from "vite";
import pagesConfig from "./vite.pages.config";

// Reuse the static app (including the separate contract signing entry).
// No Node/TanStack server or private Supabase credentials are deployed here.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    if (!env[key]) throw new Error(`${key} precisa estar configurada antes de publicar na Cloudflare.`);
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  if (key.startsWith("sb_secret_")) {
    throw new Error("Use somente a chave pública na configuração VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  return mergeConfig(pagesConfig, {
    base: "/",
    build: { outDir: "dist-cloudflare" },
  });
});
