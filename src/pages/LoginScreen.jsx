import { useId, useRef, useState } from "react"
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApiError, api } from "@/services/api"
import { BARBERSHOP_INFO, WHATSAPP_URL } from "@/data/barbershopData"

const inputClass = "h-11 rounded-xl! border-gray-200! bg-white! px-3.5! py-2.5! text-base! sm:text-sm! outline-none! focus:border-primary! focus:shadow-[0_0_0_1px_var(--primary)]!"

/** @param {import("./LoginScreen.types").LoginScreenProps} props */
export default function LoginScreen({
  initialMode = "login", initialError = "", onAuthenticated, onGuest, onGoogleSignIn, staffOnly = false,
} = {}) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const submittingRef = useRef(false)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const id = useId()
  const isRegister = !staffOnly && mode === "register"
  const supportUrl = `${WHATSAPP_URL}?text=${encodeURIComponent(`Olá! Preciso de ajuda para acessar minha conta na ${BARBERSHOP_INFO.name}.`)}`

  function authenticated(session) {
    setPassword("")
    if (onAuthenticated) onAuthenticated(session)
    else window.location.assign("/home")
  }

  async function authenticate(social = false) {
    if (submittingRef.current || (social && !onGoogleSignIn)) return
    submittingRef.current = true
    setBusy(true)
    setError("")
    try {
      const session = staffOnly
        ? await api.staffLogin(email.trim(), password)
        : social
        ? await onGoogleSignIn()
        : isRegister
          ? await api.register(email.trim(), password, name.trim())
          : await api.login(email.trim(), password)
      authenticated(session)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Não foi possível acessar sua conta. Tente novamente.")
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  function changeMode() {
    setMode(isRegister ? "login" : "register")
    setPassword("")
    setShowPassword(false)
    setError("")
    requestAnimationFrame(() => (isRegister ? emailRef : nameRef).current?.focus())
  }

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between gap-6 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
        <header className="mt-6 flex flex-col items-center gap-2 text-center">
          <div aria-hidden="true" className="mb-2 flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-md shadow-blue-500/15">NA</div>
          <h1 className="text-xl leading-tight font-bold">{staffOnly ? "Acesso da equipe" : isRegister ? "Crie sua conta" : "Bem-vindo de volta!"}</h1>
          <p className="max-w-64 text-xs leading-relaxed text-gray-500">
            {staffOnly ? "Entre com sua conta de barbeiro ou proprietário da NA Barbearia." : isRegister ? `Cadastre-se para agendar e acompanhar seus serviços na ${BARBERSHOP_INFO.name}.` : `Acesse sua conta para agendar e acompanhar seus serviços na ${BARBERSHOP_INFO.name}.`}
          </p>
        </header>

        <section aria-label={isRegister ? "Cadastro de cliente" : "Acesso à conta"} className="my-auto flex flex-col gap-4 py-5">
          {!staffOnly && <div>
            <Button type="button" variant="outline" disabled={busy || !onGoogleSignIn} onClick={() => authenticate(true)} aria-describedby={!onGoogleSignIn ? `${id}-google-status` : undefined} className="h-11 w-full gap-2.5 rounded-xl border-gray-200 bg-white px-4 py-2.5 text-xs! font-semibold! text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
              <img src="/icons/google.svg" alt="" aria-hidden="true" className="size-4" />
              Continuar com o Google
            </Button>
            {!onGoogleSignIn && <p id={`${id}-google-status`} className="mt-1.5 text-center text-[11px] text-gray-400">Acesso com Google ainda não disponível.</p>}
          </div>}
          {!staffOnly && <div className="my-1 flex items-center gap-3">
            <span aria-hidden="true" className="flex-1 border-t border-gray-200" />
            <span className="text-[11px] font-medium text-gray-400">{isRegister ? "ou cadastre-se com e-mail" : "ou entre com e-mail"}</span>
            <span aria-hidden="true" className="flex-1 border-t border-gray-200" />
          </div>}
          {error && <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-white p-3"><AlertDescription className="text-xs leading-relaxed text-destructive">{error}</AlertDescription></Alert>}

          <form onSubmit={(event) => { event.preventDefault(); void authenticate() }} aria-busy={busy} className="space-y-3">
            {isRegister && (
              <div className="space-y-1">
                <label htmlFor={`${id}-name`} className="block text-xs font-semibold text-gray-700">Nome completo</label>
                <Input ref={nameRef} id={`${id}-name`} name="name" autoComplete="name" placeholder="Como você se chama?" required minLength={2} maxLength={120} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor={`${id}-email`} className="block text-xs font-semibold text-gray-700">E-mail</label>
              <Input ref={emailRef} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete={isRegister ? "email" : "username"} autoCapitalize="none" spellCheck={false} placeholder="seu@email.com" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${id}-password`} className="text-xs font-semibold text-gray-700">Senha</label>
                {!isRegister && <a href={supportUrl} target="_blank" rel="noopener noreferrer" aria-label="Esqueceu a senha? Fale com a recepção no WhatsApp (nova aba)" className="rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">Esqueceu?</a>}
              </div>
              <div className="relative">
                <Input id={`${id}-password`} name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="••••••••" minLength={isRegister ? 8 : undefined} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={isRegister ? `${id}-password-hint` : undefined} className={`${inputClass} pr-12!`} />
                <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setShowPassword((previous) => !previous)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} aria-controls={`${id}-password`} className="absolute inset-y-0 right-0 size-11 rounded-xl text-gray-500 transition-colors">
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </Button>
              </div>
              {isRegister && <p id={`${id}-password-hint`} className="text-[11px] text-gray-400">Use pelo menos 8 caracteres.</p>}
            </div>
            <Button type="submit" disabled={busy} className="mt-1 h-12 w-full gap-2 rounded-xl bg-primary px-4 py-3 text-sm! font-semibold! text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              {busy ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Aguarde…</> : isRegister ? "Criar conta" : "Entrar"}
            </Button>
            <p role="status" aria-live="polite" className="sr-only">{busy ? "Acessando sua conta, aguarde." : ""}</p>
          </form>
        </section>

        {!staffOnly && <footer className="mb-2 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-gray-500">
            {isRegister ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
            <button type="button" disabled={busy} onClick={changeMode} className="rounded-sm text-xs! font-bold! text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">{isRegister ? "Entrar" : "Cadastre-se"}</button>
          </p>
          <Button type="button" variant="ghost" disabled={busy} onClick={onGuest ?? (() => window.location.assign("/home"))} className="min-h-11 gap-1 rounded-xl px-3 py-2 text-xs! font-medium! text-gray-400 transition-colors hover:text-gray-600">
            Continuar como visitante <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        </footer>}
      </main>
    </div>
  )
}
