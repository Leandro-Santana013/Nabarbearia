export interface ClientProfile {
  name: string
  phone: string
  email?: string
  avatar?: string
  completedCuts: number
  activeAppointments: number
  favoriteBarber: string
  remindersEnabled: boolean
}

export interface UserProfileProps {
  profile?: ClientProfile
  isDemo?: boolean
  accountEditable?: boolean
  remindersAvailable?: boolean
  onBack?: () => void
  onViewAppointments?: () => void
  onSaveProfile?: (profile: ClientProfile) => void | Promise<void>
  onLogout?: () => void | Promise<void>
}
