export interface HeaderNotification {
  id: string
  type: "appointment" | "whatsapp" | "service"
  title: string
  description: string
  time: string
  read: boolean
}

export const DEFAULT_NOTIFICATIONS: HeaderNotification[] = []
