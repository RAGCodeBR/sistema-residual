export const statuses = {
  assinatura: "Aguardando assinaturas",
  aguardando: "Aguardando vigência",
  agendado: "Início futuro",
  ativo: "Ativo",
  encerrado: "Encerrado",
};

export type ContractStatus = keyof typeof statuses;

export type ContractRecord = {
  proposal_id: string;
  number: string;
  proposal_number: number;
  year: number;
  client_name: string;
  client_cnpj: string | null;
  subject: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  term_months: number | null;
  customer_signer: string | null;
  customer_signed_on: string | null;
  residual_signer: string | null;
  residual_signed_on: string | null;
  term_clause: string | null;
  status: ContractStatus;
};

/** Cor de cada situação: ponto, selo e destaque do card. */
export const statusTone: Record<ContractStatus | "propostas", { dot: string; badge: string }> = {
  propostas: {
    dot: "bg-orange-500",
    badge: "bg-orange-500/12 text-orange-700 ring-orange-500/25 dark:text-orange-300",
  },
  assinatura: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  },
  aguardando: {
    dot: "bg-sky-500",
    badge: "bg-sky-500/12 text-sky-800 ring-sky-500/25 dark:text-sky-300",
  },
  agendado: {
    dot: "bg-violet-500",
    badge: "bg-violet-500/12 text-violet-800 ring-violet-500/25 dark:text-violet-300",
  },
  ativo: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/12 text-emerald-800 ring-emerald-500/25 dark:text-emerald-300",
  },
  encerrado: {
    dot: "bg-muted-foreground/50",
    badge: "bg-muted text-muted-foreground ring-border",
  },
};

export const todaySaoPaulo = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function daysUntil(iso: string | null) {
  if (!iso) return undefined;
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(todaySaoPaulo())) / 86400000);
}

export function remainingLabel(days: number) {
  if (days < 0) return "Venceu há " + -days + (days === -1 ? " dia" : " dias");
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return "Faltam " + days + " dias";
}

export const signatureCount = (r: ContractRecord) =>
  (r.customer_signer ? 1 : 0) + (r.residual_signer ? 1 : 0);
