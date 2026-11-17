/**
 * Celular: mantém janelas e gavetas acima do teclado virtual.
 *
 * Quando o teclado abre (principalmente no iPhone), a área visível encolhe,
 * mas elementos fixos na base da tela continuam presos à tela inteira e ficam
 * escondidos atrás do teclado. Este hook mede a área visível
 * (window.visualViewport) e publica duas variáveis CSS no <html>:
 *   --kb   altura ocupada pelo teclado (0 quando fechado)
 *   --vvh  altura visível acima do teclado
 * As janelas usam `bottom: var(--kb)` e `max-height: var(--vvh)` no celular.
 * Também leva o campo tocado para o centro da janela, acima do teclado.
 */
import { useEffect } from "react";

const PHONE_QUERY = "(max-width: 767px)";
let consumers = 0;
let detach: (() => void) | null = null;

export const isPhoneViewport = () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;

const isTextField = (el: EventTarget | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "radio", "file", "submit", "reset", "range", "color", "hidden", "image"].includes(el.type);
};

function attach() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let frame = 0;

  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!isPhoneViewport() || !vv) {
        root.style.removeProperty("--kb");
        root.style.removeProperty("--vvh");
        return;
      }
      const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--kb", `${keyboard}px`);
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    });
  };

  // Campo tocado: espera o teclado terminar de abrir e centraliza o campo.
  let focusTimer = 0;
  const reveal = (target: HTMLElement) => {
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      if (document.activeElement !== target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 320);
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!isPhoneViewport() || !isTextField(event.target)) return;
    if (!event.target.closest('[role="dialog"]')) return;
    reveal(event.target);
  };
  // Se o teclado muda de tamanho com o campo já focado, recentraliza.
  const onViewportResize = () => {
    update();
    const active = document.activeElement;
    if (isPhoneViewport() && isTextField(active) && active.closest('[role="dialog"]')) reveal(active);
  };

  update();
  vv?.addEventListener("resize", onViewportResize);
  vv?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", onFocusIn);
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(focusTimer);
    vv?.removeEventListener("resize", onViewportResize);
    vv?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    document.removeEventListener("focusin", onFocusIn);
    root.style.removeProperty("--kb");
    root.style.removeProperty("--vvh");
  };
}

/** Ativo enquanto houver ao menos uma janela/gaveta aberta. */
export function useKeyboardInset() {
  useEffect(() => {
    consumers += 1;
    if (consumers === 1) detach = attach();
    return () => {
      consumers -= 1;
      if (consumers === 0) {
        detach?.();
        detach = null;
      }
    };
  }, []);
}
