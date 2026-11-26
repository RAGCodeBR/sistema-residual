/**
 * Criar ou editar uma proposta (RESD nnn/aa).
 * /propostas/nova?modelo=…  → nova proposta a partir de um dos três modelos
 * /propostas/nova?de=<id>   → cópia de outra proposta (novo número)
 * /propostas/<id>           → edição, PDF e controle de envio/aprovação
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Eye, FileDown, Loader2, Lock, RotateCcw, Save, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { isMissingTable } from "@/lib/company";
import {
  STATUS_META,
  TEMPLATES,
  HISTORY_LABEL,
  defaultContent,
  defaultSubject,
  paymentTerms,
  idleFeeClause,
  displayStatus,
  isUniqueViolation,
  isWaste,
  longDate,
  nextNumber,
  proposalsDb,
  proposalCode,
  shortDate,
  todayIso,
  useProposal,
  useProposals,
  validUntil,
  type ConsultingContent,
  type HistoryEntry,
  type Proposal,
  type ProposalFields,
  type ProposalStatus,
  type Template,
  type WasteContent,
} from "@/lib/proposals";
import { useEquipmentTypes } from "@/lib/dumpsters";
import { MoneyInput, PriceGroupsEditor, ScopeEditor } from "@/components/proposals/ProposalFields";
import { MissingTable, StatusDialog, useProposalPdf } from "@/components/proposals/ProposalActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Search = { modelo?: Template; de?: string };
const TEMPLATE_IDS = Object.keys(TEMPLATES) as Template[];
const FREE_EQUIPMENT = "__livre__";

export const Route = createFileRoute("/_app/propostas/$proposalId")({
  component: ProposalEditorPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(TEMPLATE_IDS.includes(s.modelo as Template) ? { modelo: s.modelo as Template } : {}),
    ...(typeof s.de === "string" && s.de ? { de: s.de } : {}),
  }),
});

const blank = (template: Template, year: number, number: number): ProposalFields => ({
  year,
  number,
  template,
  issued_on: todayIso(),
  issue_city: template === "residuos_cacamba" ? "" : "Cubatão",
  validity_days: 30,
  subject: template === "residuos_cacamba" ? "" : defaultSubject(template),
  client_name: "",
  client_cnpj: "",
  client_city: "",
  client_phone: "",
  client_email: "",
  client_contact: "",
  content: defaultContent(template),
});

function ProposalEditorPage() {
  const { proposalId } = Route.useParams();
  const search = Route.useSearch();
  const isNew = proposalId === "nova";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const list = useProposals();
  const existing = useProposal(isNew ? search.de ?? null : proposalId);
  const { previewPdf, sharePdf, pdfBusy, pdfDialog } = useProposalPdf();
  const equipmentTypesQuery = useEquipmentTypes();
  const equipmentTypes = equipmentTypesQuery.data ?? [];

  const [form, setForm] = useState<ProposalFields | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState<ProposalStatus | null>(null);

  const saved: Proposal | null = !isNew ? existing.data ?? null : null;

  // Monta o formulário quando os dados chegam (uma única vez por proposta).
  useEffect(() => {
    setForm(null);
    setDirty(false);
  }, [proposalId, search.modelo, search.de]);
  useEffect(() => {
    if (form || list.isLoading || existing.isLoading) return;
    const year = new Date().getFullYear();
    if (isNew) {
      const source = search.de ? existing.data : null;
      const num = nextNumber(list.data ?? [], year);
      if (source) {
        const { id: _id, status: _s, sent_on: _so, decided_on: _d, decision_note: _n, history: _h, created_at: _c, updated_at: _u, ...fields } = source;
        setForm({ ...fields, year, number: num, issued_on: todayIso(), content: structuredClone(source.content) });
      } else setForm(blank(search.modelo ?? "residuos_peso", year, num));
    } else if (existing.data) {
      const { id: _id, status: _s, sent_on: _so, decided_on: _d, decision_note: _n, history: _h, created_at: _c, updated_at: _u, ...fields } = existing.data;
      setForm(fields);
    }
  }, [form, isNew, list.isLoading, list.data, existing.isLoading, existing.data, search.modelo, search.de]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const clientSuggestions = useMemo(() => {
    const byName = new Map<string, Proposal>();
    for (const p of list.data ?? []) if (!byName.has(p.client_name.toLocaleLowerCase("pt-BR"))) byName.set(p.client_name.toLocaleLowerCase("pt-BR"), p);
    return byName;
  }, [list.data]);

  const notReady = isMissingTable(list.error) || isMissingTable(existing.error);
  if (notReady) return <MissingTable />;
  if (!isNew && !existing.isLoading && !existing.data)
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <p className="font-medium">Proposta não encontrada.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/propostas">Voltar para Propostas</Link></Button>
      </div>
    );
  if (!form)
    return <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;

  const locked = saved?.status === "aprovada" || saved?.status === "recusada";
  const status = saved ? displayStatus(saved) : null;
  const update = (patch: Partial<ProposalFields>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };
  const waste = isWaste(form.template) ? (form.content as WasteContent) : null;
  const consulting = !waste ? (form.content as ConsultingContent) : null;
  const setWaste = (patch: Partial<WasteContent>) => update({ content: { ...(form.content as WasteContent), ...patch } });
  const setConsulting = (patch: Partial<ConsultingContent>) => update({ content: { ...(form.content as ConsultingContent), ...patch } });

  const onClientName = (name: string) => {
    const match = clientSuggestions.get(name.trim().toLocaleLowerCase("pt-BR"));
    const emptyDetails = !form.client_cnpj && !form.client_city && !form.client_phone && !form.client_email && !form.client_contact;
    if (match && emptyDetails)
      update({ client_name: match.client_name, client_cnpj: match.client_cnpj, client_city: match.client_city, client_phone: match.client_phone, client_email: match.client_email, client_contact: match.client_contact });
    else update({ client_name: name });
  };

  const validate = () => {
    if (!form.client_name.trim()) return "Informe o nome do cliente.";
    if (!form.number || form.number < 1) return "Informe o número da proposta.";
    if (!form.subject.trim()) return "Informe o assunto.";
    return null;
  };

  const save = async (): Promise<string | null> => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return null;
    }
    setSaving(true);
    try {
      const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
      const payload = {
        ...form,
        subject: form.subject.trim(),
        client_name: form.client_name.trim(),
        client_cnpj: clean(form.client_cnpj),
        client_city: clean(form.client_city),
        client_phone: clean(form.client_phone),
        client_email: clean(form.client_email),
        client_contact: clean(form.client_contact),
      };
      const entry = (s: HistoryEntry["status"]): HistoryEntry => ({ at: new Date().toISOString(), status: s, by: profile?.full_name ?? null });
      if (isNew) {
        const newId = await proposalsDb.insert({ ...payload, history: [entry("criada")] });
        await qc.invalidateQueries({ queryKey: ["proposals"] });
        setDirty(false);
        toast.success(`Proposta ${proposalCode(form)} criada.`);
        void navigate({ to: "/propostas/$proposalId", params: { proposalId: newId }, replace: true });
        return newId;
      }
      const history = saved?.status !== "rascunho" ? [...(saved?.history ?? []), entry("editada")] : saved.history;
      await proposalsDb.update(proposalId, { ...payload, history });
      await Promise.all([qc.invalidateQueries({ queryKey: ["proposals"] }), qc.invalidateQueries({ queryKey: ["proposal", proposalId] })]);
      setDirty(false);
      toast.success("Proposta salva.");
      return proposalId;
    } catch (error) {
      toast.error(isUniqueViolation(error) ? `Já existe uma proposta ${proposalCode(form)}. Use outro número.` : (error as { message?: string })?.message || "Não foi possível salvar a proposta.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const askStatus = async (next: ProposalStatus) => {
    if (dirty && !(await save())) return;
    setStatusTarget(next);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 pb-32 sm:p-6 sm:pb-28 max-md:p-3 max-md:pb-36">
      <header className="mb-5 flex flex-wrap items-start gap-3 max-md:mb-3">
        <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0"><Link to="/propostas" aria-label="Voltar para Propostas"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{TEMPLATES[form.template].label}</p>
          <h1 className="text-2xl font-bold tabular-nums max-md:text-xl">
            {isNew ? "Nova proposta" : proposalCode(form)}
            {form.client_name && <span className="font-normal text-muted-foreground"> · {form.client_name}</span>}
          </h1>
        </div>
        {status && <span className={`mt-1 rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>}
      </header>

      {locked && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/40 p-3 text-sm">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">Proposta {saved?.status} — o conteúdo fica travado para preservar o que foi respondido pelo cliente.</span>
          <Button size="sm" variant="outline" onClick={() => setStatusTarget("rascunho")}><RotateCcw className="h-4 w-4" />Reabrir</Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <fieldset disabled={locked} className="min-w-0 space-y-5 max-md:space-y-3">
          <Card title="Identificação">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Número" className="sm:col-span-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">RESD</span>
                  <Input type="number" min={1} inputMode="numeric" value={form.number || ""} onChange={(e) => update({ number: Number.parseInt(e.target.value, 10) || 0 })} className="tabular-nums" />
                  <span className="text-sm tabular-nums text-muted-foreground">/{String(form.year).slice(-2)}</span>
                </div>
              </Field>
              <Field label="Emissão">
                <Input type="date" value={form.issued_on} onChange={(e) => e.target.value && update({ issued_on: e.target.value, year: Number(e.target.value.slice(0, 4)) })} className="block w-full min-w-0" />
              </Field>
              <Field label="Cidade">
                <Input value={form.issue_city} onChange={(e) => update({ issue_city: e.target.value })} />
              </Field>
              <Field label="Validade" hint={`até ${shortDate(validUntil(form))}`}>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} inputMode="numeric" value={form.validity_days || ""} onChange={(e) => update({ validity_days: Math.max(1, Number.parseInt(e.target.value, 10) || 0) })} className="tabular-nums" />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Cliente">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Razão social *" className="sm:col-span-2">
                <Input list="proposal-clients" value={form.client_name} onChange={(e) => onClientName(e.target.value)} placeholder="Ex.: T-GRÃO Terminais de Granéis S/A" />
                <datalist id="proposal-clients">{[...clientSuggestions.values()].map((p) => <option key={p.id} value={p.client_name} />)}</datalist>
              </Field>
              <Field label="CNPJ"><Input value={form.client_cnpj ?? ""} onChange={(e) => update({ client_cnpj: e.target.value })} inputMode="numeric" placeholder="Opcional" /></Field>
              <Field label="Cidade"><Input value={form.client_city ?? ""} onChange={(e) => update({ client_city: e.target.value })} placeholder="Ex.: Santos/SP" /></Field>
              <Field label="Contato"><Input value={form.client_contact ?? ""} onChange={(e) => update({ client_contact: e.target.value })} placeholder="Nome de quem pediu" /></Field>
              <Field label="Telefone"><Input value={form.client_phone ?? ""} onChange={(e) => update({ client_phone: e.target.value })} inputMode="tel" /></Field>
              <Field label="E-mail" className="sm:col-span-2"><Input type="email" value={form.client_email ?? ""} onChange={(e) => update({ client_email: e.target.value })} /></Field>
            </div>
          </Card>

          <Card title="Assunto">
            <Input placeholder={defaultSubject(form.template)} value={form.subject} onChange={(e) => update({ subject: e.target.value })} />
          </Card>

          {waste && (
            <>
              <Card title="Resíduos e local">
                <div className="space-y-3">
                  <Field label="Resíduos" hint="Completa a frase “…coleta, transporte e destinação final de ___”">
                    <Textarea rows={2} value={waste.waste_summary} onChange={(e) => setWaste({ waste_summary: e.target.value })} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Onde estão armazenados"><Input value={waste.site} onChange={(e) => setWaste({ site: e.target.value })} placeholder="Ex.: sua área operacional em Santos/SP" /></Field>
                    <Field label="Equipamento" hint="Este texto aparece na proposta e pode ser editado.">
                      {equipmentTypes.length > 0 && (
                        <Select
                          value={waste.equipment_type_id && equipmentTypes.some((t) => t.id === waste.equipment_type_id) ? waste.equipment_type_id : FREE_EQUIPMENT}
                          onValueChange={(id) => {
                            const t = equipmentTypes.find((x) => x.id === id);
                            setWaste(t ? { equipment_type_id: t.id, equipment: t.proposal_text || t.name } : { equipment_type_id: null });
                          }}
                        >
                          <SelectTrigger aria-label="Tipo de equipamento"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {equipmentTypes.filter((t) => t.active || t.id === waste.equipment_type_id).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            <SelectItem value={FREE_EQUIPMENT}>Outro (texto livre)</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Textarea rows={2} value={waste.equipment} onChange={(e) => setWaste({ equipment: e.target.value })} aria-label="Texto do equipamento na proposta" />
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="Preços" description="Cada grupo vira uma tabela no PDF. Deixe o valor em branco para sair “A combinar”.">
                <PriceGroupsEditor groups={waste.groups} onChange={(groups) => setWaste({ groups })} disabled={locked} />
              </Card>

              <Card title={form.template === "residuos_cacamba" ? "Locação" : "Locação e pagamento"}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Período de locação da caçamba">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} inputMode="numeric" value={waste.rental_days ?? ""} onChange={(e) => setWaste({ rental_days: e.target.value ? Number.parseInt(e.target.value, 10) : null })} className="tabular-nums" />
                      <span className="text-sm text-muted-foreground">dias</span>
                    </div>
                  </Field>
                  {form.template !== "residuos_cacamba" && <>
                  <Field label="Mês sem movimentação" hint="Valor cobrado por caçamba parada (em branco = não cobra)">
                    <MoneyInput value={waste.idle_fee} onChange={(idle_fee) => setWaste({ idle_fee })} placeholder="Não cobrar" />
                  </Field>
                  <Field label="Faturamento">
                    <Select value={waste.billing} onValueChange={(v) => setWaste({ billing: v as WasteContent["billing"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="por_servico">Por serviço executado</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Vencimento do boleto">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} inputMode="numeric" value={waste.due_days} onChange={(e) => setWaste({ due_days: Number.parseInt(e.target.value, 10) || 0 })} className="tabular-nums" />
                      <span className="text-sm text-muted-foreground">dias após o serviço</span>
                    </div>
                  </Field>
                  </>}
                  <label className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                    <Switch checked={waste.separate_wastes} onCheckedChange={(v) => setWaste({ separate_wastes: v })} disabled={locked} />
                    <span className="text-sm">Exigir uma caçamba para cada tipo de resíduo (não misturar)</span>
                  </label>
                </div>
              </Card>
              {form.template === "residuos_cacamba" && (
                <Card title="Condições de pagamento">
                  <div className="space-y-3">
                    <Field label="Texto de pagamento">
                      <Textarea rows={3} value={paymentTerms(waste)} onChange={(e) => setWaste({ payment_terms: e.target.value })} />
                    </Field>
                    <Field label="Cobrança por caçamba no mês sem movimentação" hint={idleFeeClause(waste.idle_fee) || "Em branco, a cobrança é omitida do PDF."}>
                      <MoneyInput value={waste.idle_fee} onChange={(idle_fee) => setWaste({ idle_fee })} placeholder="Não cobrar" />
                    </Field>
                  </div>
                </Card>
              )}
            </>
          )}

          {consulting && (
            <>
              <Card title="Escopo dos serviços" description="Desmarque o que não se aplica a este cliente. Toque em “Editar” para ajustar o texto.">
                <ScopeEditor scope={consulting.scope} onChange={(scope) => setConsulting({ scope })} disabled={locked} />
              </Card>
              <Card title="Entregáveis" description="Um por linha.">
                <Textarea rows={5} value={consulting.deliverables.join("\n")} onChange={(e) => setConsulting({ deliverables: e.target.value.split("\n") })} />
              </Card>
              <Card title="Condições comerciais">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mensalidade"><MoneyInput value={consulting.monthly_price} onChange={(monthly_price) => setConsulting({ monthly_price })} placeholder="A combinar" /></Field>
                  <Field label="Vigência">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={1} inputMode="numeric" value={consulting.term_months} onChange={(e) => setConsulting({ term_months: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })} className="tabular-nums" />
                      <span className="text-sm text-muted-foreground">meses</span>
                    </div>
                  </Field>
                  <Field label="Vencimento">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} inputMode="numeric" value={consulting.due_days} onChange={(e) => setConsulting({ due_days: Number.parseInt(e.target.value, 10) || 0 })} className="tabular-nums" />
                      <span className="text-sm text-muted-foreground">dias após a NF</span>
                    </div>
                  </Field>
                  <Field label="Índice de reajuste anual"><Input value={consulting.adjustment_index} onChange={(e) => setConsulting({ adjustment_index: e.target.value })} /></Field>
                </div>
              </Card>
            </>
          )}

          <Card title="Observações" description="Opcional. Sai em uma seção própria no PDF.">
            <Textarea rows={3} value={(form.content as WasteContent | ConsultingContent).extra_notes} onChange={(e) => (waste ? setWaste({ extra_notes: e.target.value }) : setConsulting({ extra_notes: e.target.value }))} />
          </Card>
        </fieldset>

        {/* Lateral: situação e histórico */}
        <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          {saved ? (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Situação</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {saved.status === "rascunho" && "Ainda não enviada ao cliente."}
                {saved.status === "enviada" && (status === "vencida" ? `Validade venceu em ${shortDate(validUntil(saved))}. Cobre uma resposta ou faça uma nova proposta.` : `Aguardando resposta. Válida até ${longDate(validUntil(saved))}.`)}
                {saved.status === "aprovada" && `Aprovada em ${shortDate(saved.decided_on)}.`}
                {saved.status === "recusada" && `Recusada em ${shortDate(saved.decided_on)}.`}
              </p>
              {saved.decision_note && <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm">{saved.decision_note}</p>}
              <div className="mt-3 flex flex-col gap-2">
                {saved.status === "rascunho" && <Button onClick={() => void askStatus("enviada")}><Send className="h-4 w-4" />Marcar como enviada</Button>}
                {saved.status === "enviada" && (
                  <>
                    <Button onClick={() => void askStatus("aprovada")}><CheckCircle2 className="h-4 w-4" />Cliente aprovou</Button>
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => void askStatus("recusada")}><XCircle className="h-4 w-4" />Cliente recusou</Button>
                  </>
                )}
                {saved.status !== "rascunho" && !locked && <Button variant="ghost" size="sm" onClick={() => setStatusTarget("rascunho")}><RotateCcw className="h-4 w-4" />Voltar para rascunho</Button>}
              </div>
              {saved.status === "aprovada" && <p className="mt-3 rounded-lg border border-dashed p-2 text-xs text-muted-foreground">Próxima etapa: gerar o contrato a partir desta proposta (em construção).</p>}
            </section>
          ) : (
            <section className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
              Salve a proposta para controlar envio, aprovação ou recusa. O PDF já pode ser visualizado antes de salvar.
            </section>
          )}
          {saved && saved.history?.length > 0 && (
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Histórico</h2>
              <ol className="mt-3 space-y-3 border-l pl-4">
                {[...saved.history].reverse().map((h, i) => (
                  <li key={i} className="relative text-sm">
                    <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium">{HISTORY_LABEL[h.status] ?? h.status}</span>
                    <span className="block text-xs text-muted-foreground">{new Date(h.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{h.by ? ` · ${h.by}` : ""}</span>
                    {h.note && <span className="mt-0.5 block text-xs">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>

      {/* Barra de ações */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border md:px-3 md:pb-3 md:shadow-lg">
        <div className="flex items-center gap-2">
          <Button variant="outline" className="max-md:h-11 max-md:flex-1" disabled={pdfBusy} onClick={() => validate() ? toast.error(validate()) : void previewPdf(form)}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Ver PDF
          </Button>
          <Button variant="outline" className="max-md:h-11 max-md:flex-1" disabled={pdfBusy} onClick={() => validate() ? toast.error(validate()) : void sharePdf(form)}>
            <FileDown className="h-4 w-4" /><span className="max-md:hidden">Baixar PDF</span><span className="md:hidden">Enviar</span>
          </Button>
          {!locked && (
            <Button className="max-md:h-11 max-md:flex-1" disabled={saving || (!dirty && !isNew)} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{isNew ? "Criar proposta" : dirty ? "Salvar" : "Salvo"}
            </Button>
          )}
        </div>
      </div>

      {pdfDialog}
      <StatusDialog proposal={saved} status={statusTarget} onClose={() => setStatusTarget(null)} />
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
