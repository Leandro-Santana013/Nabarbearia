export interface ServiceInfo {
  id?: string
  durationMinutes?: number
  priceAmount?: number
  title: string
  category: string
  duration: string
  price: string
  description: string
}

export interface Barber {
  id: string
  name: string
  specialty: string
  rating?: string
  reviewCount?: number
  likes?: number
  avatar?: string
  isAny?: boolean
}

export interface ServiceDetailProps {
  service?: ServiceInfo
  barbers?: Barber[]
  initialBarberId?: string
  onBack?: () => void
  onSelectSchedule?: (barber: Barber, service: ServiceInfo) => void
}
