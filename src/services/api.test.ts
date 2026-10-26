import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => vi.unstubAllGlobals())

it('uma resposta atrasada da sessão anterior não encerra um novo login da equipe', async () => {
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { location: { pathname: '/equipe/barbeiro' }, dispatchEvent })
  const auth = (csrf: string) => new Response(JSON.stringify({
    user: { id: 'barber', business_id: 'shop', email: 'barber@test.invalid', display_name: 'Barbeiro', roles: ['barber'] },
    csrf_token: csrf, expires_at: '2026-11-02T00:00:00Z',
  }))
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { release = resolve })
  const fetch = vi.fn()
    .mockResolvedValueOnce(auth('previous-session'))
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(auth('new-session'))
  vi.stubGlobal('fetch', fetch)
  await api.staffLogin('barber@test.invalid', 'password')
  const stale = api.listAppointments().catch((error: unknown) => error)
  await api.staffLogin('barber@test.invalid', 'password')
  release(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }))
  expect(await stale).toBeInstanceOf(ApiError)
  expect(dispatchEvent).not.toHaveBeenCalled()

  fetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
  await expect(api.listAppointments()).rejects.toBeInstanceOf(ApiError)
  expect(dispatchEvent).toHaveBeenCalledOnce()
  expect(dispatchEvent.mock.calls[0][0].type).toBe('staff-session-expired')
})
