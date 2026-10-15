import type { Barber, ServiceInfo } from "./ServiceDetail.types"

export interface BookingReceipt {
  service: Pick<ServiceInfo, "title" | "price" | "duration">
  barber: Pick<Barber, "id" | "name" | "specialty" | "avatar" | "isAny">
  date: string
  time: string
  timeZone?: string
}

export interface BookingSuccessProps {
  booking?: BookingReceipt
  isDemo?: boolean
  whatsappStatus?: "sent" | "pending" | "failed" | "unavailable"
  onViewAppointments?: () => void
  onGoHome?: () => void
}
