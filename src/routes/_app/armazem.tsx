import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Camera, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { table } from "@/lib/company";
import { todayIso } from "@/lib/proposals";
import { warehousePhoto } from "@/lib/scan-files";

export const Route = createFileRoute("/_app/armazem")({ component: Warehouse });
type Load = { id: string; client_name: string; waste_type: string; arrived_on: string; departed_on: string | null; has_photo: boolean };
const columns = "id,client_name,waste_type,arrived_on,departed_on,has_photo";
const dateLabel = (day: string) => day.split("-").reverse().join("/");
const pageSize = 25;
const fieldStyle = "grid gap-1.5 text-sm font-medium";

function Warehouse() {
  const { user } = useAuth();
  const clients = useClients();
  const qc = useQueryClient();
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(0);
  const [entryId, setEntryId] = useState("");
  const [exit, setExit] = useState<Load | null>(null);
  const [photo, setPhoto] = useState<Load | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const query = useQuery({
    queryKey: ["warehouse", user?.id, history, page],
    queryFn: async () => {
      const base = table("warehouse_loads").select(columns);
      const filtered = history ? base.not("departed_on", "is", null) : base.is("departed_on", null);
      const { data, error } = await filtered.order(history ? "departed_on" : "arrived_on", { ascending: false }).order("id", { ascending: false }).range(page * pageSize, (page + 1) * pageSize);
      if (error) throw error;
      return data as Load[];
    },
  });
  const photoQuery = useQuery({
    queryKey: ["warehouse-photo", user?.id, photo?.id], enabled: !!photo, gcTime: 0,
    queryFn: async () => {
      const { data, error } = await table("warehouse_loads").select("photo").eq("id", photo!.id).single();
      if (error) throw error;
      return data.photo as string;
    },
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setProblem("");
    try {
      if (exit) {
        const { data, error } = await table("warehouse_loads").update({ departed_on: values.get("day") }).eq("id", exit.id).is("departed_on", null).select("id").maybeSingle();
        if (error) throw error;
        if (!data) {
          await qc.invalidateQueries({ queryKey: ["warehouse"] });
          throw new Error("A carga já teve a saída registrada ou está indisponível.");
        }
      } else {
        const client = String(values.get("client")).trim();
        const residue = String(values.get("waste")).trim();
        if (!client || !residue) throw new Error("Informe o cliente e o tipo de resíduo.");
        const file = values.get("photo");
        const image = file instanceof File && file.size ? await warehousePhoto(file) : null;
        const { error } = await table("warehouse_loads").insert({ id: entryId, client_name: client, arrived_on: values.get("day"), waste_type: residue, photo: image });
        if (error && error.code !== "23505") throw error;
      }
      setHistory(!!exit);
      setPage(0);
      await qc.invalidateQueries({ queryKey: ["warehouse"] });
      toast.success(exit ? "Saída registrada." : "Entrada registrada.");
      setEntryId("");
      setExit(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Não foi possível registrar. Confira a conexão e tente novamente.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">Armazém</h1>
      <Button onClick={() => { setProblem(""); setEntryId(crypto.randomUUID()); }}><Plus className="h-4 w-4" />Registrar entrada</Button>
    </header>
    <div className="flex gap-2">{[false, true].map(done =>
      <Button key={String(done)} variant={history === done ? "default" : "outline"} aria-pressed={history === done} onClick={() => { setHistory(done); setPage(0); }}>{done ? "Saídas" : "No armazém"}</Button>)}</div>
    {query.isLoading ? <p>Carregando cargas…</p> : query.isError ? <div role="alert">Não foi possível carregar as cargas. <Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> :
      !query.data?.length ? <p className="rounded-xl border p-5 text-muted-foreground">{history ? "Nenhuma saída registrada." : "Nenhuma carga no armazém."}</p> :
      <ul className="divide-y rounded-xl border bg-card">{query.data.slice(0, pageSize).map(load =>
        <li key={load.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 break-words"><h2 className="font-semibold">{load.client_name}</h2><p>{load.waste_type}</p>
            <p className="text-sm text-muted-foreground">Entrada em {dateLabel(load.arrived_on)}{load.departed_on && <> · Saída em {dateLabel(load.departed_on)}</>}</p></div>
          <div className="flex flex-wrap gap-2">{load.has_photo && <Button variant="outline" onClick={() => setPhoto(load)}><Camera className="h-4 w-4" />Foto</Button>}
            {!load.departed_on && <Button variant="outline" onClick={() => { setProblem(""); setExit(load); }}>Registrar saída</Button>}</div>
        </li>)}</ul>}
    {(page > 0 || (query.data?.length ?? 0) > pageSize) && <div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" disabled={(query.data?.length ?? 0) <= pageSize} onClick={() => setPage(page + 1)}>Próxima</Button></div>}
    <Dialog open={!!entryId || !!exit} onOpenChange={open => { if (!open && !busy) { setExit(null); setEntryId(""); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogTitle>{exit ? "Registrar saída" : "Registrar entrada"}</DialogTitle>
        <form className="space-y-4" onSubmit={save}><fieldset disabled={busy} className="space-y-4">
          {exit ? <p>{exit.client_name} · {exit.waste_type}<br/>Entrada em {dateLabel(exit.arrived_on)}</p> : <>
            <label className={fieldStyle}>Cliente<Input name="client" list="warehouse-clients" maxLength={240} required /></label>
            <datalist id="warehouse-clients">{clients.data?.map(c => <option key={c.id} value={c.name} />)}</datalist>
            <label className={fieldStyle}>Tipo de resíduo<Input name="waste" placeholder="Ex.: material filtrante" maxLength={500} required /></label>
          </>}
          <label className={fieldStyle}>{exit ? "Data da saída" : "Data da entrada"}<Input name="day" type="date" min={exit?.arrived_on} defaultValue={exit && exit.arrived_on > todayIso() ? exit.arrived_on : todayIso()} required /></label>
          {!exit && <label className={fieldStyle}>Foto da carga (opcional)<Input name="photo" type="file" accept="image/*" /></label>}
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
          <Button className="w-full" type="submit">{busy ? "Salvando…" : exit ? "Confirmar saída" : "Salvar entrada"}</Button>
        </fieldset></form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!photo} onOpenChange={open => { if (!open) setPhoto(null); }}><DialogContent><DialogTitle>Foto da carga · {photo?.client_name}</DialogTitle>
      {photoQuery.isError ? <p role="alert">Não foi possível abrir a foto.</p> : photoQuery.data ? <img className="max-h-[70dvh] w-full object-contain" src={photoQuery.data} alt={photo?.waste_type} /> : <p>Carregando foto…</p>}
    </DialogContent></Dialog>
  </main>;
}
