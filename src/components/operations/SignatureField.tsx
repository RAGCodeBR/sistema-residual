import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";

export function SignatureField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const pointer = useRef<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const c = event.currentTarget;
    const r = c.getBoundingClientRect();
    return [(event.clientX - r.left) * c.width / r.width, (event.clientY - r.top) * c.height / r.height] as const;
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    onChange(event.currentTarget.toDataURL("image/png"));
  };
  return <div className="space-y-2">
    <div className="flex items-center justify-between"><span className="text-sm font-medium">{label}</span>
      {(value || drawing) && <Button type="button" variant="ghost" size="sm" onClick={() => { pointer.current = null; setDrawing(false); onChange(""); }}>Limpar</Button>}</div>
    {drawing ? <canvas width={640} height={160} aria-label={label} className="block aspect-[4/1] w-full touch-none rounded-md border bg-white"
      onPointerDown={e => {
        if (pointer.current !== null) return;
        const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
        pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
        ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#17221a";
        const [x,y] = point(e); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+0.1,y); ctx.stroke();
      }}
      onPointerMove={e => { if (pointer.current === e.pointerId) { const ctx=e.currentTarget.getContext("2d"); ctx?.lineTo(...point(e)); ctx?.stroke(); } }}
      onPointerUp={finish} onPointerCancel={finish} /> :
      value ? <img className="w-full max-w-sm rounded border bg-white" src={value} alt={label} /> :
      <Button type="button" variant="outline" onClick={() => setDrawing(true)}>Assinar na tela</Button>}
  </div>;
}
