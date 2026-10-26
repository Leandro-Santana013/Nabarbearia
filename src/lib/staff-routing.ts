import type { UserSession } from '../services/api'

export const isStaff = (user: UserSession) => user.roles.includes('owner') || user.roles.includes('barber')
export const staffHome = (user: UserSession) => user.roles.includes('owner') ? '/equipe/gestao/financeiro' : '/equipe/barbeiro'

export function staffPath(path: string): string {
  const legacy = path.replace(/^\/equipe(?=\/|$)/, '')
  if (legacy === '/barbeiro' || legacy.startsWith('/barbeiro/') || legacy === '/gestao' || legacy.startsWith('/gestao/')) return `/equipe${legacy}`
  if (legacy === '/download') return '/equipe/download'
  return '/equipe/login'
}
