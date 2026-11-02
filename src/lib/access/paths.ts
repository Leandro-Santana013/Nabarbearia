export const CLIENT_ROUTES = new Set(['/home', '/mobile', '/perfil', '/meus-agendamentos', '/servico', '/detalhes', '/horarios', '/confirmacao'])

export function isPublicAppPath(path: string): boolean {
  return CLIENT_ROUTES.has(path) || ['/painel', '/agendar', '/login', '/entrar', '/cadastro', '/barbeiro', '/gestao'].includes(path)
    || path.startsWith('/barbeiro/') || path.startsWith('/gestao/')
}
