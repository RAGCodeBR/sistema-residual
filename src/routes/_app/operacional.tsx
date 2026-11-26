import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { commercialRpc } from "@/lib/commercial-clients";
import { CommercialAddress } from "@/components/CommercialAddress";
import { DeliveryPhotos } from "@/components/operations/DeliveryPhotos";
import { SignatureField } from "@/components/operations/SignatureField";
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { table } from "@/lib/company";
import { proposalCode } from "@/lib/proposals";
import { buildSlipPdf, emptySlip, slipSections, slipValue, type Order, type Slip } from "@/lib/operational-slip";

export const Route = createFileRoute("/_app/operacional")({ component: Operations });
const pageSize = 25;
type Saved = { fields: Partial<Slip>; revision: number; issued: boolean };

function Operations() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Order | null>(null);
  const queue = useQuery({
    queryKey: ["operational-queue", user?.id, page],
    enabled: !selected,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15_000,

    queryFn: async () => {
      const { data, error } = await table("operational_queue").select("*").order("year", { ascending: false }).order("number", { ascending: false }).range(page*pageSize,(page+1)*pageSize);
      if (error) throw error;
      return data as Order[];
    },
  });
  const slip = useQuery({
    queryKey: ["operational-slip", user?.id, selected?.id, selected?.revision], enabled: !!selected, gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("read_operational_slip", { target: selected!.id });
      if (error || !data) throw new Error("Não foi possível abrir a ficha. Confira se a proposta continua aprovada.");
      return data as Saved;
    },
  });
  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-28 sm:p-6">
    {selected ? <>
      <Button variant="outline" onClick={() => setSelected(null)}>Voltar ao operacional</Button>
      <header><h1 className="text-2xl font-bold">Romaneio de equipamentos</h1><p className="text-muted-foreground">{proposalCode(selected)} · {selected.client_name}</p></header>
      {slip.isError ? <p role="alert">{slip.error.message}</p> : slip.data ? <div key={selected.id} className="space-y-4"><DeliveryPhotos proposalId={selected.id} /><SlipEditor order={selected} initial={slip.data} /></div> : <p>Carregando ficha…</p>}
    </> : <>
      <header><h1 className="text-2xl font-bold">Operacional</h1><p className="text-muted-foreground">Romaneios das propostas aprovadas</p></header>
      {queue.isError ? <p role="alert">Não foi possível carregar as propostas. <Button variant="outline" onClick={() => queue.refetch()}>Tentar novamente</Button></p> :
        queue.isPending ? <p>Carregando propostas…</p> : !queue.data?.length ? <p className="rounded-xl border p-5">Nenhuma proposta aprovada nesta página.</p> :
        <ul className="divide-y rounded-xl border bg-card">{queue.data.slice(0,pageSize).map(o =>
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><h2 className="font-semibold">{o.client_name}</h2><p className="text-sm">{proposalCode(o)} · {o.subject}</p><p className="text-sm text-muted-foreground">{o.issued ? "Romaneio gerado" : o.revision ? "Rascunho" : "A preencher"}</p></div>
            <Button variant={o.issued ? "outline" : "default"} onClick={() => setSelected(o)}>{o.issued ? "Abrir romaneio" : o.revision ? "Continuar ficha" : "Preencher ficha"}</Button>
          </li>)}</ul>}
      {(page>0 || (queue.data?.length ?? 0)>pageSize) && <div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage(page-1)}>Anterior</Button><Button variant="outline" disabled={(queue.data?.length ?? 0)<=pageSize} onClick={() => setPage(page+1)}>Próxima</Button></div>}
    </>}
  </main>;
}

