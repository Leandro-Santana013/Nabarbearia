export type UserRole = 'client' | 'barber' | 'owner'

export type AppointmentStatus = 'confirmed' | 'completed' | 'no-show' | 'cancelled'

export interface Service {
  id: string
  name: string
  description: string
  demoOnly: true
}

export interface Barber {
  id: string
  name: string
  initials: string
  specialty: string
  availabilityLabel: string
  demoOnly: true
}

export interface Appointment {
  id: string
  clientName: string
  serviceId: string
  barberId: string
  date: string
  time: string
  status: AppointmentStatus
  /** Demonstration value only. Production must come from the configured catalog. */
  amountCents: number
  source: 'demo'
}

export interface AvailabilityBlock {
  id: string
  barberId: string
  date: string
  time: string
  reason: string
  demoOnly: true
}

export interface AppointmentHistoryEntry {
  id: string
  appointmentId: string
  status: AppointmentStatus
  at: string
  actor: string
}

export interface ServiceExecution {
  appointmentId: string
  startedAt?: string
  completedAt?: string
  notes?: string
}

export interface CommissionSnapshot {
  appointmentId: string
  barberId: string
  rate: number
  amountCents: number
  status: 'pending' | 'eligible'
}

export interface FinancialEntry {
  id: string
  appointmentId: string
  kind: 'revenue' | 'commission'
  amountCents: number
  status: 'pending' | 'posted'
}

export interface DemoState {
  services: Service[]
  barbers: Barber[]
  appointments: Appointment[]
  availabilityBlocks: AvailabilityBlock[]
  appointmentHistory: AppointmentHistoryEntry[]
  serviceExecutions: ServiceExecution[]
  commissionSnapshots: CommissionSnapshot[]
  financialEntries: FinancialEntry[]
}

export interface BookingInput {
  clientName: string
  serviceId: string
  barberId: string
  date: string
  time: string
  amountCents?: number
}
