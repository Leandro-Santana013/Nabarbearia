import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shopDate } from '@/lib/barber-schedule'
import './barber-agenda.css'

const timeZone = 'America/Sao_Paulo'
const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'short' })
const fullDate = new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'full' })
const month = new Intl.DateTimeFormat('pt-BR', { timeZone, month: 'long', year: 'numeric' })

export default function BarberAgendaHeader({ name, date, inProgress, paused, busy, loading, onDateChange, onRefresh }: {
  name: string; date: string; inProgress: boolean; paused: boolean; busy: boolean; loading: boolean
  onDateChange: (date: string) => void; onRefresh: () => void
}) {
  const today = shopDate()
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(`${today}T12:00:00-03:00`)
    day.setUTCDate(day.getUTCDate() + index)
    return { day, value: shopDate(day) }
  })
  const selectedIndex = Math.max(0, days.findIndex(({ value }) => value === date))
  const page = Math.floor(selectedIndex / 7)
  const visibleDays = days.slice(page * 7, page * 7 + 7)
  const status = inProgress ? 'Em atendimento' : paused ? 'Em pausa' : 'Disponível'

  return <header className="barber-agenda-header">
    <div className="barber-agenda-greeting">
      <div className="barber-agenda-intro">
        <p className="barber-agenda-eyebrow">Minha agenda</p>
        <h1>Olá, {name}!</h1>
      </div>
      <span className="barber-agenda-status" data-status={inProgress ? 'busy' : paused ? 'paused' : 'available'}>
        <span aria-hidden="true" />{status}
      </span>
    </div>
    <div className="barber-agenda-calendar">
      <div className="barber-agenda-calendar-heading">
        <h2><CalendarDays aria-hidden="true" className="size-4" /><span>{month.formatRange(visibleDays[0].day, visibleDays[6].day)}</span></h2>
        <Button type="button" variant="ghost" size="icon" disabled={loading || busy} onClick={onRefresh} aria-label="Atualizar agenda" title="Atualizar agenda" className="barber-agenda-icon">
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </Button>
      </div>
      <div className="barber-agenda-days" role="group" aria-label="Consultar data">
        {visibleDays.map(({ day, value }) => <Button key={value} type="button" variant="ghost" disabled={busy} aria-pressed={date === value} aria-current={value === today ? 'date' : undefined} aria-label={fullDate.format(day)} onClick={() => onDateChange(value)} className="barber-agenda-day">
          <span className="barber-agenda-weekday">{value === today ? 'Hoje' : weekday.format(day).replace('.', '')}</span>
          <span className="barber-agenda-day-number">{day.getUTCDate()}</span>
        </Button>)}
      </div>
      <div className="barber-agenda-pagination">
        <Button type="button" variant="ghost" size="icon" disabled={busy || page === 0} onClick={() => onDateChange(days[selectedIndex - 7].value)} aria-label="Ver sete dias anteriores" className="barber-agenda-icon"><ChevronLeft aria-hidden="true" className="size-4" /></Button>
        <Button type="button" variant="ghost" disabled={busy || date === today} onClick={() => onDateChange(today)} aria-label="Voltar para hoje" className="barber-agenda-today"><span className="barber-agenda-today-full">Voltar para hoje</span><span className="barber-agenda-today-short" aria-hidden="true">Hoje</span></Button>
        <Button type="button" variant="ghost" size="icon" disabled={busy || page === 1} onClick={() => onDateChange(days[selectedIndex + 7].value)} aria-label="Ver próximos sete dias" className="barber-agenda-icon"><ChevronRight aria-hidden="true" className="size-4" /></Button>
      </div>
    </div>
  </header>
}
