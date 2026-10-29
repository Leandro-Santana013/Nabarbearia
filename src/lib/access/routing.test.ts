import { expect, it } from 'vitest'
import { loginPath, publicHome, staffDestination } from './routing'
import type { UserSession } from '../../services/api'

const user = (roles: UserSession['roles']): UserSession => ({ id: '1', business_id: '1', email: '', display_name: '', roles })

it.each<[UserSession['roles'], string | null]>([
  [['client'], '/home'], [['barber'], '/barbeiro'], [['owner'], '/gestao/financeiro'],
  [['owner', 'barber'], '/gestao/financeiro'], [[], null],
])('destino público para %j é %s', (roles, expected) => {
  expect(publicHome(user(roles))).toBe(expected)
})

it('mantém rotas autorizadas e encaminha acesso de equipe incompatível', () => {
  expect(staffDestination('/equipe/download', null)).toBe('/equipe/login')
  expect(staffDestination('/equipe/download', user(['client']))).toBe('/equipe/login')
  expect(staffDestination('/equipe/download', user(['barber']))).toBe('/equipe/download')
  expect(staffDestination('/equipe/gestao/agenda-geral', user(['owner']))).toBe('/equipe/gestao/agenda-geral')
  expect(staffDestination('/equipe/barbeiro', user(['owner', 'barber']))).toBe('/equipe/barbeiro')
  expect(staffDestination('/equipe/gestao/financeiro', user(['barber']))).toBe('/equipe/barbeiro')
  expect(staffDestination('/equipe/barbeiro', user(['owner']))).toBe('/equipe/gestao/financeiro')
  expect(loginPath('staff')).toBe('/equipe/login')
  expect(loginPath('public')).toBe('/login')
})
