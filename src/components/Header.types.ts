import type { HeaderNotification } from "./header-notifications"

export interface HeaderProps {
  userName?: string
  isAuthenticated?: boolean
  onSignIn?: () => void
  userAvatar?: string
  greeting?: string
  notifications?: HeaderNotification[]
  onNotificationDetails?: (notification: HeaderNotification) => void
  activeAppointmentCount?: number
  onNotificationClick?: () => void
  onAvatarClick?: () => void
  onViewAppointments?: () => void
  onEditProfile?: () => void
  onLogout?: () => void | Promise<void>
}
