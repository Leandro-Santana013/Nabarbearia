import { lazy } from 'react'
import PlatformApp from './PlatformApp'
import LoginScreen from './pages/LoginScreen'
import { AccessProvider, useAccess } from './lib/access/AccessProvider'
import { DashboardAccess } from './lib/access/AccessScreen'
import { publicHome } from './lib/access/routing'
import { navigate } from './lib/access/navigation'
import { CLIENT_ROUTES } from './lib/access/paths'
import { RouteBoundary } from './components/RouteBoundary'

const ClientApp = lazy(() => import('./ClientApp'))
const BarberDashboard = lazy(() => import('./pages/BarberDashboard'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))

export default function PublicApp({ path }: { path: string }) {
  // Keep the session provider mounted while an individual destination loads.
  return <AccessProvider><RouteBoundary routeKey={path}><PublicRoutes path={path} /></RouteBoundary></AccessProvider>
}

function PublicRoutes({ path }: { path: string }) {
  const { accept } = useAccess()
  if (path === '/gestao' || path.startsWith('/gestao/')) return <DashboardAccess role="owner">{(session) => <OwnerDashboard session={session} path={path} onNavigate={navigate} />}</DashboardAccess>
  if (CLIENT_ROUTES.has(path)) return <ClientApp path={path} onNavigate={navigate} />
  if (path === '/barbeiro' || path.startsWith('/barbeiro/')) return <DashboardAccess role="barber">{(session) => <BarberDashboard session={session} />}</DashboardAccess>
  if (path === '/login' || path === '/entrar' || path === '/cadastro') return <LoginScreen key={path} initialMode={path === '/cadastro' ? 'register' : 'login'}
    onAuthenticated={(session) => { accept(session); navigate(publicHome(session.user) ?? '/painel') }} onGuest={() => navigate('/home')} />
  return <PlatformApp />
}
