/**
 * Modo temporário "só Documentos".
 *
 * Enquanto estiver `true`, o menu mostra apenas Documentos (no computador e no
 * celular), o início do sistema abre direto nessa tela e as demais áreas
 * redirecionam para ela. Para reativar o sistema completo, troque para `false`.
 */
export const DOCUMENTS_ONLY = true;

export const DOCUMENTS_PATH = "/portal/documentos" as const;

/** Tela inicial depois do login. */
export const HOME_PATH = DOCUMENTS_ONLY ? DOCUMENTS_PATH : ("/dashboard" as const);
