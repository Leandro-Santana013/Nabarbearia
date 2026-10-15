import type { OwnerSummary } from '@/lib/owner-dashboard'
import type { Appointment, Barber, Service, UserRole } from '../types'

const API_BASE_URL = '/api/v1'

export interface UserSession {
  id: string
  business_id: string
  email: string
  display_name: string
  roles: UserRole[]
}

export interface AuthResponse {
  user: UserSession
  csrf_token: string
  expires_at: string
}

export interface AvailabilitySlot {
  barber_id: string
  starts_at: string
  ends_at: string
}

export interface RevenueReport {
  completed_count: number
  revenue_cents: number
  commission_cents: number
  commission_pending_count: number
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'REQUEST_FAILED', status = 400) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export interface AppointmentDto {
  id: string
  business_id: string
  client_user_id: string
  barber_user_id: string
  service_id: string
  starts_at: string
  ends_at: string
  status: 'confirmed' | 'completed' | 'no_show' | 'cancelled'
  price_cents: number
  duration_minutes: number
  client_display_name?: string
  barber_display_name?: string
  service_name?: string
  client_phone?: string | null
  payment_method?: string | null
  client_note?: string | null
  execution_started?: boolean
  commission_cents?: number | null
  rating?: number | null
}

function mapAppointment(appointment: AppointmentDto): Appointment {
  return {
    id: appointment.id,
    clientName: appointment.client_display_name ?? 'Cliente',
    clientUserId: appointment.client_user_id,
    barberId: appointment.barber_user_id,
    barberName: appointment.barber_display_name,
    serviceId: appointment.service_id,
    serviceName: appointment.service_name,
    date: appointment.starts_at,
    time: appointment.starts_at,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    status: appointment.status === 'no_show' ? 'no-show' : appointment.status,
    amountCents: appointment.price_cents,
    durationMinutes: appointment.duration_minutes,
    source: 'api',
    rating: appointment.rating ?? undefined,
    clientPhone: appointment.client_phone ?? undefined,
    paymentMethod: appointment.payment_method ?? undefined,
    clientNote: appointment.client_note ?? undefined,
    executionStarted: appointment.execution_started,
    commissionCents: appointment.commission_cents ?? undefined,
  }
}

