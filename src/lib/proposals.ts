/**
 * Propostas comerciais da Residual (RESD nnn/aa).
 *
 * Modelos comerciais, montados a partir das propostas enviadas hoje:
 *  - residuos_classe_i: coleta e destinação exclusiva de Classe I, com preço por peso.
 *  - residuos_peso: coleta e destinação com preço por kg/m³ (ex.: RESD 152/26 · T-GRÃO)
 *  - residuos_cacamba: coleta e destinação com preço fechado por caçamba (ex.: RESD 159/26 · MARFORTE)
 *  - assessoria: assessoria ambiental com mensalidade (ex.: RESD 160/26 · MARFORTE)
 *
 * Tabela criada em supabase/migrations/20261120120000_create_proposals.sql.
 */
import { useQuery } from "@tanstack/react-query";
import { isMissingTable, table } from "@/lib/company";

/* Empresa emissora ---------------------------------------------------------- */

export const RESIDUAL = {
  name: "Residual Assessoria em Meio Ambiente",
  legalName: "Residual Comércio e Assessoria Ambiental Ltda.",
  cnpj: "67.718.502/0001-23",
  tagline: "Cuidando do Brasil desde 1992",
  address: "Rua José Vicente, 263 · Sítio Cafezal · Cubatão/SP · CEP 11505-010",
  city: "Cubatão/SP",
  phone: "(13) 3361-2687",
  email: "residualadm@litoral.com.br",
  site: "",
  signers: [
    { name: "Ricardo Pinto", role: "Diretor" },
    { name: "Sandra Marques", role: "Tecnóloga Ambiental" },
  ],
};

/* Tipos --------------------------------------------------------------------- */

export type Template = "residuos_classe_i" | "residuos_peso" | "residuos_cacamba" | "assessoria";
export type ProposalStatus = "rascunho" | "enviada" | "aprovada" | "recusada";

export const UNITS = ["kg", "tonelada", "m³", "caçamba", "viagem", "unidade", "litro", "mês"] as const;

export type PriceItem = { freight?: boolean; id: string; description: string; price: number | null; unit: string; minimum: string };
export type PriceGroup = { id: string; title: string; items: PriceItem[] };

export type WasteContent = {
  /** Trecho que completa "coleta, transporte e destinação final de …". */
  waste_summary: string;
  /** Onde os resíduos estão (ex.: "sua área operacional em Santos/SP"). */
  site: string;
  equipment: string;
  operational_resources?: string;
  /** Tipo do catálogo de Caçambas (equipment_types). */
  equipment_type_id?: string | null;
  groups: PriceGroup[];
  rental_days: number | null;
  idle_fee: number | null;
  separate_wastes: boolean;
  billing: "por_servico" | "mensal";
  payment_terms?: string;
  due_days: number;
  extra_notes: string;
};

export type ScopeItem = { id: string; title: string; text: string; enabled: boolean };
export type ConsultingContent = {
  scope: ScopeItem[];
  deliverables: string[];
  monthly_price: number | null;
  term_months: number;
  due_days: number;
  adjustment_index: string;
  extra_notes: string;
};

export type HistoryEntry = { at: string; status: ProposalStatus | "criada" | "editada"; note?: string | null; by?: string | null };

export type ProposalFields = {
  client_id?: string | null;
  service_address?: string | null;
  year: number;
  number: number;
  template: Template;
  issued_on: string;
  issue_city: string;
  validity_days: number;
  subject: string;
  client_name: string;
  client_cnpj: string | null;
  client_city: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_contact: string | null;
  content: WasteContent | ConsultingContent;
};

export type Proposal = ProposalFields & {
  id: string;
  status: ProposalStatus;
  sent_on: string | null;
  decided_on: string | null;
  decision_note: string | null;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
};

export const isWaste = (template: Template) => template !== "assessoria";

/* Modelos ------------------------------------------------------------------- */

