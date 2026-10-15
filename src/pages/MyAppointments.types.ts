import type { BookingReview } from "./DateTimeSelection.types"

export interface ClientAppointment extends BookingReview {
  id: string
  status: "confirmed" | "completed" | "cancelled" | "no-show"
  startsAt?: string
  rating?: number
  whatsappReminderEnabled?: boolean
}

export interface MyAppointmentsProps {
  appointments?: ClientAppointment[]
  isDemo?: boolean
  onBack?: () => void
  onNewBooking?: () => void
  onAppointmentsChange?: (appointments: ClientAppointment[]) => void | Promise<void>
  onReschedule?: (appointment: ClientAppointment) => void
  onRebook?: (appointment: ClientAppointment) => void
  onCancel?: (id: string) => Promise<void>
  onRate?: (id: string, rating: number) => Promise<void>
}
