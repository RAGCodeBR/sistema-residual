import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { table } from "@/lib/company";
import { warehousePhoto as preparePhotoDataUrl } from "@/lib/scan-files";

type Receipt = { id: string; captured_at: string; latitude: number; longitude: number; accuracy_m: number };
type Upload = Receipt & { photo: string; located_at: string; proposal_id: string };
const tableName = "operational_delivery_photos";

function locate() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador não oferece localização. Abra o sistema no navegador do celular."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, e => reject(new Error(e.code === 1
      ? "Permita a localização nas configurações deste site e tire a foto novamente."
      : "O celular não conseguiu obter a localização. Confira se ela está ligada e tire a foto novamente.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  });
}

export function DeliveryPhotos({ proposalId }: { proposalId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const camera = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Upload | null>(null);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const key = ["delivery-photos",user?.id,proposalId];
  const photos = useQuery({
    queryKey: key, refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await table(tableName).select("id,captured_at,latitude,longitude,accuracy_m").eq("proposal_id",proposalId).order("captured_at",{ ascending:false });
      if (error) throw error;
      return data as Receipt[];
    },
  });
  const image = useQuery({
    queryKey: ["delivery-photo",user?.id,proposalId,selected?.id], enabled: !!selected, gcTime: 0,
    queryFn: async () => {
      const { data, error } = await table(tableName).select("photo").eq("proposal_id",proposalId).eq("id",selected!.id).single();
      if (error) throw error;
      return data.photo as string;
    },
  });
  async function upload(row: Upload) {
    setStatus("Salvando comprovante…"); setError("");
    try {
      const { error } = await table(tableName).insert(row);
      if (error && error.code !== "23505") throw error;
      setPending(null);
      await qc.invalidateQueries({ queryKey:key });
    } catch {
      setPending(row); setError("Envio não confirmado. Mantenha a ficha aberta e tente novamente para enviar a mesma foto e localização.");
    } finally { setStatus(""); }
  }
  async function capture(file: File) {
    const at = Date.now();
    setStatus("Obtendo a localização da entrega…"); setError("");
    try {
      const [position,photo] = await Promise.all([locate(),preparePhotoDataUrl(file)]);
      if (Math.abs(position.timestamp-at)>60000) throw new Error("A localização não é recente. Tire a foto novamente.");
      const { latitude, longitude, accuracy } = position.coords;
      await upload({ id: crypto.randomUUID(), proposal_id:proposalId, captured_at:new Date(at).toISOString(),
        located_at:new Date(position.timestamp).toISOString(), latitude,longitude,accuracy_m:accuracy,photo });
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a foto."); setStatus(""); }
  }
  return <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-semibold">Comprovante de entrega</h2>
    <p className="text-sm text-muted-foreground">Ao tirar a foto, permita o uso da localização para registrar o ponto da entrega.</p>
    <input ref={camera} className="hidden" aria-label="Foto da entrega" type="file" accept="image/*" capture="environment" onChange={e=>{
      const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; if(file) void capture(file);
    }} />
    <Button type="button" disabled={!!status || !!pending} onClick={()=>camera.current?.click()}><Camera className="h-4 w-4"/>Tirar foto da entrega</Button>
    {status && <p role="status">{status}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {pending && <Button type="button" variant="outline" disabled={!!status} onClick={()=>void upload(pending)}>Tentar envio novamente</Button>}
    {photos.isError && <p role="alert">Não foi possível carregar os comprovantes. <Button variant="ghost" onClick={()=>photos.refetch()}>Tentar novamente</Button></p>}
    {!!photos.data?.length && <ul className="divide-y">{photos.data.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div><p className="text-sm font-medium">{new Date(r.captured_at).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">Precisão estimada de {Math.round(r.accuracy_m)} m</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>setSelected(r)}>Ver foto</Button>
        <Button asChild variant="outline" size="sm"><a href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer">Google Maps</a></Button></div>
    </li>)}</ul>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent><DialogTitle>Foto da entrega</DialogTitle>
      {image.isError ? <p role="alert">Não foi possível abrir a foto.</p> : image.data ? <img className="max-h-[70dvh] w-full object-contain" src={image.data} alt="Entrega registrada"/> : <p>Carregando foto…</p>}
    </DialogContent></Dialog>
  </section>;
}
