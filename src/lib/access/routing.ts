import type { UserSession } from '../../services/api'

export type AccessChannel = 'public' | 'staff'

export const isStaff = (user: UserSession) => user.roles.includes('owner') || user.roles.includes('barber')

export function publicHome(user: UserSession): string | null {
  if (user.roles.includes('owner')) return '/gestao/financeiro'
  if (user.roles.includes('barber')) return '/barbeiro'
  if (user.roles.includes('client')) return '/home'
  return null
}

export const staffHome = (user: UserSession) => user.roles.includes('owner') ? '/equipe/gestao/financeiro' : '/equipe/barbeiro'

export function staffPath(path: string): string {
  const legacy = path.replace(/^\/equipe(?=\/|$)/, '')
  if (legacy === '/barbeiro' || legacy.startsWith('/barbeiro/') || legacy === '/gestao' || legacy.startsWith('/gestao/')) return `/equipe${legacy}`
  if (legacy === '/download') return '/equipe/download'
  return '/equipe/login'
}

export function staffDestination(path: string, user: UserSession | null): string {
  if (!user || !isStaff(user)) return '/equipe/login'
  if (path === '/equipe/download') return path
  if (user.roles.includes('owner') && (path === '/equipe/gestao' || path.startsWith('/equipe/gestao/'))) return path
  if (user.roles.includes('barber') && (path === '/equipe/barbeiro' || path.startsWith('/equipe/barbeiro/'))) return path
  return staffHome(user)
}

export const loginPath = (channel: AccessChannel) => channel === 'staff' ? '/equipe/login' : '/login'
