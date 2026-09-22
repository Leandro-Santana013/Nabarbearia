import { useEffect, useState } from 'react'
import PlatformApp from './PlatformApp'
import PublicSite from './PublicSite'

export function navigateTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  const cleanPath = currentPath.replace(/\/$/, '')
  const isPanelRoute = cleanPath === '/painel' || cleanPath === '/agendar'

  return isPanelRoute ? <PlatformApp /> : <PublicSite onNavigate={navigateTo} />
}
