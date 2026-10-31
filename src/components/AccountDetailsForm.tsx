import { useId, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { AccountUpdate } from '../services/api'

export interface AccountDetails {
  display_name: string
  email?: string
  phone?: string
}

export default function AccountDetailsForm({ account, onSave, onCancel, onBusyChange, disabled = false, credentialsEditable = true }: {
  account: AccountDetails
  onSave: (input: AccountUpdate) => Promise<void>
  onCancel: () => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
  credentialsEditable?: boolean
}) {
  const id = useId()
  const pending = useRef(false)
  const [name, setName] = useState(account.display_name)
  const [email, setEmail] = useState(account.email ?? '')
  const [phone, setPhone] = useState(account.phone ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const credentialsChanged = credentialsEditable && (email.trim().toLowerCase() !== account.email || newPassword.length > 0)
  const blocked = disabled || saving

  return <form className="space-y-4" aria-label="Editar informações da conta" aria-busy={saving} onSubmit={async (event) => {
    event.preventDefault()
    if (pending.current || disabled) return
    setError('')
    if (newPassword && newPassword !== confirmation) { setError('A confirmação da nova senha não confere.'); return }
    pending.current = true; setSaving(true); onBusyChange?.(true)
    try {
      await onSave({ display_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(),
        ...(credentialsChanged ? { current_password: currentPassword } : {}), ...(newPassword ? { new_password: newPassword } : {}) })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar as alterações. Tente novamente.')
    } finally {
      pending.current = false; setSaving(false); onBusyChange?.(false)
    }
  }}>
    <h2 className="font-semibold">Informações da Conta</h2>
    <div className="space-y-2">
      <label htmlFor={`${id}-name`} className="block text-sm font-medium">Nome</label>
      <Input autoFocus id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={120} disabled={blocked} value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl" />
    </div>
    {credentialsEditable && <div className="space-y-2">
      <label htmlFor={`${id}-email`} className="block text-sm font-medium">E-mail</label>
      <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} disabled={blocked} value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-2xl" />
    </div>}
    <div className="space-y-2">
      <label htmlFor={`${id}-phone`} className="block text-sm font-medium">Telefone / WhatsApp (opcional)</label>
      <Input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" inputMode="tel" pattern="[0-9]{10,13}" maxLength={13} placeholder="DDD e número, somente números" disabled={blocked} value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-2xl" />
    </div>
    {credentialsEditable && <>
      <div className="space-y-2">
        <label htmlFor={`${id}-new-password`} className="block text-sm font-medium">Nova senha (opcional)</label>
        <Input id={`${id}-new-password`} name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby={`${id}-password-help`} disabled={blocked} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="rounded-2xl" />
        <p id={`${id}-password-help`} className="text-xs text-muted-foreground">Use de 12 a 128 caracteres. Deixe em branco para manter a senha atual.</p>
      </div>
      {newPassword && <div className="space-y-2">
        <label htmlFor={`${id}-confirm-password`} className="block text-sm font-medium">Confirmar nova senha</label>
        <Input id={`${id}-confirm-password`} name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} disabled={blocked} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="rounded-2xl" />
      </div>}
      {credentialsChanged && <div className="space-y-2">
        <label htmlFor={`${id}-current-password`} className="block text-sm font-medium">Senha atual</label>
        <Input id={`${id}-current-password`} name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={blocked} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="rounded-2xl" />
        <p className="text-xs text-muted-foreground">Necessária para alterar e-mail ou senha. As outras sessões da conta serão encerradas.</p>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-end gap-3">
      <Button type="button" variant="outline" disabled={blocked} onClick={onCancel} className="min-h-11 rounded-full px-5">Cancelar</Button>
      <Button type="submit" disabled={blocked || name.trim().length < 2} className="min-h-11 rounded-full px-5">{saving ? 'Salvando…' : 'Salvar alterações'}</Button>
    </div>
  </form>
}