export const TEMPLATES: Record<Template, { label: string; short: string; description: string }> = {
  residuos_classe_i: {
    label: "Resíduos Classe I",
    short: "Classe I",
    description: "Coleta, transporte e destinação de resíduos Classe I, com preço por peso e frete.",
  },
  residuos_cacamba: {
    label: "Resíduos Classe II",
    short: "Classe II",
    description: "Coleta e destinação de resíduo classe II com valor por caçamba + frete. Base: RESD 159/26 (MARFORTE).",
  },
  residuos_peso: {
    label: "Resíduos Classe I e II",
    short: "Classe I e II",
    description: "Classe I (mix de sólidos) e Classe II (madeira, RCC, recicláveis, orgânico) com valor por kg/m³ + frete. Base: RESD 152/26 (T-GRÃO).",
  },
  assessoria: {
    label: "Assessoria ambiental",
    short: "Assessoria",
    description: "Gestão de CADRIs, SIGOR/MTR, CDFs, inspeções e homologações, com mensalidade. Base: RESD 160/26 (MARFORTE).",
  },
};

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const item = (description: string, price: number | null, unit: string, minimum = ""): PriceItem => ({ id: uid(), description, price, unit, minimum });

export const DEFAULT_SCOPE: Omit<ScopeItem, "id" | "enabled">[] = [
  {
    title: "Gestão e acompanhamento de CADRIs",
    text: "Acompanhar a situação dos CADRIs relacionados aos resíduos gerados pela CONTRATANTE, incluindo controle de validade, quantidades autorizadas, movimentações realizadas e saldos disponíveis. Quando necessário, apoiar a preparação e o acompanhamento de novos processos ou de renovações, mediante disponibilização das informações necessárias e aprovação prévia dos custos envolvidos.",
  },
  {
    title: "Planilha mensal de gerenciamento",
    text: "Elaborar e manter planilha de controle mensal, contemplando, conforme as informações fornecidas e os documentos disponíveis: identificação e classificação dos resíduos, destinador, CADRI relacionado, validade, quantidade autorizada, quantidade destinada, saldo, número do MTR e respectivo CDF.",
  },
  {
    title: "Gestão do SIGOR/MTR",
    text: "Prestar suporte no cadastro, na atualização e no gerenciamento das informações da CONTRATANTE no sistema SIGOR/MTR, abrangendo, conforme aplicabilidade, emissão, correção e cancelamento de MTRs; acompanhamento das movimentações; conferência do recebimento das cargas; acompanhamento dos CDFs; e elaboração e transmissão das DMRs pertinentes.",
  },
  {
    title: "Caracterização e classificação de resíduos",
    text: "Quando houver necessidade técnica, apoiar a cotação de ensaios e laudos de caracterização e classificação junto a laboratórios acreditados conforme a ABNT NBR ISO/IEC 17025, observando a ABNT NBR 10004 e demais referências aplicáveis. A contratação dos ensaios e os respectivos custos dependerão de aprovação prévia da CONTRATANTE.",
  },
  {
    title: "Programação e acompanhamento de remoções",
    text: "Apoiar a programação das remoções de resíduos, orientar quanto à documentação necessária para cada transporte e alinhar as etapas operacionais com os responsáveis indicados pela CONTRATANTE.",
  },
  {
    title: "Procedimentos operacionais",
    text: "Orientar e, conforme as necessidades identificadas, elaborar procedimentos relacionados à segregação, identificação, acondicionamento, caracterização, movimentação interna e remoção dos resíduos desde os pontos de geração até as baias ou áreas de armazenamento temporário.",
  },
  {
    title: "CDFs e encerramento documental de CADRIs",
    text: "Solicitar e acompanhar a disponibilização dos Certificados de Destinação Final (CDFs), conferir as informações documentais e apoiar o encerramento e o arquivamento dos registros vinculados a cada processo de CADRI.",
  },
  {
    title: "Inspeções ambientais",
    text: "Realizar visitas técnicas periódicas aos pontos de geração, baias, centrais e áreas de armazenamento temporário de resíduos, verificando, conforme aplicabilidade, segregação, identificação, compatibilidade química, condições dos recipientes, cobertura, contenção, impermeabilização, drenagem, sinalização, controle de acesso, prevenção de incêndios, capacidade de armazenamento e cumprimento dos prazos internos. As oportunidades de melhoria e eventuais não conformidades identificadas serão comunicadas à CONTRATANTE.",
  },
  {
    title: "Homologação ambiental de prestadores",
    text: "Apoiar a homologação e a atualização cadastral de transportadores, intermediários, armazenadores temporários, receptores e destinadores de resíduos, verificando, conforme a atividade e a documentação aplicável, licenças e autorizações ambientais, CADRI, cadastro no SIGOR, CNPJ, CNAE, Alvará, AVCB/CLCB, documentação ANTT, documentos dos veículos e demais registros pertinentes.",
  },
  {
    title: "Verificação da regularidade dos destinadores",
    text: "Verificar a compatibilidade entre as autorizações e licenças ambientais dos destinadores e os resíduos encaminhados, considerando os tipos ou códigos de resíduos, as atividades autorizadas de recebimento e armazenamento, os tratamentos permitidos e as tecnologias de destinação ambientalmente licenciadas.",
  },
];

