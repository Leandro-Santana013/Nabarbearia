import { describe, expect, it, vi } from 'vitest'
import { createAccessSession } from './session'
import type { AuthResponse } from '../../services/api'

const auth = (id = 'barber', roles: AuthResponse['user']['roles'] = ['barber']): AuthResponse => ({
  user: { id, business_id: 'shop', email: `${id}@test.invalid`, display_name: id, roles },
  csrf_token: id, expires_at: '2026-11-01T00:00:00Z',
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function transport() {
  let expired = () => {}
  const stop = vi.fn(() => { expired = () => {} })
  return {
    authSession: vi.fn<() => Promise<AuthResponse | null>>(async () => auth()),
    logout: vi.fn(async () => {}),
    onSessionExpired: vi.fn((listener: () => void) => { expired = listener; return stop }),
    expire: () => expired(), stop,
  }
}

describe('coordenação do acesso', () => {
  it('compartilha restauração concorrente e aceita atualização de perfil híbrido', async () => {
    const api = transport()
    const first = deferred<AuthResponse | null>()
    api.authSession.mockReturnValueOnce(first.promise)
    const access = createAccessSession(api)
    const left = access.refresh()
    const right = access.refresh()
    expect(left).toBe(right)
    first.resolve(auth('owner', ['owner']))
    await left
    expect(api.authSession).toHaveBeenCalledOnce()
    api.authSession.mockResolvedValueOnce(auth('owner', ['owner', 'barber']))
    await access.refresh()
    expect(access.getSnapshot().session?.user.roles).toEqual(['owner', 'barber'])
  })

  it('restauração anterior não apaga login mais recente', async () => {
    const api = transport()
    const old = deferred<AuthResponse | null>()
    api.authSession.mockReturnValueOnce(old.promise)
    const access = createAccessSession(api)
    const restoring = access.refresh()
    access.accept(auth('new'))
    old.resolve(null)
    await restoring
    expect(access.getSnapshot().session?.user.id).toBe('new')
    expect(access.getSnapshot().checking).toBe(false)
  })

  it('expiração invalida restauração pendente e comunica motivo/destino', async () => {
    const api = transport()
    const expired = vi.fn()
    const access = createAccessSession(api, { onExpired: expired })
    const disconnect = access.connect()
    access.accept(auth())
    const old = deferred<AuthResponse | null>()
    api.authSession.mockReturnValueOnce(old.promise)
    const checking = access.refresh()
    api.expire()
    old.resolve(auth())
    await checking
    expect(access.getSnapshot()).toMatchObject({ session: null, checking: false, notice: expect.stringContaining('expirou') })
    expect(expired).toHaveBeenCalledOnce()
    disconnect()
  })

  it('falha de rede preserva sessão e permite repetir a verificação', async () => {
    const api = transport()
    const access = createAccessSession(api)
    access.accept(auth())
    api.authSession.mockRejectedValueOnce(new Error('offline'))
    await expect(access.refresh()).rejects.toThrow('offline')
    expect(access.getSnapshot()).toMatchObject({ connectionError: true, checking: false, session: auth() })
    await access.refresh()
    expect(access.getSnapshot().connectionError).toBe(false)
  })

  it('cliente restaurado na entrada da equipe é desconectado e recebe aviso', async () => {
    const api = transport()
    api.authSession.mockResolvedValueOnce(auth('client', ['client']))
    const access = createAccessSession(api, { channel: 'staff' })
    await access.refresh()
    expect(api.logout).toHaveBeenCalledOnce()
    expect(access.getSnapshot()).toMatchObject({ session: null, checking: false, notice: expect.stringContaining('exclusivo') })
    expect(() => access.accept(auth('client', ['client']))).toThrow('exclusivo')
  })

  it('logout invalida restauração e só navega depois de sucesso', async () => {
    const api = transport()
    const ended = vi.fn()
    const access = createAccessSession(api, { onLogout: ended })
    access.accept(auth())
    const old = deferred<AuthResponse | null>()
    api.authSession.mockReturnValueOnce(old.promise)
    const checking = access.refresh()
    await access.logout()
    old.resolve(auth())
    await checking
    expect(access.getSnapshot().session).toBeNull()
    expect(ended).toHaveBeenCalledOnce()
  })

  it('logout malsucedido preserva acesso e não navega', async () => {
    const api = transport()
    const ended = vi.fn()
    const access = createAccessSession(api, { onLogout: ended })
    access.accept(auth())
    api.logout.mockRejectedValueOnce(new Error('offline'))
    await expect(access.logout()).rejects.toThrow('offline')
    expect(access.getSnapshot().session).toEqual(auth())
    expect(ended).not.toHaveBeenCalled()
  })

  it('logout anterior não encerra login aceito enquanto aguardava resposta', async () => {
    const api = transport()
    const pending = deferred<void>()
    api.logout.mockReturnValueOnce(pending.promise)
    const access = createAccessSession(api)
    access.accept(auth())
    const ending = access.logout()
    access.accept(auth('new'))
    pending.resolve()
    await ending
    expect(access.getSnapshot().session?.user.id).toBe('new')
  })

  it('desmontagem cancela assinatura e ignora restauração anterior', async () => {
    const api = transport()
    const pending = deferred<AuthResponse | null>()
    api.authSession.mockReturnValueOnce(pending.promise)
    const access = createAccessSession(api)
    const disconnect = access.connect()
    const restoring = access.refresh()
    disconnect()
    pending.resolve(auth('old'))
    await restoring
    expect(access.getSnapshot().session).toBeNull()
    expect(api.stop).toHaveBeenCalledOnce()
    const reconnect = access.connect()
    await access.refresh()
    expect(access.getSnapshot().session?.user.id).toBe('barber')
    reconnect()
  })
})
