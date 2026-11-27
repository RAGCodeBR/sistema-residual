import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

// Match the hosting base: GitHub Pages uses a subdirectory; Cloudflare uses /.
const router = getRouter(import.meta.env.BASE_URL.replace(/\/$/, "") || "/");

// Registra o service worker que permite instalar o sistema no celular
// ("Adicionar à Tela de Início" no iPhone, "Instalar app" no Android).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
