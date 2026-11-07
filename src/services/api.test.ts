import { afterEach, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => vi.unstubAllGlobals())

it('carrega as escalas do dia e converte a resposta para o modelo da agenda', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL) => Response.json([
      { barber_user_id: 'barber-1', start_minute: 600, end_minute: 1200 },
    ]),
  )
  vi.stubGlobal('fetch', fetch)

  await expect(api.listOwnerSchedules('2026-10-19')).resolves.toEqual([
    { barberId: 'barber-1', startMinute: 600, endMinute: 1200 },
  ])
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/admin/schedules?date=2026-10-19')
})

it('edita um atendimento pela rota de gestão e converte o agendamento salvo', async () => {
  const updated = {
    id: 'appointment-1',
    business_id: 'shop',
    client_user_id: 'client-1',
    barber_user_id: 'barber-2',
    service_id: 'service-2',
    starts_at: '2026-11-09T16:30:00Z',
    ends_at: '2026-11-09T17:15:00Z',
    status: 'confirmed',
    price_cents: 7500,
    duration_minutes: 45,
    client_display_name: 'Cliente',
    barber_display_name: 'Barbeiro',
    service_name: 'Barba',
  }
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({
      user: { id: 'owner', business_id: 'shop', email: 'owner@test.invalid', display_name: 'Proprietário', roles: ['owner'] },
      csrf_token: 'owner-csrf',
      expires_at: '2026-11-10T00:00:00Z',
    }))
    .mockResolvedValueOnce(Response.json(updated))
  vi.stubGlobal('fetch', fetch)

  await api.login('owner@test.invalid', 'password')
  await expect(api.editOwnerAppointment('appointment-1', {
    service_id: 'service-2',
    barber_user_id: 'barber-2',
    starts_at: updated.starts_at,
  })).resolves.toMatchObject({
    id: 'appointment-1',
    serviceId: 'service-2',
    barberId: 'barber-2',
    startsAt: updated.starts_at,
    durationMinutes: 45,
    amountCents: 7500,
  })
  expect(fetch.mock.calls[1][0]).toBe('/api/v1/admin/appointments/appointment-1')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    service_id: 'service-2',
    barber_user_id: 'barber-2',
    starts_at: updated.starts_at,
  })
})

it('diferencia credenciais incorretas de sessão expirada sem perder código/status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 })))
  await expect(api.login('client@test.invalid', 'wrong-password')).rejects.toMatchObject({
    message: 'E-mail ou senha incorretos.', code: 'UNAUTHORIZED', status: 401,
  })
  await expect(api.staffLogin('barber@test.invalid', 'wrong-password')).rejects.toMatchObject({
    message: 'E-mail ou senha incorretos.', code: 'UNAUTHORIZED', status: 401,
  })
  await expect(api.listAppointments()).rejects.toMatchObject({
    message: 'Sua sessão expirou. Entre novamente para continuar.', code: 'UNAUTHORIZED', status: 401,
  })
})

it('explica conflitos de horário em português sem expor o texto técnico', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'SLOT_UNAVAILABLE', message: 'Requested slot is blocked' }, { status: 409 })))
  await expect(api.listAppointments()).rejects.toMatchObject({
    message: 'Este horário está indisponível ou bloqueado. Escolha outro horário.', code: 'SLOT_UNAVAILABLE', status: 409,
    technicalMessage: 'Requested slot is blocked',
  })
})

it('usa mensagens seguras para falhas desconhecidas, rede e timeout', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 'UNKNOWN', message: 'private server error details' }, { status: 500 }))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockRejectedValueOnce(new DOMException('timeout details', 'TimeoutError'))
  vi.stubGlobal('fetch', fetch)
  await expect(api.getPublicServices()).rejects.toMatchObject({ message: 'Não foi possível concluir a operação. Tente novamente.' })
  await expect(api.getPublicServices()).rejects.toMatchObject({ message: 'Não foi possível conectar à barbearia. Verifique sua conexão e tente novamente.', code: 'NETWORK_ERROR' })
  await expect(api.getPublicServices()).rejects.toMatchObject({ message: 'A conexão demorou para responder. Tente novamente.', code: 'REQUEST_TIMEOUT' })
})

it('uma resposta atrasada da sessão anterior não encerra um novo login da equipe', async () => {
  const expired = vi.fn()
  const unsubscribe = api.onSessionExpired(expired)
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
  expect(expired).not.toHaveBeenCalled()

  fetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
  await expect(api.listAppointments()).rejects.toBeInstanceOf(ApiError)
  expect(expired).toHaveBeenCalledOnce()
  unsubscribe()
})

it.each([200, 401])('restauração atrasada HTTP %s não substitui CSRF nem expira um novo login', async (status) => {
  const expired = vi.fn()
  const unsubscribe = api.onSessionExpired(expired)
  const auth = (csrf: string) => Response.json({ user: { id: csrf, roles: ['barber'] }, csrf_token: csrf })
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { release = resolve })
  const fetch = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(auth('fresh-csrf')).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  try {
    const restoring = api.authSession()
    await api.staffLogin('barber@test.invalid', 'password')
    release(status === 200 ? auth('stale-csrf') : Response.json({}, { status }))
    await restoring
    await api.listAppointments()
    expect(fetch.mock.calls[2][1].headers.get('X-CSRF-Token')).toBe('fresh-csrf')
    expect(expired).not.toHaveBeenCalled()
  } finally { unsubscribe() }
})

it('expira sessão sem depender de window ou da rota e permite cancelar assinatura', async () => {
  const expired = vi.fn()
  const unsubscribe = api.onSessionExpired(expired)
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ user: { roles: ['client'] }, csrf_token: 'client-csrf' }))
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ user: { roles: ['client'] }, csrf_token: 'another-csrf' }))
    .mockResolvedValueOnce(Response.json({}, { status: 401 })))
  await api.login('client@test.invalid', 'password')
  await expect(api.listAppointments()).rejects.toBeInstanceOf(ApiError)
  expect(expired).toHaveBeenCalledOnce()
  unsubscribe()
  await api.login('client@test.invalid', 'password')
  await expect(api.listAppointments()).rejects.toBeInstanceOf(ApiError)
  expect(expired).toHaveBeenCalledOnce()
})

it('restaurar a mesma sessão não mascara um 401 concorrente dessa sessão', async () => {
  const expired = vi.fn()
  const unsubscribe = api.onSessionExpired(expired)
  const auth = () => Response.json({ user: { roles: ['barber'] }, csrf_token: 'same-session' })
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { release = resolve })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(auth()).mockReturnValueOnce(pending).mockResolvedValueOnce(auth()))
  try {
    await api.staffLogin('barber@test.invalid', 'password')
    const operation = api.listAppointments().catch((error: unknown) => error)
    await api.authSession()
    release(Response.json({}, { status: 401 }))
    expect(await operation).toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledOnce()
  } finally { unsubscribe() }
})
