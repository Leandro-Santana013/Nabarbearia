export const SHOP_TIME_ZONE = 'America/Sao_Paulo'

const clockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function shopClock(now = new Date()) {
  const parts = clockFormat.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export const shopDate = (now = new Date()) => shopClock(now).date
export const shopTime = (instant: string | Date) => shopClock(new Date(instant)).time

function calendarDay(date: string) {
  const day = new Date(`${date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error('Data inválida')
  return day
}

export const weekdayOfDate = (date: string) => calendarDay(date).getUTCDay()
export const formatShopDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(calendarDay(date))

export function shopDates(now = new Date(), count = 14) {
  const today = calendarDay(shopDate(now))
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() + index)
    return day.toISOString().slice(0, 10)
  })
}

export const timePeriod = (time: string) => time < '12:00' ? 'morning' : time < '18:00' ? 'afternoon' : 'evening'
export function hasStarted(date: string, time: string, now = new Date()) {
  const current = shopClock(now)
  return date < current.date || (date === current.date && time <= current.time)
}
