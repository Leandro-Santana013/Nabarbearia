import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { api } from '../../services/api'
import { createAccessSession } from './session'
import { loginPath, publicHome, type AccessChannel } from './routing'
import { navigate } from './navigation'
import { claimLandingIntent, clearLandingIntent, readLandingIntent } from '../booking/landing-intent'

const AccessContext = createContext<ReturnType<typeof createAccessSession> | null>(null)

export function AccessProvider({ children, channel = 'public' }: { children: ReactNode; channel?: AccessChannel }) {
  const [access] = useState(() => createAccessSession(api, {
    channel,
    onLogout: () => { clearLandingIntent(); navigate(loginPath(channel), true) },
    onExpired: () => { clearLandingIntent(); if (channel === 'staff') navigate(loginPath(channel), true) },
  }))
  const snapshot = useSyncExternalStore(access.subscribe, access.getSnapshot, access.getSnapshot)
  useEffect(() => {
    if (snapshot.checking || snapshot.connectionError) return
    if (snapshot.session) {
      if (channel === 'public' && publicHome(snapshot.session.user) === '/home') claimLandingIntent(snapshot.session.user.id)
      else clearLandingIntent()
    } else if (readLandingIntent()?.ownerUserId) clearLandingIntent()
  }, [channel, snapshot.session, snapshot.checking, snapshot.connectionError])
  useEffect(() => {
    const disconnect = access.connect()
    const check = () => { void access.refresh().catch(() => undefined) }
    check()
    window.addEventListener('staff-resume', check)
    return () => { window.removeEventListener('staff-resume', check); disconnect() }
  }, [access])
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
}

export function useAccess() {
  const access = useContext(AccessContext)
  if (!access) throw new Error('Acesso requer AccessProvider')
  const snapshot = useSyncExternalStore(access.subscribe, access.getSnapshot, access.getSnapshot)
  return { ...snapshot, accept: access.accept, refresh: access.refresh, logout: access.logout }
}
