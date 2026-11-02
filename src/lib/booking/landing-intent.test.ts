import { describe, expect, it } from 'vitest'
import { createLandingIntentStore, LANDING_INTENT_KEY, LANDING_INTENT_TTL } from './landing-intent'

function setup() {
  let clock = 1_000_000
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
  const options = { storage: () => storage, now: () => clock }
  const store = createLandingIntentStore(options)
  return { store, entries, storage, reload: () => createLandingIntentStore(options), advance: (value: number) => { clock += value } }
}

describe('preferência temporária iniciada na landing', () => {
  it('persiste IDs operacionais sem preços, datas ou destinos e sobrevive à recarga', () => {
    const { store, entries, reload } = setup()
    const saved = store.saveLandingIntent({ serviceId: 'svc:api-123', barberId: 'barber/456' }, null)
    expect(saved).toEqual({ version: 1, createdAt: 1_000_000, ownerUserId: null, serviceId: 'svc:api-123', barberId: 'barber/456' })
    expect(JSON.parse(entries.get(LANDING_INTENT_KEY)!)).toEqual(saved)
    expect(reload().readLandingIntent()).toEqual(saved)
  })

  it('vincula a preferência anônima à primeira conta sem renovar a validade', () => {
    const { store, reload, advance } = setup()
    store.saveLandingIntent({ barberId: 'api-barber' }, null)
    advance(60_000)
    expect(store.claimLandingIntent('client-a')).toMatchObject({ ownerUserId: 'client-a', createdAt: 1_000_000 })
    expect(reload().claimLandingIntent('client-a')).toMatchObject({ barberId: 'api-barber' })
    expect(reload().claimLandingIntent('client-b')).toBeNull()
    expect(store.readLandingIntent()).toBeNull()
  })

  it('nova escolha substitui integralmente a anterior e cancelar elimina a preferência', () => {
    const { store, reload } = setup()
    store.saveLandingIntent({ serviceId: 'svc-a', barberId: 'barber-a' }, 'client-a')
    expect(store.saveLandingIntent({ serviceId: 'svc-b' }, 'client-a')).not.toHaveProperty('barberId')
    store.clearLandingIntent()
    expect(reload().readLandingIntent()).toBeNull()
  })

  it('expira em 30 minutos inclusive quando a intenção já foi vinculada', () => {
    const { store, advance, entries } = setup()
    store.saveLandingIntent({ serviceId: 'svc' }, 'client')
    advance(LANDING_INTENT_TTL - 1)
    expect(store.readLandingIntent()).not.toBeNull()
    advance(1)
    expect(store.claimLandingIntent('client')).toBeNull()
    expect(entries.has(LANDING_INTENT_KEY)).toBe(false)
  })

  it.each([
    {}, { serviceId: '' }, { serviceId: ' svc' }, { serviceId: 'a\n' }, { serviceId: 'x'.repeat(129) },
    { serviceId: null }, { serviceId: 12 }, { barberId: '\u0085' }, { serviceId: 'svc', redirect: 'https://evil.example' },
    { serviceId: 'svc', priceCents: 100 }, { serviceId: 'svc', startsAt: '2030-01-01' },
  ])('rejeita seleção inválida ou campos não permitidos: %j', (selection) => {
    const { store, entries } = setup()
    store.saveLandingIntent({ serviceId: 'old' }, null)
    expect(store.saveLandingIntent(selection as Parameters<typeof store.saveLandingIntent>[0], null)).toBeNull()
    expect(entries.has(LANDING_INTENT_KEY)).toBe(false)
  })

  it.each([
    'not-json', 'null', '[]', '{"version":2,"createdAt":1000000,"ownerUserId":null,"serviceId":"svc"}',
    '{"version":1,"createdAt":1000001,"ownerUserId":null,"serviceId":"svc"}',
    '{"version":1,"createdAt":1000000.5,"ownerUserId":null,"serviceId":"svc"}',
    '{"version":1,"createdAt":1000000,"serviceId":"svc"}',
    '{"version":1,"createdAt":1000000,"ownerUserId":null,"serviceId":"svc","redirect":"/gestao"}',
  ])('descarta registros corrompidos ou adulterados: %s', (raw) => {
    const { store, entries } = setup()
    entries.set(LANDING_INTENT_KEY, raw)
    expect(store.readLandingIntent()).toBeNull()
    expect(entries.has(LANDING_INTENT_KEY)).toBe(false)
  })

  it('não recupera um valor anterior quando JSON armazenado é adulterado após leitura', () => {
    const { store, entries } = setup()
    store.saveLandingIntent({ serviceId: 'svc' }, null)
    entries.set(LANDING_INTENT_KEY, '{broken')
    expect(store.readLandingIntent()).toBeNull()
  })

  it('funciona em memória se o navegador bloquear o acesso ao storage', () => {
    const store = createLandingIntentStore({ storage: () => { throw new Error('blocked') } })
    expect(store.saveLandingIntent({ barberId: 'barber' }, null)).not.toBeNull()
    expect(store.claimLandingIntent('client')).toMatchObject({ barberId: 'barber', ownerUserId: 'client' })
    store.clearLandingIntent()
    expect(store.readLandingIntent()).toBeNull()
  })

  it('fallback de escrita não ressuscita um registro antigo; limpar funciona mesmo sem permissão', () => {
    const { storage, entries } = setup()
    entries.set(LANDING_INTENT_KEY, JSON.stringify({ version: 1, createdAt: 1_000_000, ownerUserId: null, serviceId: 'old' }))
    const store = createLandingIntentStore({ now: () => 1_000_000, storage: () => ({ ...storage,
      setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('blocked') },
    }) })
    store.saveLandingIntent({ serviceId: 'new' }, null)
    expect(store.readLandingIntent()).toMatchObject({ serviceId: 'new' })
    store.clearLandingIntent()
    expect(store.readLandingIntent()).toBeNull()
  })

  it('remove a versão anônima antiga se a escrita do vínculo falhar', () => {
    const { storage, entries } = setup()
    entries.set(LANDING_INTENT_KEY, JSON.stringify({ version: 1, createdAt: 1_000_000, ownerUserId: null, barberId: 'barber' }))
    const store = createLandingIntentStore({ now: () => 1_000_000, storage: () => ({ ...storage,
      setItem: () => { throw new Error('quota') },
    }) })
    expect(store.claimLandingIntent('client')).toMatchObject({ ownerUserId: 'client' })
    expect(entries.has(LANDING_INTENT_KEY)).toBe(false)
    expect(store.readLandingIntent()).toMatchObject({ ownerUserId: 'client' })
  })

  it('sem window não falha e cópias retornadas não alteram o registro interno', () => {
    const store = createLandingIntentStore({ storage: () => null })
    const saved = store.saveLandingIntent({ serviceId: 'svc' }, null)!
    saved.serviceId = 'tampered'
    const read = store.readLandingIntent()!
    expect(read.serviceId).toBe('svc')
    read.barberId = 'tampered'
    expect(store.readLandingIntent()).not.toHaveProperty('barberId')
  })
})
