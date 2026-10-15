import { useRef, useState } from 'react'
import type { Barber, Service } from '@/types'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function CommissionRuleForm({ barbers, services, onSaved, initialBarberId = '' }: {
  barbers: Barber[]; services: Service[]; initialBarberId?:string; onSaved: () => Promise<void>
}) {
  const [barberId, setBarberId] = useState(initialBarberId)
  const [serviceId, setServiceId] = useState('')
  const [percentage, setPercentage] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  return <Card className="gap-3 rounded-2xl bg-white p-4 shadow-sm ring-0">
    <h2 className="text-sm font-semibold">Comissão por barbeiro e serviço</h2>
    <p className="text-xs text-muted-foreground">O percentual é aplicado ao valor registrado no atendimento. Regras de serviço prevalecem sobre a regra geral do barbeiro. Pendências compatíveis são calculadas ao salvar; comissões já calculadas são preservadas.</p>
    <form onSubmit={async (event) => {
      event.preventDefault()
      if (pending.current) return
      const value = Number(percentage.replace(',', '.'))
      if (!percentage.trim() || !Number.isFinite(value) || value < 0 || value > 100) { setMessage('Informe um percentual entre 0 e 100.'); return }
      pending.current = true; setBusy(true); setMessage('')
      try { await api.createCommissionRule({ barberId, serviceId, percentage: value }); setMessage('Regra salva e pendências compatíveis calculadas.'); await onSaved() }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a regra.') }
      finally { pending.current = false; setBusy(false) }
    }}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold">Barbeiro<select required value={barberId} onChange={(e) => setBarberId(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm!"><option value="">Selecione o profissional</option>{barbers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1 text-xs font-semibold">Serviço<select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm!"><option value="">Todos os serviços (regra geral)</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1 text-xs font-semibold">Comissão (%)<Input required inputMode="decimal" placeholder="Ex.: 50" value={percentage} onChange={(e) => setPercentage(e.target.value)} className="rounded-xl text-sm!" /></label>
        <Button type="submit" className="min-h-11 self-end rounded-xl text-xs!">{busy ? 'Salvando…' : 'Salvar regra de comissão'}</Button>
      </fieldset>
    </form>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </Card>
}