export const DEFAULT_DELIVERABLES = [
  "Planilha mensal de gerenciamento",
  "Controle de CADRIs",
  "MTRs e controles de movimentação",
  "CDFs e fechamento documental",
  "DMRs e declarações aplicáveis",
];

export const defaultOperationalResources = "Serão disponibilizados os recursos operacionais necessários à realização das atividades contratadas.";

export function wasteServiceDescription(c: WasteContent, template: Template) {
  const residue = c.waste_summary.trim() || (template === "residuos_classe_i" ? "resíduos classe I" : "resíduos");
  const site = c.site.trim();
  return `coleta, transporte e destinação final de ${residue}${site ? `, armazenados em ${site}` : ""}.`;
}

export function idleFeeClause(fee: number | null) {
  return fee == null ? "" : `Caso não haja movimentação no mês, será cobrado o valor de uma movimentação (${money(fee)} por caçamba).`;
}

export function paymentTerms(content: WasteContent) {
  return content.payment_terms ?? `Faturamento ${content.billing === "mensal" ? "mensal" : "por serviço"}, com emissão de nota fiscal e boleto bancário com vencimento em ${content.due_days} dias após a execução do serviço.`;
}

export function defaultContent(template: Template): WasteContent | ConsultingContent {
  if (template === "assessoria")
    return {
      scope: DEFAULT_SCOPE.map((s) => ({ ...s, id: uid(), enabled: true })),
      deliverables: [...DEFAULT_DELIVERABLES],
      monthly_price: null,
      term_months: 12,
      due_days: 15,
      adjustment_index: "IPCA / IGP-M",
      extra_notes: "",
    };
  if (template === "residuos_cacamba")
    return {
      waste_summary: "",
      site: "",
      equipment: "",
      groups: [
        {
          id: uid(),
          title: "",
          items: [item("", null, "caçamba"), item("", null, "caçamba")],
        },
      ],
      rental_days: null,
      idle_fee: 650,
      separate_wastes: false,
      billing: "mensal",
      due_days: 10,
      extra_notes: "",
    };
  const groups: PriceGroup[] = [{
    id: uid(),
    title: "Resíduo Classe I",
    items: [item("Mix de sólidos diversos contaminados", null, "kg", "1 tonelada"), item("Frete", null, "viagem")],
  }];
  if (template === "residuos_peso") {
    groups.push({
      id: uid(),
      title: "Resíduo Classe II",
      items: [
        item("Madeira", null, "m³", "Capacidade do equipamento"),
        item("RCC (entulho)", null, "kg", "1 tonelada"),
        item("Recicláveis", null, "kg", "1 tonelada"),
        item("Orgânico", null, "kg", "1 tonelada"),
        item("Frete caçamba 5 m³", null, "viagem"),
      ],
    });
  }
  return {
    waste_summary: "",
    site: "sua área operacional",
    equipment: "",
    groups,
    rental_days: 15,
    idle_fee: null,
    separate_wastes: true,
    billing: "por_servico",
    due_days: 15,
    extra_notes: "",
  };
}

export const defaultSubject = (template: Template) =>
  template === "assessoria" ? "Assessoria ambiental" : `Destinação final de resíduos ${TEMPLATES[template].short.replace("Classe", "classe")}`;

/* Formatação ---------------------------------------------------------------- */

