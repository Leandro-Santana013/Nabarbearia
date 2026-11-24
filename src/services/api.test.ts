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

it('cria atendimento da recepção com idempotência e detalhes opcionais', async () => {
  const appointment = {
    id: 'appointment-new',
    business_id: 'shop',
    client_user_id: 'walk-in-client',
    barber_user_id: 'barber-1',
    service_id: 'service-1',
    starts_at: '2026-11-09T18:00:00Z',
    ends_at: '2026-11-09T18:45:00Z',
    status: 'confirmed',
    price_cents: 7500,
    duration_minutes: 45,
  }
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({
      user: { id: 'owner', business_id: 'shop', email: 'owner@test.invalid', display_name: 'Proprietário', roles: ['owner'] },
      csrf_token: 'owner-csrf',
      expires_at: '2026-11-10T00:00:00Z',
    }))
    .mockResolvedValueOnce(Response.json(appointment, { status: 201 }))
  vi.stubGlobal('fetch', fetch)

  await api.login('owner@test.invalid', 'password')
  await expect(api.createOwnerAppointment({
    barber_user_id: 'barber-1',
    service_id: 'service-1',
    starts_at: appointment.starts_at,
    client_name: 'Cliente',
    client_phone: '11999991234',
    payment_method: 'Pix',
    client_note: 'Preferência',
  }, 'owner-appointment-key')).resolves.toMatchObject({
    id: 'appointment-new',
    barberId: 'barber-1',
    serviceId: 'service-1',
    startsAt: appointment.starts_at,
    durationMinutes: 45,
  })
  expect(fetch.mock.calls[1][0]).toBe('/api/v1/admin/appointments')
  expect(fetch.mock.calls[1][1].headers.get('Idempotency-Key')).toBe('owner-appointment-key')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    client_name: 'Cliente',
    client_phone: '11999991234',
    payment_method: 'Pix',
    client_note: 'Preferência',
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

it('compartilha restaurações de sessão concorrentes para preservar o CSRF atual', async () => {
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => { release = resolve })
  const fetch = vi.fn().mockReturnValueOnce(pending)
  vi.stubGlobal('fetch', fetch)

  const first = api.authSession()
  const second = api.authSession()
  release(Response.json({ user: { id: 'owner', roles: ['owner'] }, csrf_token: 'shared-csrf' }))
  await Promise.all([first, second])

  expect(fetch).toHaveBeenCalledOnce()
})

it('carrega os serviços realizados sem gravar nada e converte o pagamento registrado', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
    appointment_id: 'appointment-1',
    status: 'completed',
    execution_started: true,
    recorded: true,
    lines: [
      { service_id: 'corte', service_name: 'Corte masculino', price_cents: 4000, is_original: true },
      { service_id: 'barba', service_name: 'Barba', price_cents: 3000, is_original: false },
    ],
    total_cents: 7000,
    paid_payment_method: 'debit_card',
    paid_at: '2026-11-09T17:00:00Z',
    completed_at: '2026-11-09T17:00:00Z',
  }))
  vi.stubGlobal('fetch', fetch)

  await expect(api.getAppointmentCheckout('appointment-1')).resolves.toEqual({
    appointmentId: 'appointment-1',
    status: 'completed',
    executionStarted: true,
    recorded: true,
    lines: [
      { serviceId: 'corte', serviceName: 'Corte masculino', priceCents: 4000, isOriginal: true },
      { serviceId: 'barba', serviceName: 'Barba', priceCents: 3000, isOriginal: false },
    ],
    totalCents: 7000,
    paidPaymentMethod: 'debit_card',
    paidAt: '2026-11-09T17:00:00Z',
    completedAt: '2026-11-09T17:00:00Z',
    closedByName: undefined,
    version: 0,
    canCorrect: false,
    corrections: [],
  })
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/appointments/appointment-1/services')
  expect(fetch.mock.calls[0][1]?.method).toBeUndefined()
})

