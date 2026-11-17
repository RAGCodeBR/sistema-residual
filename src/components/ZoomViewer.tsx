/**
 * Visualizador com zoom para imagens e páginas de PDF.
 * Abre sempre mostrando o conteúdo inteiro (ajustado à tela). Para ampliar:
 * pinça com dois dedos, toque/clique duplo no ponto desejado, Ctrl + roda do
 * mouse ou os botões + / −. "Ajustar" volta para a vista inteira.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Maximize2, Minus, Plus } from "lucide-react";

const MIN = 1;
const MAX = 6;
const DOUBLE_TAP_ZOOM = 2.5;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

type Anchor = { x: number; y: number; from: number; to: number };

function useZoom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScaleState] = useState(1);
  const scaleRef = useRef(1);
  const anchor = useRef<Anchor | null>(null);

  /** Muda o zoom mantendo o ponto (x,y) da tela no mesmo lugar. */
  const zoomTo = useCallback(
    (next: number, x?: number, y?: number) => {
      const el = containerRef.current;
      const to = clamp(next);
      const from = scaleRef.current;
      if (!el || to === from) return;
      const px = x ?? el.clientWidth / 2;
      const py = y ?? el.clientHeight / 2;
      anchor.current = { x: px, y: py, from, to };
      scaleRef.current = to;
      setScaleState(to);
    },
    [containerRef],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    anchor.current = null;
    if (a.to === MIN) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
      return;
    }
    const ratio = a.to / a.from;
    el.scrollLeft = (el.scrollLeft + a.x) * ratio - a.x;
    el.scrollTop = (el.scrollTop + a.y) * ratio - a.y;
  }, [scale, containerRef]);

  const reset = useCallback(() => zoomTo(MIN), [zoomTo]);
  return { scale, scaleRef, zoomTo, reset };
}

/** Gestos: pinça, toque duplo, clique duplo e Ctrl + roda. */
function useGestures(containerRef: React.RefObject<HTMLDivElement | null>, zoom: ReturnType<typeof useZoom>) {
  const { zoomTo, scaleRef } = zoom;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let pinch: { dist: number; scale: number } | null = null;
    let lastTap = 0;
    const local = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: distance(e.touches), scale: scaleRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const mid = local((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      zoomTo(pinch.scale * (distance(e.touches) / pinch.dist), mid.x, mid.y);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        lastTap = 0;
        return;
      }
      if (e.changedTouches.length !== 1 || e.touches.length) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        const p = local(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        zoomTo(scaleRef.current > MIN ? MIN : DOUBLE_TAP_ZOOM, p.x, p.y);
        lastTap = 0;
        e.preventDefault();
      } else lastTap = now;
    };
    const onDoubleClick = (e: MouseEvent) => {
      const p = local(e.clientX, e.clientY);
      zoomTo(scaleRef.current > MIN ? MIN : DOUBLE_TAP_ZOOM, p.x, p.y);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      zoomTo(scaleRef.current * Math.exp(-e.deltaY * 0.01), p.x, p.y);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, zoomTo, scaleRef]);
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function Controls({ scale, onZoom, onReset }: { scale: number; onZoom: (next: number) => void; onReset: () => void }) {
  const btn = "grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-40";
  return (
    <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 p-1 text-white shadow-lg backdrop-blur">
      <button type="button" className={btn} onClick={() => onZoom(scale / 1.5)} disabled={scale <= MIN} aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></button>
      <button type="button" onClick={onReset} disabled={scale <= MIN} className="flex h-10 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums transition-colors hover:bg-white/15 disabled:opacity-100" aria-label="Ajustar à tela">
        {scale <= MIN ? "Tela inteira" : <><Maximize2 className="h-3.5 w-3.5" />{Math.round(scale * 100)}%</>}
      </button>
      <button type="button" className={btn} onClick={() => onZoom(scale * 1.5)} disabled={scale >= MAX} aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function Stage({ children, scale, zoom }: { children: ReactNode; scale: number; zoom: ReturnType<typeof useZoom> }) {
  return (
    <>
      {children}
      <Controls scale={scale} onZoom={(next) => zoom.zoomTo(next)} onReset={zoom.reset} />
    </>
  );
}

/** Imagem: começa inteira na tela. */
export function ZoomableImage({ src, alt, onLoad }: { src: string; alt: string; onLoad?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const zoom = useZoom(ref);
  useGestures(ref, zoom);
  const size = useContainerSize(ref);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const { scale } = zoom;

  // Tamanho "inteiro na tela" (nunca amplia além do tamanho real na vista inicial).
  const fit = natural && size.w && size.h ? Math.min(size.w / natural.w, size.h / natural.h, 1) : 1;
  const width = natural ? natural.w * fit * scale : undefined;
  const height = natural ? natural.h * fit * scale : undefined;

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full touch-pan-x touch-pan-y overflow-auto overscroll-contain [scrollbar-width:thin]">
        <div className="flex min-h-full min-w-full items-center justify-center" style={width ? { width: Math.max(width, size.w), height: Math.max(height ?? 0, size.h) } : undefined}>
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(e) => {
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
              onLoad?.();
            }}
            className="max-w-none select-none rounded-sm shadow-sm"
            style={width ? { width, height } : { maxWidth: "100%", maxHeight: "100%", opacity: 0 }}
          />
        </div>
      </div>
      <Stage scale={scale} zoom={zoom}>{null}</Stage>
    </div>
  );
}

/** PDF desenhado página a página (celular): começa na largura da tela. */
export function ZoomablePdf({ url, title, onLoad, onError }: { url: string; title: string; onLoad?: () => void; onError?: (message: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const zoom = useZoom(ref);
  useGestures(ref, zoom);
  const size = useContainerSize(ref);
  const [pages, setPages] = useState<{ src: string; ratio: number }[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Não foi possível abrir o documento.");
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
        if (cancelled) return;
        const count = Math.min(pdf.numPages, 60);
        setTotal(count);
        // Resolução boa para ampliar sem pesar demais no celular.
        const targetWidth = Math.min(2000, Math.max(1200, (window.innerWidth || 400) * (window.devicePixelRatio || 2) * 1.5));
        for (let i = 1; i <= count; i += 1) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: targetWidth / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Seu navegador não conseguiu desenhar o documento.");
          await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
          if (cancelled || !blob) return;
          const src = URL.createObjectURL(blob);
          created.push(src);
          setPages((current) => [...current, { src, ratio: canvas.height / canvas.width }]);
          if (i === 1) onLoad?.();
        }
      } catch (error) {
        if (!cancelled) onError?.(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((src) => URL.revokeObjectURL(src));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const baseWidth = Math.max(0, size.w - 16);
  const width = baseWidth * zoom.scale;
  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full touch-pan-x touch-pan-y overflow-auto overscroll-contain">
        <div className="mx-auto space-y-2 px-2 py-2 pb-20" style={{ width: Math.max(width + 16, size.w) }}>
          {pages.map((page, index) => (
            <img key={page.src} src={page.src} alt={`${title} · página ${index + 1}`} draggable={false} className="mx-auto max-w-none select-none rounded-sm bg-white shadow-sm" style={{ width, height: width * page.ratio }} />
          ))}
          {total > 0 && pages.length < total && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando página {pages.length + 1} de {total}…
            </div>
          )}
        </div>
      </div>
      <Stage scale={zoom.scale} zoom={zoom}>{null}</Stage>
    </div>
  );
}
