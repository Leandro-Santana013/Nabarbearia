import type { HeaderNotification } from "@/components/header-notifications"
import type { CatalogService } from "@/data/barbershopData"

export interface HomeProps {
  onSelectService?: (service: CatalogService) => void
  services?: CatalogService[]
  isAuthenticated?: boolean
  onSignIn?: () => void
  userName?: string
  userAvatar?: string
  activeAppointmentCount?: number
  notifications?: HeaderNotification[]
  onNotificationDetails?: (notification: HeaderNotification) => void
  onViewAppointments?: () => void
  onEditProfile?: () => void
  onLogout?: () => void | Promise<void>
  onNotificationClick?: () => void
}