function SlipEditor({ order, initial }: { order: Order; initial: Saved }) {
  const qc = useQueryClient();
  const {user}=useAuth();
  const locations=useQuery({queryKey:["operational-addresses",user?.id,order.id],queryFn:()=>commercialRpc<{customer:string;address:string|null}[]>("operational_addresses",{proposal:order.id})});
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const [fields, setFields] = useState<Slip>({ ...emptySlip, ...initial.fields });
  const [revision, setRevision] = useState(initial.revision);
  const [editing, setEditing] = useState(!initial.issued);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (key: keyof Slip, value: string) => setFields(prev => ({ ...prev, [key]: value }));
  async function save(issue: boolean) {
    if (busy) return;
    setBusy(true); setProblem("");
    try {
      const { data, error } = await supabase.rpc("save_operational_slip", { target: order.id, expected_revision: revision, issue, details: fields });
      if (error) throw new Error(error.message);
      qc.setQueriesData<Saved>({ queryKey: ["operational-slip"], predicate: q => q.queryKey[2] === order.id }, () => ({ revision: Number(data), issued: issue, fields }));
      setRevision(Number(data)); setEditing(!issue);
      await qc.invalidateQueries({ queryKey: ["operational-queue"] });
      toast.success(issue ? "Romaneio gerado." : "Rascunho salvo.");
    } catch (e) { setProblem(e instanceof Error ? e.message : "Não foi possível salvar o romaneio."); }
    finally { setBusy(false); }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void save(true); };
  async function pdf() {
    setBusy(true); setProblem("");
    try {
      const blob = await buildSlipPdf(order, fields);
      openPdfPreview({ title: "Romaneio de equipamentos", subtitle: proposalCode(order), fileName: `Romaneio ${proposalCode(order).replace("/", "-")}.pdf`, url: URL.createObjectURL(blob), revokeOnClose: true });
    } catch { setProblem("Não foi possível gerar o PDF."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={busy} className="space-y-4">
      {slipSections.map(section => <section key={section.title} className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{section.title}</h2>
        {editing && section.fields.some(([key])=>key==="address") && <><CommercialAddress customer={locations.data?.[0]?.customer} proposal={order.id} value={fields.address} addresses={(locations.data??[]).flatMap(a=>a.address?[a.address]:[])} onChange={a=>set("address",a)}/>{locations.isError && <p role="alert">{locations.error.message}</p>}</>}
        <div className="grid gap-3 sm:grid-cols-2">{section.fields.map(([key,label]) => {
          const multiline = ["address","equipment","notes"].includes(key);
          const date = ["day","delivery","pickup"].includes(key);
          const required = ["company","address","equipment","day"].includes(key);
          return <label key={key} className={`grid content-start gap-1 text-sm ${multiline ? "sm:col-span-2" : ""}`}>
            <span className="font-medium">{label}{editing && required ? " *" : ""}</span>
            {!editing ? <span className="whitespace-pre-wrap break-words">{slipValue(fields,key) || "—"}</span> :
              key==="cover" ? <select className="h-10 rounded-md border bg-background px-3" value={fields.cover} onChange={e=>set(key,e.target.value)}>
                <option value="">Não se aplica</option><option>Aberta</option><option>Fechada</option></select> :
              multiline ? <Textarea rows={2} required={required} maxLength={1000} value={fields[key]} onChange={e=>set(key,e.target.value)} /> :
              <Input type={date ? "date" : "text"} required={required} min={key==="pickup" ? fields.delivery : undefined} maxLength={1000} placeholder={key==="service" ? "Ex.: troca, entrega ou retirada" : undefined} value={fields[key]} onChange={e=>set(key,e.target.value)} />}
          </label>;
        })}</div>
      </section>)}
      <section className="rounded-xl border bg-card p-4"><h2 className="mb-3 font-semibold">Assinaturas</h2>
        <div className="grid gap-4 sm:grid-cols-2">{(["clientSigner","driver"] as const).map(key => {
          const label = key==="driver" ? "Motorista" : "Responsável do cliente";
          const sig = key==="driver" ? "driverSignature" : "clientSignature";
          return <div key={key} className="space-y-2">
            <label className="grid gap-1 text-sm font-medium">{label}{editing ? <Input maxLength={160} value={fields[key]} onChange={e=>set(key,e.target.value)} /> : fields[key] || "—"}</label>
            {editing ? <SignatureField label={`Assinatura · ${label}`} value={fields[sig]} onChange={v=>set(sig,v)} /> :
              fields[sig] ? <img className="w-full rounded-md border bg-white" alt={`Assinatura · ${label}`} src={fields[sig]} /> : <span className="text-sm text-muted-foreground">Assinatura em branco</span>}
          </div>;
        })}</div>
      </section>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap justify-end gap-2">{editing ? <>
        <Button type="button" variant="outline" onClick={() => void save(false)}>Salvar rascunho</Button>
        <Button type="submit">Gerar romaneio</Button></> : <>
        <Button type="button" variant="outline" onClick={()=>setEditing(true)}>Editar ficha</Button>
        <Button type="button" onClick={()=>void pdf()}>Abrir PDF</Button></>}</div>
    </fieldset>{pdfPreviewDialog}
  </form>;
}