it('conclui pelo endpoint de conclusão existente enviando extras, pagamento e total confirmado', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
    id: 'appointment-1',
    business_id: 'shop',
    client_user_id: 'client-1',
    barber_user_id: 'barber-1',
    service_id: 'corte',
    starts_at: '2026-11-09T16:30:00Z',
    ends_at: '2026-11-09T17:00:00Z',
    status: 'completed',
    price_cents: 8500,
    duration_minutes: 30,
    execution_started: true,
    commission_cents: 4250,
  }))
  vi.stubGlobal('fetch', fetch)

  await expect(api.completeAppointmentCheckout('appointment-1', {
    extraServiceIds: ['barba', 'sobrancelha'],
    paymentMethod: 'pix',
    expectedTotalCents: 8500,
  })).resolves.toMatchObject({ status: 'completed', amountCents: 8500, commissionCents: 4250 })
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/appointments/appointment-1/complete')
  expect(fetch.mock.calls[0][1]?.method).toBe('POST')
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    extra_service_ids: ['barba', 'sobrancelha'],
    payment_method: 'pix',
    expected_total_cents: 8500,
  })
})

it('traduz a recusa de conclusão duplicada em mensagem para a gestão', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'ALREADY_COMPLETED', message: 'Appointment is already completed' }, { status: 409 })))
  await expect(api.completeAppointmentCheckout('appointment-1', {
    extraServiceIds: [],
    paymentMethod: 'cash',
    expectedTotalCents: 4000,
  })).rejects.toMatchObject({ code: 'ALREADY_COMPLETED', message: 'Este atendimento já foi concluído. Atualize a agenda.' })
})

it('envia a correção com versão e motivo e converte o histórico devolvido', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({
    appointment_id: 'appointment-1',
    status: 'completed',
    execution_started: true,
    recorded: true,
    lines: [{ service_id: 'corte', service_name: 'Corte masculino', price_cents: 4000, is_original: true }, { service_id: 'barba', service_name: 'Barba', price_cents: 3000, is_original: false }],
    total_cents: 7000,
    paid_payment_method: 'cash',
    paid_at: '2026-11-09T17:00:00Z',
    completed_at: '2026-11-09T17:00:00Z',
    closed_by_name: 'Sorriso',
    version: 5,
    can_correct: true,
    corrections: [{
      id: 'correction-1',
      actor_name: 'Nailton',
      created_at: '2026-11-10T12:00:00Z',
      reason: 'Sobrancelha registrada por engano',
      previous_total_cents: 8500,
      new_total_cents: 7000,
      previous_payment_method: 'pix',
      new_payment_method: 'cash',
      previous_services: [],
      new_services: [],
      added_services: [],
      removed_services: [{ service_id: 'sobrancelha', service_name: 'Sobrancelha', price_cents: 1500 }],
      previous_commission_cents: 4250,
      new_commission_cents: 3500,
      commission_treatment: 'recalculated',
    }],
  }))
  vi.stubGlobal('fetch', fetch)

  const result = await api.correctAppointmentClosing('appointment-1', {
    lines: [{ serviceId: 'corte', priceCents: 4000 }, { serviceId: 'barba', priceCents: 3000 }],
    paymentMethod: 'cash',
    reason: 'Sobrancelha registrada por engano',
    expectedVersion: 4,
  })
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/admin/appointments/appointment-1/corrections')
  expect(fetch.mock.calls[0][1]?.method).toBe('POST')
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    lines: [{ service_id: 'corte', price_cents: 4000 }, { service_id: 'barba', price_cents: 3000 }],
    payment_method: 'cash',
    reason: 'Sobrancelha registrada por engano',
    expected_version: 4,
  })
  expect(result).toMatchObject({ totalCents: 7000, version: 5, canCorrect: true, closedByName: 'Sorriso', paidPaymentMethod: 'cash' })
  expect(result.corrections[0]).toMatchObject({
    actorName: 'Nailton',
    previousTotalCents: 8500,
    newTotalCents: 7000,
    previousPaymentMethod: 'pix',
    newPaymentMethod: 'cash',
    removedServices: [{ serviceId: 'sobrancelha', serviceName: 'Sobrancelha', priceCents: 1500 }],
    commissionTreatment: 'recalculated',
  })
})

it('explica o conflito de versão quando outra pessoa corrigiu antes', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'APPOINTMENT_CHANGED', message: 'changed' }, { status: 409 })))
  await expect(api.correctAppointmentClosing('appointment-1', {
    lines: [{ serviceId: 'corte', priceCents: 4000 }],
    paymentMethod: 'pix',
    reason: 'Ajuste de valor',
    expectedVersion: 1,
  })).rejects.toMatchObject({ code: 'APPOINTMENT_CHANGED', message: 'Este atendimento foi alterado por outra pessoa. Os dados foram recarregados; revise antes de corrigir.' })
})
