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

export function navigateTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

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
  if (cleanPath === '/gestao' || cleanPath.startsWith('/gestao/')) return <OwnerDashboard path={cleanPath} onNavigate={navigateTo} />
  if (CLIENT_ROUTES.has(cleanPath)) return <ClientApp path={cleanPath} onNavigate={navigateTo} />
  if (cleanPath === '/barbeiro' || cleanPath.startsWith('/barbeiro/')) return <BarberDashboard />
  if (cleanPath === '/login' || cleanPath === '/entrar' || cleanPath === '/cadastro') {
    return <LoginScreen key={cleanPath} initialMode={cleanPath === '/cadastro' ? 'register' : 'login'}
      onAuthenticated={(session) => navigateTo(session.user.roles.includes('owner') ? '/gestao/financeiro' : session.user.roles.includes('barber') ? '/barbeiro' : '/home')}
      onGuest={() => navigateTo('/home')} />
  }
  if (cleanPath === '/styleguide' || cleanPath.startsWith('/styleguide/')) {
    return <StyleguideLayout pathname={cleanPath}><StyleguidePage /></StyleguideLayout>
  }
  return cleanPath === '/painel' || cleanPath === '/agendar' ? <PlatformApp /> : <PublicSite onNavigate={navigateTo} />
}
