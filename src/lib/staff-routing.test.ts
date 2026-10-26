import { describe, expect, it } from 'vitest'
import { isStaff, staffHome, staffPath } from './staff-routing'
import type { UserSession } from '../services/api'

const user = (roles: UserSession['roles']): UserSession => ({ id: '1', business_id: '1', email: 'test@example.test', display_name: 'Teste', roles })
describe('entrada da equipe', () => {
  it('recusa clientes e prioriza gestão para dono híbrido', () => {
    expect(isStaff(user(['client']))).toBe(false)
    expect(staffHome(user(['owner', 'barber']))).toBe('/equipe/gestao/financeiro')
    expect(staffHome(user(['barber']))).toBe('/equipe/barbeiro')
  })
  it('mantém navegação dos painéis dentro da equipe e bloqueia rotas públicas', () => {
    expect(staffPath('/gestao/minha-agenda')).toBe('/equipe/gestao/minha-agenda')
    expect(staffPath('/equipe/barbeiro')).toBe('/equipe/barbeiro')
    expect(staffPath('/login')).toBe('/equipe/login')
    expect(staffPath('/cadastro')).toBe('/equipe/login')
    expect(staffPath('/')).toBe('/equipe/login')
    expect(staffPath('https://example.com')).toBe('/equipe/login')
  })
})
