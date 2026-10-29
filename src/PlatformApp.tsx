import { useEffect } from 'react'
import LoginScreen from './pages/LoginScreen'
import { useAccess } from './lib/access/AccessProvider'
import { AccessDenied, CheckingAccess, ConnectionFailure } from './lib/access/AccessScreen'
import { publicHome } from './lib/access/routing'
import { navigate } from './lib/access/navigation'

// Compatibility entry for /painel and /agendar. Only current panels are reachable.
export default function PlatformApp() {
  const { session, checking, connectionError, notice, accept } = useAccess()
  const destination = session ? publicHome(session.user) : null
  useEffect(() => {
    if (!checking && !connectionError && destination) navigate(destination, true)
  }, [checking, connectionError, destination])
  if (connectionError) return <ConnectionFailure />
  if (checking) return <CheckingAccess />
  if (!session) return <LoginScreen key={notice} initialError={notice} onAuthenticated={accept} />
  if (!destination) return <AccessDenied />
  return <CheckingAccess />
}
