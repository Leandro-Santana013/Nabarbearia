import type { Appointment } from '@/types'
import type { AuthResponse } from '@/services/api'

export interface BarberDashboardProps {
  session: AuthResponse
  onManage?: () => void
}
export interface BarberScheduleProps {
  loading?: boolean
  loadFailed?: boolean
  appointments: Appointment[]
  blocks: { id: string; starts_at: string; ends_at: string; reason?: string; block_type?: string }[]
  recurringBlocks: { id: string; weekday: number; start_minute: number; end_minute: number; reason: string; block_type: string }[]
  startedIds: Set<string>
  date: string
  barberName: string
  busy: boolean
  onStart: (appointment: Appointment) => void
  onNoShow: (appointment: Appointment) => void
  onSaveDetails: (appointment: Appointment, details: { client_phone?: string; payment_method?: string; client_note?: string }) => Promise<boolean>
  onComplete: (appointment: Appointment) => void
}
