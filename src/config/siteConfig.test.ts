import { describe, expect, it } from 'vitest'
import { siteConfig } from './siteConfig'

describe('public site configuration', () => {
  it('keeps the verified public contact links', () => {
    expect(siteConfig.brandName).toBe('NA Barbearia')
    expect(siteConfig.city).toBe('Santos/SP')
    expect(siteConfig.instagramUrl).toBe('https://www.instagram.com/nabarbeariaa/')
    expect(siteConfig.phone).toBe('(13) 97404-0190')
  })

  it('uses the supplied schedule, including Saturday and closed Sunday', () => {
    expect(siteConfig.hours.find((hours) => hours.days === 'Sábado')).toMatchObject({ open: '10:00', close: '19:00' })
    expect(siteConfig.hours.find((hours) => hours.days === 'Domingo')).toMatchObject({ open: null, close: null, closed: true })
  })
})
