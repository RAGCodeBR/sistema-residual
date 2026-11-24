/**
 * Modo temporário "só Documentos".
 *
 * Enquanto estiver `true`, o menu mostra apenas Documentos (no computador e no
 * celular), o início do sistema abre direto nessa tela e as demais áreas
 * redirecionam para ela. Para reativar o sistema completo, troque para `false`.
 */
export const DOCUMENTS_ONLY = true;

/** Documentos da própria empresa (equipe interna). */
export const DOCUMENTS_PATH = "/documentos" as const;
/** Documentos do cliente, no portal (perfil Cliente). */
export const CLIENT_DOCUMENTS_PATH = "/portal/documentos" as const;

/** Propostas comerciais (equipe interna). Liberada também no modo "só Documentos". */
export const PROPOSALS_PATH = "/propostas" as const;
/** Cadastro de Equipamentos: caçambas, veículos e catálogo de tipos (equipe interna). */
export const DUMPSTERS_PATH = "/equipamentos" as const;
/** Áreas internas abertas enquanto DOCUMENTS_ONLY estiver ativo. */
export const isAllowedInternalPath = (pathname: string) =>
  pathname === DOCUMENTS_PATH ||
  pathname === DUMPSTERS_PATH ||
  pathname === PROPOSALS_PATH ||
  pathname.startsWith(`${PROPOSALS_PATH}/`);

/** Tela inicial depois do login. */
export const HOME_PATH = DOCUMENTS_ONLY ? DOCUMENTS_PATH : ("/dashboard" as const);
