import { useEffect, useRef, useState } from 'react'
import { Coffee, Plus, Utensils } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/services/api'
import type { Service } from '@/types'
import { money, shopDate } from '@/lib/barber-schedule'
import './barber-agenda.css'

export default function BarberDayTools({ date, barberId, busy, onRun }: {
  date: string; barberId: string; busy: boolean
  onRun: (action: () => Promise<void>, notice: string) => Promise<boolean>
}) {
  const [mode, setMode] = useState<'walkin' | 'break' | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [serviceError, setServiceError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [payment, setPayment] = useState('Presencial')
  const [service, setService] = useState('')
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState(15)
  const key = useRef({ fingerprint: '', id: '' })
  useEffect(() => { setMode(null); setTime('') }, [date])
  useEffect(() => {
    let active = true
    setServiceError('')
    api.getPublicServices().then((items) => { if (active) setServices(items.filter((item) => item.active !== false)) })
      .catch(() => { if (active) setServiceError('Não foi possível carregar os serviços. Feche e abra o formulário para tentar novamente.') })
    return () => { active = false }
  }, [mode])
  const field = 'h-11 rounded-xl border-gray-200 bg-white text-sm!'
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const starts = new Date(`${date}T${time}:00-03:00`)
    if (!Number.isFinite(starts.getTime()) || starts <= new Date()) {
      await onRun(async () => { throw new Error('Escolha um horário futuro para lançar o atendimento ou a pausa.') }, '')
      return
    }
    const action = mode === 'walkin' ? async () => {
      const input = { barber_user_id: barberId, service_id: service, starts_at: starts.toISOString(), client_name: name.trim(), client_phone: phone.replace(/\D/g, '') || undefined, payment_method: payment, client_note: note.trim() || undefined }
      const fingerprint = JSON.stringify(input)
      if (key.current.fingerprint !== fingerprint) key.current = { fingerprint, id: crypto.randomUUID() }
      await api.createWalkIn(input, key.current.id)
    } : async () => {
      await api.createOwnBlock({ barber_user_id: barberId, starts_at_utc: starts.toISOString(), ends_at_utc: new Date(starts.getTime() + minutes * 60000).toISOString(), reason: minutes === 60 ? 'Almoço' : 'Pausa' })
    }
    if (await onRun(action, mode === 'walkin' ? 'Cliente presencial incluído na agenda.' : 'Pausa bloqueada na agenda.')) {
      setMode(null); setName(''); setPhone(''); setNote(''); key.current = { fingerprint: '', id: '' }
    }
  }
  return <section aria-label="Gestão do dia" className="barber-day-tools space-y-3">
    <div className="barber-day-actions">
      <Button type="button" disabled={busy || date < shopDate()} onClick={() => setMode(mode === 'walkin' ? null : 'walkin')} aria-expanded={mode === 'walkin'} className="barber-day-action barber-day-walkin"><Plus aria-hidden="true" className="size-4" />Novo encaixe</Button>
      <Button type="button" disabled={busy || date < shopDate()} variant="outline" onClick={() => { setMinutes(60); setMode('break') }} aria-expanded={mode === 'break' && minutes === 60} className="barber-day-action"><Utensils aria-hidden="true" className="size-4" /><span>Almoço <small>1h</small></span></Button>
      <Button type="button" disabled={busy || date < shopDate()} variant="outline" onClick={() => { setMinutes(15); setMode('break') }} aria-expanded={mode === 'break' && minutes === 15} className="barber-day-action"><Coffee aria-hidden="true" className="size-4" /><span>Pausa <small>15 min</small></span></Button>
    </div>
    {mode && <Card className="gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-0">
      <h2 className="text-sm font-semibold">{mode === 'walkin' ? 'Novo atendimento presencial' : `Bloquear ${minutes} minutos`}</h2>
      <p className="text-xs text-muted-foreground">{mode === 'walkin' ? 'Preço e duração seguem o serviço escolhido. O encaixe respeita a disponibilidade da agenda.' : 'A pausa impede novas reservas e não pode sobrepor atendimentos confirmados.'}</p>
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={busy} className="space-y-3">
          {mode === 'walkin' && <>
            <label className="block space-y-1 text-xs font-semibold">Nome do cliente<Input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="name" /></label>
            <label className="block space-y-1 text-xs font-semibold">WhatsApp (opcional)<Input type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="DDD + número" autoComplete="tel" /></label>
            <label className="block space-y-1 text-xs font-semibold">Serviço<select required value={service} onChange={(e) => setService(e.target.value)} className={`w-full ${field}`}><option value="">Selecione um serviço</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)} · {item.durationMinutes} min</option>)}</select></label>
            {serviceError && <p role="alert" className="text-xs text-destructive">{serviceError}</p>}
            <label className="block space-y-1 text-xs font-semibold">Pagamento previsto<select value={payment} onChange={(e) => setPayment(e.target.value)} className={`w-full ${field}`}>{['Presencial', 'Pix', 'Cartão'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="block space-y-1 text-xs font-semibold">Observação (opcional)<Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={field} placeholder="Preferências para este atendimento" /></label>
          </>}
          <label className="block space-y-1 text-xs font-semibold">Horário de início · Brasília<Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} /></label>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setMode(null)} className="min-h-11 rounded-xl text-xs!">Fechar</Button><Button type="submit" className="min-h-11 rounded-xl text-xs!">{busy ? 'Salvando…' : mode === 'walkin' ? 'Adicionar à agenda' : 'Confirmar pausa'}</Button></div>
        </fieldset>
      </form>
    </Card>}
  </section>
}
