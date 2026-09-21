import { describe, expect, it } from 'vitest'
import { siteConfig } from './siteConfig'

describe('public site configuration', () => {
  it('keeps the verified public contact and booking links', () => {
    expect(siteConfig.brandName).toBe('NA Barbearia')
    expect(siteConfig.city).toBe('Santos/SP')
    expect(siteConfig.bookingUrl).toBe('https://www.trinks.com/na-barbearia')
    expect(siteConfig.instagramUrl).toBe('https://www.instagram.com/nabarbeariaa/')
    expect(siteConfig.phone).toBe('(13) 97404-0190')
  })

  it('does not publish an unverified Saturday schedule', () => {
    expect(siteConfig.hours.map((hours) => hours.days)).toEqual(['Dom', 'Seg–Ter', 'Qua–Sex'])
  })
})
