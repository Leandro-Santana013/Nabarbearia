import type { Barber, ServiceInfo } from "./ServiceDetail.types"

export interface DateTimeChoice {
  date: string
  time: string
}

export interface BookingReview extends DateTimeChoice {
  startsAt?: string
  barberId?: string
  service: ServiceInfo
  barber: Barber
  timeZone: string
}

export interface DateTimeSelectionProps {
  service?: ServiceInfo
  barber?: Barber
  initialDate?: string
  initialTime?: string
  onBack?: () => void
  onChangeBarber?: () => void
  onSelectionChange?: (choice: DateTimeChoice) => void
  onReview?: (booking: BookingReview) => void
  onConfirm?: (booking: BookingReview) => void | Promise<void>
  loadAvailability?: (date: string) => Promise<import("@/services/api").AvailabilitySlot[]>
  lockBarber?: boolean
}
