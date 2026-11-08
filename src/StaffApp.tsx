import { lazy, useEffect, useState } from 'react'
import { isManagement, staffDestination, staffHome, staffPath } from './lib/access/routing'
import { AccessProvider, useAccess } from './lib/access/AccessProvider'
import { CheckingAccess, ConnectionFailure } from './lib/access/AccessScreen'
import { navigate } from './lib/access/navigation'
import LoginScreen from './pages/LoginScreen'
import { Button } from './components/ui/button'
import AndroidUpdateGate from './components/AndroidUpdateGate'
import { useAndroidReady } from './lib/android-startup'
import { RouteBoundary } from './components/RouteBoundary'

const BarberDashboard = lazy(() => import('./pages/BarberDashboard'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))

export default function StaffApp({ path }: { path: string }) {
  return <AndroidUpdateGate><AccessProvider channel="staff"><RouteBoundary routeKey={path}><StaffSessionApp path={path} /></RouteBoundary></AccessProvider></AndroidUpdateGate>
}

function StaffSessionApp({ path }: { path: string }) {
  const [downloadRequested] = useState(path === '/equipe/download')
  const { session, checking, connectionError, notice, accept } = useAccess()
  useAndroidReady(connectionError || (!checking && (!session || path === '/equipe/download')))
  useEffect(() => {
    if (checking || connectionError) return
    const destination = staffDestination(path, session?.user ?? null)
    if (destination !== path) navigate(destination, true)
  }, [path, session, checking, connectionError])

  if (connectionError) return <ConnectionFailure />
  if (checking && !session) return <CheckingAccess />
  if (!session) return <LoginScreen key={notice} staffOnly initialError={notice} onAuthenticated={(value) => {
    accept(value)
    navigate(downloadRequested ? '/equipe/download' : staffHome(value.user), true)
  }} onGoHome={() => navigate('/')} />
  if (path === '/equipe/download') return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"><h1 className="text-xl font-semibold">Aplicativo da equipe</h1><p>Baixe a vers?o Android e confirme a instala??o para atualizar o aplicativo existente.</p><a className="text-primary underline" href="/api/v1/staff/android/apk">Baixar APK Android</a><Button variant="outline" onClick={() => navigate(staffHome(session.user))}>Voltar ao painel</Button></main>
  if (isManagement(session.user) && path.startsWith('/equipe/gestao')) return <OwnerDashboard session={session} path={path.slice('/equipe'.length)} onNavigate={(target) => navigate(staffPath(target))} />
  if (session.user.roles.includes('barber') && path.startsWith('/equipe/barbeiro')) return <BarberDashboard session={session} onManage={() => navigate('/equipe/gestao/financeiro')} />
  return <CheckingAccess />
}
