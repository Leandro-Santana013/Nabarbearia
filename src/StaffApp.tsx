import { useCallback, useEffect, useState } from 'react'
import { api, type AuthResponse } from './services/api'
import { isStaff, staffHome, staffPath } from './lib/staff-routing'
import LoginScreen from './pages/LoginScreen'
import BarberDashboard from './pages/BarberDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import { Button } from './components/ui/button'
import AndroidUpdateGate from './components/AndroidUpdateGate'

function navigate(path: string, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

export default function StaffApp({ path }: { path: string }) {
  return <AndroidUpdateGate><StaffSessionApp path={path} /></AndroidUpdateGate>
}

function StaffSessionApp({ path }: { path: string }) {
  const [downloadRequested] = useState(path === '/equipe/download')
  const [session, setSession] = useState<AuthResponse | null>(null)
  const [checking, setChecking] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [notice, setNotice] = useState('')
  const check = useCallback(async () => {
    setChecking(true)
    setConnectionError(false)
    try {
      const current = await api.authSession()
      if (current && !isStaff(current.user)) {
        await api.logout()
        setNotice('Este acesso é exclusivo para barbeiros e proprietário.')
        setSession(null)
      } else setSession(current)
    } catch {
      setConnectionError(true)
    } finally { setChecking(false) }
  }, [])
  useEffect(() => { void check() }, [check])
  useEffect(() => {
    const expired = () => {
      setSession(null)
      setNotice('Sua sessão expirou. Entre novamente.')
      navigate('/equipe/login', true)
    }
    const resumed = () => { void check() }
    window.addEventListener('staff-session-expired', expired)
    window.addEventListener('staff-resume', resumed)
    return () => {
      window.removeEventListener('staff-session-expired', expired)
      window.removeEventListener('staff-resume', resumed)
    }
  }, [check])
  useEffect(() => {
    if (checking || connectionError) return
    if (!session) {
      if (path !== '/equipe/login') navigate('/equipe/login', true)
      return
    }
    const allowed = path === '/equipe/download' ||
      (session.user.roles.includes('owner') && (path === '/equipe/gestao' || path.startsWith('/equipe/gestao/'))) ||
      (session.user.roles.includes('barber') && (path === '/equipe/barbeiro' || path.startsWith('/equipe/barbeiro/')))
    if (!allowed) navigate(staffHome(session.user), true)
  }, [path, session, checking, connectionError])

  const loggedOut = () => {
    setSession(null)
    setNotice('')
    navigate('/equipe/login', true)
  }
  if (connectionError) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center"><h1 className="text-xl font-semibold">Não foi possível conectar</h1><p>Verifique sua internet e tente novamente.</p><Button onClick={() => void check()}>Tentar novamente</Button></main>
  if (checking) return <main role="status" className="flex min-h-dvh items-center justify-center p-6">Verificando sua sessão…</main>
  if (!session) return <LoginScreen key={notice} staffOnly initialError={notice} onAuthenticated={(value) => {
    setSession(value)
    setNotice('')
    navigate(downloadRequested ? '/equipe/download' : staffHome(value.user), true)
  }} />
  if (path === '/equipe/download') return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"><h1 className="text-xl font-semibold">Aplicativo da equipe</h1><p>Baixe a versão Android e confirme a instalação para atualizar o aplicativo existente.</p><a className="text-primary underline" href="/api/v1/staff/android/apk">Baixar APK Android</a><Button variant="outline" onClick={() => navigate(staffHome(session.user))}>Voltar ao painel</Button></main>
  if (session.user.roles.includes('owner') && path.startsWith('/equipe/gestao')) return <OwnerDashboard session={session} path={path.slice('/equipe'.length)} onNavigate={(target) => navigate(staffPath(target))} onLogout={loggedOut} />
  if (session.user.roles.includes('barber') && path.startsWith('/equipe/barbeiro')) return <BarberDashboard session={session} onLogout={loggedOut} />
  return <main role="status" className="p-6">Abrindo seu painel…</main>
}
