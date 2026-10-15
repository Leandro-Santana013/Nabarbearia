export type UserRole = 'client' | 'barber' | 'owner'

export type AppointmentStatus = 'confirmed' | 'completed' | 'no-show' | 'cancelled'

export interface Service {
  id: string
  name: string
  description: string
  category: string
  priceCents: number
  durationMinutes: number
  active?: boolean
}

export interface Barber {
  id: string
  name: string
  initials: string
  photoUrl?: string
  specialty?: string
  recommendations?: number
  active?: boolean
}

export interface Appointment {
  id: string
  clientName: string
  clientUserId?: string
  barberId: string
  barberName?: string
  serviceId: string
  serviceName?: string
  date: string
  time: string
  startsAt?: string
  endsAt?: string
  status: AppointmentStatus
  amountCents: number
  durationMinutes?: number
  source?: 'api'
  clientPhone?: string
  paymentMethod?: string
  clientNote?: string
  executionStarted?: boolean
  commissionCents?: number
  rating?: number
}
