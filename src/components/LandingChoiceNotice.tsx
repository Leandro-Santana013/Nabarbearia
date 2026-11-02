import { useState } from 'react'
import { clearLandingIntent, readLandingIntent } from '../lib/booking/landing-intent'
import { navigate } from '../lib/access/navigation'
import { Button } from './ui/button'

export function LandingChoiceNotice({ summary, onCancel, disabled = false }: { summary?: string; onCancel?: () => void; disabled?: boolean }) {
  const [visible, setVisible] = useState(() => Boolean(readLandingIntent()))
  if (!visible) return null
  return <section data-landing-intent aria-label="Sua escolha no site" className="mx-auto w-full max-w-2xl border-l-4 border-[#00749C] bg-[#EEF8FC] px-4 py-3 text-sm text-[#062D40]">
    <p className="font-semibold">{summary || 'Sua escolha está guardada enquanto você entra ou cria sua conta.'}</p>
    <p className="mt-1 text-xs leading-relaxed">Confira os detalhes e os horários na agenda. A escolha ainda não é uma reserva.</p>
    <Button type="button" variant="ghost" disabled={disabled} className="mt-2 min-h-11 whitespace-normal rounded-lg px-2 text-[#062D40]" onClick={() => {
      clearLandingIntent()
      setVisible(false)
      if (onCancel) onCancel()
      else navigate('/home')
    }}>Cancelar escolha</Button>
  </section>
}
