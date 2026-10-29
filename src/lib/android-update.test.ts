import { afterEach, describe, expect, it, vi } from 'vitest'
import { availableAndroidUpdate, installedAndroidVersion } from './android-update'

const release = { version_code: 2002, version_name: '0.2.2', size_bytes: 12000000, sha256: 'a'.repeat(64) }
afterEach(() => vi.unstubAllGlobals())

describe('atualizações Android', () => {
  it('identifica a versão instalada, versões antigas e navegadores comuns', () => {
    expect(installedAndroidVersion('Mozilla Android; wv) NABarbearia/2002')).toBe(2002)
    expect(installedAndroidVersion('Mozilla Android; wv)')).toBe(0)
    expect(installedAndroidVersion('Mozilla Android Chrome/130 Safari/537')).toBeNull()
    expect(installedAndroidVersion('Mozilla Android; wv) NABarbeariaDebug/2002')).toBeNull()
  })
  it('só exige versões mais novas, sem downgrade nem repetição', async () => {
    const fetch = vi.fn(async () => Response.json(release))
    vi.stubGlobal('fetch', fetch)
    expect(await availableAndroidUpdate(2001)).toEqual(release)
    expect(await availableAndroidUpdate(2002)).toBeNull()
    expect(await availableAndroidUpdate(2003)).toBeNull()
    expect(fetch.mock.calls[0]).toBeDefined()
  })
  it('permite continuar quando nenhum APK foi publicado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    expect(await availableAndroidUpdate(2001)).toBeNull()
  })
  it('não libera o painel se a verificação falhar ou o manifesto for inválido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    await expect(availableAndroidUpdate(2001)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...release, version_code: '2002' })))
    await expect(availableAndroidUpdate(2001)).rejects.toThrow()
  })
  it('explica a publicação inválida quando o endpoint devolve HTML ou JSON malformado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html>Site</html>', { headers: { 'Content-Type': 'text/html' } })))
    await expect(availableAndroidUpdate(2001)).rejects.toThrow('A atualização está indisponível no servidor. Tente novamente mais tarde.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{invalid', { headers: { 'Content-Type': 'application/json' } })))
    await expect(availableAndroidUpdate(2001)).rejects.toThrow('Versão de atualização inválida.')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(null)))
    await expect(availableAndroidUpdate(2001)).rejects.toThrow('Versão de atualização inválida.')
  })
})
