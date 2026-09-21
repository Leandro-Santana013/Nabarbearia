import type { Appointment, DemoState } from '../types'

/**
 * Boundary for a future API/database adapter. The demo deliberately uses the
 * in-memory adapter; no network or credentials are expected in this MVP.
 */
export interface PersistencePort {
  load(): Promise<DemoState>
  createAppointment(appointment: Appointment): Promise<Appointment>
  updateAppointment(appointment: Appointment): Promise<Appointment>
}

/** Role switch is only a local demo affordance, never an authorization check. */
export interface AuthPort {
  getCurrentUser(): Promise<{ id: string; role: 'client' | 'barber' | 'owner' } | null>
  signIn(): Promise<never>
  signOut(): Promise<void>
}

/** Future adapter for WhatsApp/e-mail/push with retry and delivery logs. */
export interface NotificationPort {
  sendAppointmentConfirmation(appointmentId: string): Promise<{ accepted: boolean; externalId?: string }>
  sendAppointmentUpdate(appointmentId: string): Promise<{ accepted: boolean; externalId?: string }>
}
