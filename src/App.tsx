import { useEffect, useState } from 'react'
import PlatformApp from './PlatformApp'
import PublicSite from './PublicSite'
import ClientApp from './ClientApp'
import StyleguideLayout from '../app/styleguide/layout'
import StyleguidePage from '../app/styleguide/page'
import LoginScreen from './pages/LoginScreen'
import BarberDashboard from './pages/BarberDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import StaffApp from './StaffApp'
import { AccessProvider, useAccess } from './lib/access/AccessProvider'
import { DashboardAccess } from './lib/access/AccessScreen'
import { publicHome } from './lib/access/routing'
import { navigate } from './lib/access/navigation'

export const navigateTo = navigate

const CLIENT_ROUTES = new Set(['/home', '/mobile', '/perfil', '/meus-agendamentos', '/servico', '/detalhes', '/horarios', '/confirmacao'])

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const handleLocationChange = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  const cleanPath = currentPath.replace(/\/$/, '')
  if (cleanPath === '/equipe' || cleanPath.startsWith('/equipe/')) return <StaffApp path={cleanPath} />
  if (cleanPath === '/styleguide' || cleanPath.startsWith('/styleguide/')) {
    return <StyleguideLayout pathname={cleanPath}><StyleguidePage /></StyleguideLayout>
  }
  const accessRoute = CLIENT_ROUTES.has(cleanPath) || ['/painel', '/agendar', '/login', '/entrar', '/cadastro', '/barbeiro', '/gestao'].includes(cleanPath)
    || cleanPath.startsWith('/barbeiro/') || cleanPath.startsWith('/gestao/')
  if (!accessRoute) return <PublicSite onNavigate={navigateTo} />
  return <AccessProvider><PublicRoutes path={cleanPath} /></AccessProvider>
}

function PublicRoutes({ path }: { path: string }) {
  const { accept } = useAccess()
  if (path === '/gestao' || path.startsWith('/gestao/')) return <DashboardAccess role="owner">{(session) => <OwnerDashboard session={session} path={path} onNavigate={navigateTo} />}</DashboardAccess>
  if (CLIENT_ROUTES.has(path)) return <ClientApp path={path} onNavigate={navigateTo} />
  if (path === '/barbeiro' || path.startsWith('/barbeiro/')) return <DashboardAccess role="barber">{(session) => <BarberDashboard session={session} />}</DashboardAccess>
  if (path === '/login' || path === '/entrar' || path === '/cadastro') return <LoginScreen key={path} initialMode={path === '/cadastro' ? 'register' : 'login'}
    onAuthenticated={(session) => { accept(session); navigateTo(publicHome(session.user) ?? '/painel') }} onGuest={() => navigateTo('/home')} />
  return path === '/painel' || path === '/agendar' ? <PlatformApp /> : <PublicSite onNavigate={navigateTo} />
}