class ApiService {
  private csrfToken: string | null = null

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (this.csrfToken) headers.set('X-CSRF-Token', this.csrfToken)

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ApiError(body?.message ?? 'Não foi possível concluir a operação.', body?.code, response.status)
    }
    return body as T
  }

  private setSession(data: AuthResponse) {
    this.csrfToken = data.csrf_token
    return data
  }

  async getHealth(): Promise<boolean> {
    try {
      const body = await this.request<{ status: string }>('/health')
      return body.status === 'ok'
    } catch {
      return false
    }
  }

  async getSetupStatus(): Promise<{ needs_owner: boolean }> {
    return this.request('/setup/status')
  }

  async authSession(): Promise<AuthResponse | null> {
    try {
      return this.setSession(await this.request<AuthResponse>('/auth/session'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.setSession(await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }))
  }

  async register(email: string, password: string, displayName: string): Promise<AuthResponse> {
    return this.setSession(await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    }))
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST', body: '{}' })
    this.csrfToken = null
  }

  async getPublicServices(): Promise<Service[]> {
    const services = await this.request<Array<{
      id: string
      name: string
      description: string
      category: string
      price_cents: number
      duration_minutes: number
      active: boolean
    }>>('/public/services')
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      category: service.category,
      priceCents: service.price_cents,
      durationMinutes: service.duration_minutes,
      active: service.active,
    }))
  }

  async getPublicBarbers(): Promise<Barber[]> {
    const barbers = await this.request<Array<{ id: string; display_name: string; photo_url?: string | null; recommendations?: number }>>('/public/barbers')
    return barbers.map((barber) => ({
      id: barber.id,
      name: barber.display_name,
      initials: barber.display_name.slice(0, 2).toUpperCase(),
      photoUrl: barber.photo_url ?? undefined,
      specialty: 'Barbeiro(a)',
      recommendations: barber.recommendations ?? 0,
      active: true,
    }))
  }

  async getAvailability(serviceId: string, date: string, barberId?: string): Promise<AvailabilitySlot[]> {
    const params = new URLSearchParams({ service_id: serviceId, date })
    if (barberId) params.set('barber_id', barberId)
    return this.request(`/public/availability?${params.toString()}`)
  }

  async listAppointments(range?: { from: string; to: string }): Promise<Appointment[]> {
    const query = range ? `?${new URLSearchParams(range).toString()}` : ''
    const appointments = await this.request<AppointmentDto[]>(`/appointments${query}`)
    return appointments.map(mapAppointment)
  }

  async createAppointment(input: { barber_user_id: string; service_id: string; starts_at: string }): Promise<void> {
    await this.request('/appointments', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(input),
    })
  }

  async bookAppointment(input: { barber_user_id: string; service_id: string; starts_at: string }, idempotencyKey: string): Promise<Appointment> {
    const result = await this.request<AppointmentDto>('/appointments', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
    })
    return mapAppointment(result)
  }

  async rescheduleAppointment(id: string, startsAt: string): Promise<Appointment> {
    const result = await this.request<AppointmentDto>(`/appointments/${encodeURIComponent(id)}/reschedule`, { method: 'PATCH', body: JSON.stringify({ starts_at: startsAt }) })
    return mapAppointment(result)
  }

  async rateAppointment(id: string, score: number): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify({ score }) })
  }

  async cancelAppointment(id: string): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelado pelo usuário' }),
    })
  }

  async startAppointment(id: string): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/start`, { method: 'POST', body: '{}' })
  }

  async completeAppointment(id: string, notes = ''): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    })
  }

  async noShowAppointment(id: string): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/no-show`, { method: 'POST' })
  }

  async createService(input: { name: string; description: string; category?: string; price_cents: number; duration_minutes: number; active?:boolean }): Promise<void> {
    await this.request('/admin/services', {
      method: 'POST',
      body: JSON.stringify({ ...input, active: input.active ?? true }),
    })
  }

  async createBarber(input: { email: string; password: string; display_name: string; photo_url?: string }): Promise<void> {
    await this.request('/admin/barbers', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async createCommissionRule(input: { barberId: string; serviceId?: string; percentage: number }): Promise<void> {
    await this.request('/admin/commission-rules', { method: 'POST', body: JSON.stringify({ barber_user_id: input.barberId, service_id: input.serviceId || undefined, rule_type: 'percent', amount: Math.round(input.percentage * 100) }) })
  }

  async createSchedule(input: { barber_user_id: string; weekday: number; start_minute: number; end_minute: number }): Promise<void> {
    await this.request('/admin/schedules', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async createWalkIn(input: { barber_user_id: string; service_id: string; starts_at: string; client_name: string; client_phone?: string; payment_method?: string; client_note?: string }, key: string): Promise<void> {
    await this.request('/barber/walk-ins', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) })
  }

  async listOwnBlocks(range: { from: string; to: string }): Promise<{ id: string; starts_at: string; ends_at: string; reason?: string }[]> {
    return this.request(`/barber/blocks?${new URLSearchParams(range)}`)
  }

  async createOwnBlock(input: { barber_user_id: string; starts_at_utc: string; ends_at_utc: string; reason: string }): Promise<void> {
    await this.request('/barber/blocks', { method: 'POST', body: JSON.stringify(input) })
  }

  async updateAppointmentDetails(id: string, input: { client_phone?: string; payment_method?: string; client_note?: string }): Promise<void> {
    await this.request(`/appointments/${encodeURIComponent(id)}/details`, { method: 'PATCH', body: JSON.stringify(input) })
  }

  async getOwnerSummary(range: { from:string; to:string }):Promise<OwnerSummary>{ return this.request(`/admin/summary?${new URLSearchParams(range)}`) }
  async getAdminServices():Promise<Service[]>{
    const items=await this.request<{id:string;name:string;description:string;category:string;price_cents:number;duration_minutes:number;active:boolean}[]>('/admin/services')
    return items.map(item=>({id:item.id,name:item.name,description:item.description,category:item.category,priceCents:item.price_cents,durationMinutes:item.duration_minutes,active:item.active}))
  }
  async updateService(service:Service):Promise<void>{await this.request(`/admin/services/${encodeURIComponent(service.id)}`,{method:'PUT',body:JSON.stringify({name:service.name,description:service.description,category:service.category,price_cents:service.priceCents,duration_minutes:service.durationMinutes,active:service.active})})}
  async editBarber(id:string,input:{display_name:string;photo_url?:string;active:boolean}):Promise<void>{await this.request(`/admin/barbers/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(input)})}
  async recordPayout(barberId:string,amount:number,key:string):Promise<void>{await this.request('/admin/payouts',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({barber_user_id:barberId,expected_amount_cents:amount})})}
  async enableHybrid():Promise<void>{await this.request('/admin/my-barber-profile',{method:'POST',body:'{}'})}
  async bulkAgenda(action:'cancel'|'move',changes:{id:string;starts_at?:string;barber_user_id?:string}[]):Promise<void>{await this.request('/admin/agenda/bulk',{method:'POST',body:JSON.stringify({action,changes})})}

  async getRevenueReport(range?: { from: string; to: string }): Promise<RevenueReport> {
    return this.request('/reports/revenue' + (range ? `?${new URLSearchParams(range)}` : ''))
  }
}

export const api = new ApiService()
