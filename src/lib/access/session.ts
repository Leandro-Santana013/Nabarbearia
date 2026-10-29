import type { AuthResponse } from '../../services/api'
import { isStaff, type AccessChannel } from './routing'

interface SessionTransport {
  authSession(): Promise<AuthResponse | null>
  logout(): Promise<void>
  onSessionExpired(listener: () => void): () => void
}

export interface AccessState {
  session: AuthResponse | null
  checking: boolean
  connectionError: boolean
  notice: string
}

export function createAccessSession(transport: SessionTransport, {
  channel = 'public', onLogout = () => {}, onExpired = () => {},
}: { channel?: AccessChannel; onLogout?: () => void; onExpired?: () => void } = {}) {
  let state: AccessState = { session: null, checking: true, connectionError: false, notice: '' }
  let revision = 0
  let inFlight: Promise<AuthResponse | null> | null = null
  const listeners = new Set<() => void>()
  const publish = (next: AccessState) => { state = next; for (const listener of listeners) listener() }
  const ready = (session: AuthResponse | null, notice = '') => publish({ session, checking: false, connectionError: false, notice })

  function accept(session: AuthResponse) {
    if (channel === 'staff' && !isStaff(session.user)) throw new Error('Este acesso é exclusivo para barbeiros e proprietário.')
    revision += 1
    inFlight = null
    ready(session)
  }
  function refresh(): Promise<AuthResponse | null> {
    if (inFlight) return inFlight
    const request = ++revision
    publish({ ...state, checking: true, connectionError: false })
    const task = (async () => {
      try {
        const current = await transport.authSession()
        if (request !== revision) return state.session
        if (current && channel === 'staff' && !isStaff(current.user)) {
          await transport.logout()
          if (request === revision) ready(null, 'Este acesso é exclusivo para barbeiros e proprietário.')
        } else ready(current, current ? '' : state.notice)
        return state.session
      } catch (error) {
        if (request !== revision) return state.session
        publish({ ...state, checking: false, connectionError: true })
        throw error
      }
    })()
    inFlight = task
    const clear = () => { if (inFlight === task) inFlight = null }
    void task.then(clear, clear)
    return task
  }
  async function logout() {
    const request = ++revision
    inFlight = null
    try {
      await transport.logout()
      if (request !== revision) return
      ready(null)
      onLogout()
    } catch (error) {
      if (request === revision) publish({ ...state, checking: false })
      throw error
    }
  }
  function connect() {
    const unsubscribe = transport.onSessionExpired(() => {
      revision += 1
      inFlight = null
      ready(null, 'Sua sessão expirou. Entre novamente para continuar.')
      onExpired()
    })
    return () => { unsubscribe(); revision += 1; inFlight = null }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    accept, refresh, logout, connect,
  }
}
