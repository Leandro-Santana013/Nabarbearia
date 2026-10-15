import type { Appointment } from '@/types'
import type { AuthResponse } from '@/services/api'

export interface BarberDashboardProps {
  session?: AuthResponse
}
export interface BarberScheduleProps {
  loading?: boolean
  loadFailed?: boolean
  appointments: Appointment[]
  startedIds: Set<string>
  date: string
  barberName: string
  busy: boolean
  onStart: (appointment: Appointment) => void
  onNoShow: (appointment: Appointment) => void
  onSaveDetails: (appointment: Appointment, details: { client_phone?: string; payment_method?: string; client_note?: string }) => Promise<boolean>
  onComplete: (appointment: Appointment) => void
}
