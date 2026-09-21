import type { DemoState } from '../types'
import type { PersistencePort } from '../domain/ports'

export const DEMO_DATE = '2026-09-22'
export const DEMO_COMMISSION_RATE = 0.4

export const demoState: DemoState = {
  services: [
    {
      id: 'service-cut',
      name: 'Corte clássico',
      description: 'Um serviço de demonstração para validar a escolha de catálogo.',
      demoOnly: true,
    },
    {
      id: 'service-beard',
      name: 'Barba e acabamento',
      description: 'Uma opção demonstrativa para testar a agenda e o fluxo de atendimento.',
      demoOnly: true,
    },
    {
      id: 'service-combo',
      name: 'Corte + barba',
      description: 'Combinação demonstrativa, configurável pelo estabelecimento.',
      demoOnly: true,
    },
  ],
  barbers: [
    {
      id: 'barber-a',
      name: 'Barbeiro A (demo)',
      initials: 'A',
      specialty: 'Cortes e acabamento',
      availabilityLabel: 'Agenda demonstrativa',
      demoOnly: true,
    },
    {
      id: 'barber-b',
      name: 'Barbeiro B (demo)',
      initials: 'B',
      specialty: 'Barba e visagismo',
      availabilityLabel: 'Agenda demonstrativa',
      demoOnly: true,
    },
    {
      id: 'barber-c',
      name: 'Barbeiro C (demo)',
      initials: 'C',
      specialty: 'Cortes clássicos',
      availabilityLabel: 'Agenda demonstrativa',
      demoOnly: true,
    },
  ],
  appointments: [
    {
      id: 'appointment-101',
      clientName: 'Cliente demo 01',
      serviceId: 'service-cut',
      barberId: 'barber-a',
      date: DEMO_DATE,
      time: '09:00',
      status: 'confirmed',
      amountCents: 4500,
      source: 'demo',
    },
    {
      id: 'appointment-102',
      clientName: 'Cliente demo 02',
      serviceId: 'service-beard',
      barberId: 'barber-a',
      date: DEMO_DATE,
      time: '11:00',
      status: 'completed',
      amountCents: 3000,
      source: 'demo',
    },
    {
      id: 'appointment-103',
      clientName: 'Cliente demo 03',
      serviceId: 'service-combo',
      barberId: 'barber-b',
      date: '2026-09-23',
      time: '14:00',
      status: 'confirmed',
      amountCents: 6500,
      source: 'demo',
    },
    {
      id: 'appointment-104',
      clientName: 'Cliente demo 04',
      serviceId: 'service-cut',
      barberId: 'barber-c',
      date: '2026-09-24',
      time: '16:00',
      status: 'no-show',
      amountCents: 4500,
      source: 'demo',
    },
  ],
  availabilityBlocks: [
    {
      id: 'block-1',
      barberId: 'barber-a',
      date: DEMO_DATE,
      time: '13:00',
      reason: 'Bloqueio demonstrativo',
      demoOnly: true,
    },
  ],
  appointmentHistory: [],
  serviceExecutions: [],
  commissionSnapshots: [],
  financialEntries: [],
}

export const cloneDemoState = (): DemoState => structuredClone(demoState)

/** In-memory adapter kept deliberately small so it can be replaced by an API. */
export const demoRepository: PersistencePort = {
  async load() {
    return cloneDemoState()
  },
  async createAppointment(appointment) {
    return appointment
  },
  async updateAppointment(appointment) {
    return appointment
  },
}
