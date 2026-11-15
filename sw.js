// Service worker mínimo: só torna o sistema instalável como app (PWA).
// Não guarda cache de páginas nem de dados, para não interferir no aviso de
// atualização (AppUpdateBanner) nem mostrar informação desatualizada do Supabase.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Sem respondWith: o navegador busca tudo normalmente na rede.
});
