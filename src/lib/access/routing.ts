import type { UserSession } from '../../services/api'

export type AccessChannel = 'public' | 'staff'

export const isManagement = (user: UserSession) =>
  user.roles.includes('admin') || user.roles.includes('super_admin') || user.roles.includes('owner')

export const isSuperAdmin = (user: UserSession) =>
  user.roles.includes('super_admin') || user.roles.includes('owner')

export const isStaff = (user: UserSession) => isManagement(user) || user.roles.includes('barber')

export function publicHome(user: UserSession): string | null {
  if (isSuperAdmin(user)) return '/gestao/financeiro'
  if (isManagement(user)) return '/gestao/agenda-geral'
  if (user.roles.includes('barber')) return '/barbeiro'
  if (user.roles.includes('client')) return '/home'
  return null
}

export const staffHome = (user: UserSession) => isSuperAdmin(user)
  ? '/equipe/gestao/financeiro'
  : isManagement(user) ? '/equipe/gestao/agenda-geral' : '/equipe/barbeiro'

export function staffPath(path: string): string {
  const legacy = path.replace(/^\/equipe(?=\/|$)/, '')
  if (legacy === '/barbeiro' || legacy.startsWith('/barbeiro/') || legacy === '/gestao' || legacy.startsWith('/gestao/')) return `/equipe${legacy}`
  if (legacy === '/download') return '/equipe/download'
  return '/equipe/login'
}

export function staffDestination(path: string, user: UserSession | null): string {
  if (!user || !isStaff(user)) return '/equipe/login'
  if (path === '/equipe/download') return path
  if (isManagement(user) && (path === '/equipe/gestao' || path.startsWith('/equipe/gestao/'))) {
    if (path === '/equipe/gestao/financeiro' && !isSuperAdmin(user)) return staffHome(user)
    return path
  }
  if (user.roles.includes('barber') && (path === '/equipe/barbeiro' || path.startsWith('/equipe/barbeiro/'))) return path
  return staffHome(user)
}

export const loginPath = (channel: AccessChannel) => channel === 'staff' ? '/equipe/login' : '/login'
