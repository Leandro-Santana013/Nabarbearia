import { lazy, useEffect, useState } from 'react'
import PublicSite from './PublicSite'
import { navigate } from './lib/access/navigation'
import { isPublicAppPath } from './lib/access/paths'
import { RouteBoundary } from './components/RouteBoundary'

export const navigateTo = navigate

const PublicApp = lazy(() => import('./PublicApp'))
const StaffApp = lazy(() => import('./StaffApp'))
const StyleguideApp = lazy(() => import('./StyleguideApp'))

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const handleLocationChange = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  const cleanPath = currentPath.replace(/\/$/, '')
  if (cleanPath === '/equipe' || cleanPath.startsWith('/equipe/')) return <RouteBoundary routeKey={cleanPath}><StaffApp path={cleanPath} /></RouteBoundary>
  if (cleanPath === '/styleguide' || cleanPath.startsWith('/styleguide/')) {
    return <RouteBoundary routeKey={cleanPath}><StyleguideApp path={cleanPath} /></RouteBoundary>
  }
  if (!isPublicAppPath(cleanPath)) return <PublicSite onNavigate={navigateTo} />
  return <RouteBoundary routeKey={cleanPath}><PublicApp path={cleanPath} /></RouteBoundary>
}
