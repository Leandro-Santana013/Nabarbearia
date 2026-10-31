import type { ReactNode } from 'react'
import type { AuthResponse } from '../../services/api'
import LoginScreen from '../../pages/LoginScreen'
import { Button } from '../../components/ui/button'
import { useAccess } from './AccessProvider'
import { navigate } from './navigation'
import { publicHome } from './routing'

export function CheckingAccess() {
  return <main aria-busy="true" aria-label="Carregando" className="min-h-dvh bg-background" />
}

export function ConnectionFailure() {
  const { refresh } = useAccess()
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center"><h1 className="text-xl font-semibold">Não foi possível conectar</h1><p>Verifique sua internet e tente novamente.</p><Button onClick={() => void refresh().catch(() => undefined)}>Tentar novamente</Button></main>
}

export function AccessDenied({ role }: { role?: 'owner' | 'barber' }) {
  const { session } = useAccess()
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-background p-5 text-center"><h1 className="text-xl font-semibold">{role === 'owner' ? 'Área exclusiva do proprietário' : role === 'barber' ? 'Área exclusiva do barbeiro' : 'Acesso indisponível'}</h1><p className="text-sm text-muted-foreground">{role === 'owner' ? 'Sua conta não possui acesso à gestão.' : role === 'barber' ? 'Sua conta não possui acesso à agenda profissional.' : 'Sua conta não possui um perfil de acesso reconhecido.'}</p><Button onClick={() => navigate(session ? publicHome(session.user) ?? '/' : '/')} className="min-h-11 rounded-xl px-4">{role === 'owner' ? 'Voltar ao meu painel' : 'Voltar ao início'}</Button></main>
}

export function DashboardAccess({ role, children }: { role: 'owner' | 'barber'; children: (session: AuthResponse) => ReactNode }) {
  const { session, checking, connectionError, notice, accept } = useAccess()
  if (connectionError) return <ConnectionFailure />
  if (checking) return <CheckingAccess />
  if (!session) return <LoginScreen key={notice} initialError={notice} onAuthenticated={accept} onGuest={() => navigate('/home')} />
  if (!session.user.roles.includes(role)) return <AccessDenied role={role} />
  return children(session)
}