export const proposalCode = (p: Pick<ProposalFields, "number" | "year">) => `RESD ${String(p.number).padStart(3, "0")}/${String(p.year).slice(-2)}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const validUntil = (p: Pick<ProposalFields, "issued_on" | "validity_days">) => addDays(p.issued_on, p.validity_days);
export const shortDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "—" : BRL.format(value).replace(/\u00a0/g, " "));
export const priceLabel = (i: Pick<PriceItem, "price" | "unit">) => (i.price == null ? "A combinar" : `${money(i.price)} / ${i.unit}`);

/** Lê "1.234,56", "1234.56" ou "800" como número. Vazio vira null. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
export const moneyInput = (value: number | null | undefined) =>
  value == null ? "" : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Valor por extenso (reais) ------------------------------------------------- */

const UNITS_W = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS_W = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS_W = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function under1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS_W[h]);
  if (rest < 20) {
    if (rest) parts.push(UNITS_W[rest]);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(u ? `${TENS_W[t]} e ${UNITS_W[u]}` : TENS_W[t]);
  }
  return parts.join(" e ");
}

function integerWords(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "um milhão" : `${under1000(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${under1000(thousands)} mil`);
  if (rest) parts.push(under1000(rest));
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: mil e quinhentos).
  if (parts.length > 1 && (rest < 100 || rest % 100 === 0) && rest) {
    const last = parts.pop()!;
    return `${parts.join(" ")} e ${last}`;
  }
  return parts.join(" ");
}

export function moneyInWords(value: number): string {
  const cents = Math.round(value * 100);
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais) parts.push(`${integerWords(reais)}${reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  if (c) parts.push(`${integerWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.join(" e ") || "zero reais";
}

/* Situação ------------------------------------------------------------------ */

export type DisplayStatus = ProposalStatus | "vencida";
export const displayStatus = (p: Pick<Proposal, "status" | "issued_on" | "validity_days">): DisplayStatus =>
  p.status === "enviada" && validUntil(p) < todayIso() ? "vencida" : p.status;

export const STATUS_META: Record<DisplayStatus, { label: string; className: string; tone: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground", tone: "text-muted-foreground" },
  enviada: { label: "Aguardando resposta", className: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200", tone: "text-sky-600 dark:text-sky-300" },
  vencida: { label: "Validade vencida", className: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200", tone: "text-amber-600 dark:text-amber-300" },
  aprovada: { label: "Aprovada", className: "bg-primary/12 text-primary", tone: "text-primary" },
  recusada: { label: "Recusada", className: "bg-destructive/10 text-destructive", tone: "text-destructive" },
};

export const HISTORY_LABEL: Record<HistoryEntry["status"], string> = {
  criada: "Proposta criada",
  editada: "Proposta editada",
  rascunho: "Voltou para rascunho",
  enviada: "Enviada ao cliente",
  aprovada: "Aprovada pelo cliente",
  recusada: "Recusada pelo cliente",
};

/** Resumo de valor para a lista (mensalidade ou primeiro preço). */
export function valueSummary(p: Pick<ProposalFields, "template" | "content">): string {
  if (p.template === "assessoria") {
    const c = p.content as ConsultingContent;
    return c.monthly_price != null ? `${money(c.monthly_price)}/mês` : "";
  }
  const c = p.content as WasteContent;
  const n = c.groups?.reduce((sum, g) => sum + g.items.length, 0) ?? 0;
  return n ? `${n} ${n === 1 ? "item" : "itens"} de preço` : "";
}

/** Nome do arquivo no padrão já usado: "RESD 152-26 - T-GRÃO - Destinação….pdf". */
export const proposalFileName = (p: Pick<ProposalFields, "number" | "year" | "client_name" | "subject">) =>
  `${proposalCode(p).replace("/", "-")} - ${p.client_name.trim() || "Cliente"} - ${p.subject.trim() || "Proposta"}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");

/* Dados --------------------------------------------------------------------- */

export const PROPOSAL_COLUMNS =
  "id,client_id,service_address,year,number,template,status,issued_on,issue_city,validity_days,subject,client_name,client_cnpj,client_city,client_phone,client_email,client_contact,content,sent_on,decided_on,decision_note,history,created_at,updated_at";

/**
 * Acesso aos dados. Em desenvolvimento (npm run dev), se a tabela ainda não
 * existir no Supabase, as propostas ficam guardadas neste navegador para dar
 * para testar a tela. No sistema publicado isso nunca acontece.
 */
const LOCAL_KEY = "residual-proposals-local-v1";
let localMode = false;
export const isLocalMode = () => localMode;
const readLocal = (): Proposal[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as Proposal[];
  } catch {
    return [];
  }
};
const writeLocal = (rows: Proposal[]) => localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
const sortRows = (rows: Proposal[]) => [...rows].sort((a, b) => b.year - a.year || b.number - a.number);
const fallBackToLocal = (error: unknown) => {
  if (import.meta.env.DEV && isMissingTable(error)) localMode = true;
  return localMode;
};
const duplicateError = () => Object.assign(new Error("duplicate"), { code: "23505" });

export const proposalsDb = {
  async list(): Promise<Proposal[]> {
    if (!localMode) {
      const { data, error } = await table("proposals").select(PROPOSAL_COLUMNS).order("year", { ascending: false }).order("number", { ascending: false });
      if (!error) return (data ?? []) as Proposal[];
      if (!fallBackToLocal(error)) throw error;
    }
    return sortRows(readLocal());
  },
  async get(id: string): Promise<Proposal | null> {
    if (!localMode) {
      const { data, error } = await table("proposals").select(PROPOSAL_COLUMNS).eq("id", id).maybeSingle();
      if (!error) return (data ?? null) as Proposal | null;
      if (!fallBackToLocal(error)) throw error;
    }
    return readLocal().find((p) => p.id === id) ?? null;
  },
  async insert(row: Partial<Proposal> & ProposalFields): Promise<string> {
    if (!localMode) {
      const { data, error } = await table("proposals").insert(row).select("id").single();
      if (!error) return data.id as string;
      if (!fallBackToLocal(error)) throw error;
    }
    const rows = readLocal();
    if (rows.some((p) => p.year === row.year && p.number === row.number)) throw duplicateError();
    const now = new Date().toISOString();
    const created: Proposal = { status: "rascunho", sent_on: null, decided_on: null, decision_note: null, history: [], ...row, id: uid(), created_at: now, updated_at: now };
    writeLocal([...rows, created]);
    return created.id;
  },
  async update(id: string, patch: Partial<Proposal>): Promise<void> {
    if (!localMode) {
      const { error } = await table("proposals").update(patch).eq("id", id).select("id").single();
      if (!error) return;
      if (!fallBackToLocal(error)) throw error;
    }
    const rows = readLocal();
    if (patch.number != null && rows.some((p) => p.id !== id && p.year === (patch.year ?? p.year) && p.number === patch.number)) throw duplicateError();
    writeLocal(rows.map((p) => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p)));
  },
  async remove(id: string): Promise<void> {
    if (!localMode) {
      const { error } = await table("proposals").delete().eq("id", id);
      if (!error) return;
      if (!fallBackToLocal(error)) throw error;
    }
    writeLocal(readLocal().filter((p) => p.id !== id));
  },
};

export function useProposals() {
  return useQuery({ queryKey: ["proposals"], retry: false, queryFn: () => proposalsDb.list() });
}

export function useProposal(id: string | null) {
  return useQuery({ queryKey: ["proposal", id], enabled: !!id, retry: false, queryFn: () => proposalsDb.get(id!) });
}

/** Próximo número do ano. A numeração da Residual em 2026 já estava em 160. */
export const FIRST_NUMBER: Record<number, number> = { 2026: 161 };
export function nextNumber(proposals: Pick<Proposal, "year" | "number">[], year: number) {
  const max = proposals.filter((p) => p.year === year).reduce((m, p) => Math.max(m, p.number), 0);
  return max ? max + 1 : FIRST_NUMBER[year] ?? 1;
}

export async function changeStatus(p: Proposal, status: ProposalStatus, opts: { date: string; note?: string | null; by?: string | null }) {
  const entry: HistoryEntry = { at: new Date().toISOString(), status, note: opts.note || null, by: opts.by || null };
  const patch: Record<string, unknown> = { status, history: [...(p.history ?? []), entry] };
  if (status === "enviada") Object.assign(patch, { sent_on: opts.date, decided_on: null, decision_note: null });
  if (status === "aprovada" || status === "recusada") Object.assign(patch, { decided_on: opts.date, decision_note: opts.note || null, sent_on: p.sent_on ?? opts.date });
  if (status === "rascunho") Object.assign(patch, { sent_on: null, decided_on: null, decision_note: null });
  await proposalsDb.update(p.id, patch as Partial<Proposal>);
}

export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "23505";
