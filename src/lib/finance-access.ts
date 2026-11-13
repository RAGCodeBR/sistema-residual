// Contas confirmadas no projeto Residual. Não confere privilégios pelo nome do perfil.
export function hasRestrictedFinanceAccess(
  userId: string | undefined,
  isAdmin: boolean,
  isClient: boolean,
) {
  return Boolean(userId && !isClient && isAdmin);
}
export function restrictedFinancePermission(
  permission: string,
  userId: string | undefined,
  isAdmin: boolean,
  isClient: boolean,
) {
  if (permission === "finance" || permission === "movement_settings")
    return hasRestrictedFinanceAccess(userId, isAdmin, isClient);
  return null;
}
export function overduePayables<
  T extends { kind: string; deleted_at: string | null; settled_on: string | null; due_on: string },
>(accounts: T[], today: string) {
  return accounts
    .filter((a) => a.kind === "payable" && !a.deleted_at && !a.settled_on && a.due_on < today)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}
// Tudo que exige atenção agora: atrasado ou vencendo hoje.
export function urgentPayables<
  T extends { kind: string; deleted_at: string | null; settled_on: string | null; due_on: string },
>(accounts: T[], today: string) {
  return accounts
    .filter((a) => a.kind === "payable" && !a.deleted_at && !a.settled_on && a.due_on <= today)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}
// Faixa, pop-up e bolinha são exclusivos da conta da Juliana.
export function seesPayableAlerts(userId: string | undefined, hasFinance: boolean) {
  return Boolean(userId && hasFinance);
}
