import { useId, useRef, useState } from "react"
import { ArrowRight, Check, Circle, Eye, EyeOff, LoaderCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApiError, api } from "@/services/api"
import { BARBERSHOP_INFO, WHATSAPP_URL } from "@/data/barbershopData"
import { LandingChoiceNotice } from "@/components/LandingChoiceNotice"
import { clearLandingIntent } from "@/lib/booking/landing-intent"

const inputClass = "h-12 rounded-xl! border-gray-200! bg-white! px-3.5! py-2.5! text-base! sm:text-sm! outline-none! focus:border-primary! focus:shadow-[0_0_0_1px_var(--primary)]!"
const commonPasswords = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "password123", "password!",
  "password123!", "password1234!", "passw0rd!", "qwerty123", "qwerty123!", "abc12345",
  "abc12345!", "letmein123", "welcome123", "welcome123!", "admin123", "admin123!", "senha123",
  "senha1234", "senha123!", "senha@123", "teste123!", "test1234!", "12345678!", "iloveyou",
  "barbearia123", "barbearia!", "barbearia123!", "nabarbearia!", "nabarbearia123", "nabarbearia123!",
])

function passwordHasUppercase(value) {
  return [...value].some((character) => /\p{Lu}/u.test(character))
}

function passwordHasSymbol(value) {
  return [...value].some((character) => !/[\p{L}\p{N}]/u.test(character) && !/\s/u.test(character))
}

/** @param {import("./LoginScreen.types").LoginScreenProps} props */
export default function LoginScreen({
  initialMode = "login", initialError = "", onAuthenticated, onGuest, onGoogleSignIn, onGoHome, staffOnly = false,
} = {}) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const submittingRef = useRef(false)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const id = useId()
  const isRegister = !staffOnly && mode === "register"
  const supportUrl = `${WHATSAPP_URL}?text=${encodeURIComponent(`Olá! Preciso de ajuda para acessar minha conta na ${BARBERSHOP_INFO.name}.`)}`
  const normalizedPassword = password.toLowerCase()
  const passwordRules = [
    { label: "Entre 8 e 128 caracteres", valid: [...password].length >= 8 && [...password].length <= 128 },
    { label: "Pelo menos uma letra maiúscula", valid: password.length > 0 && passwordHasUppercase(password) },
    { label: "Pelo menos um caractere especial", valid: password.length > 0 && passwordHasSymbol(password) },
    { label: "Sem caracteres de controle", valid: password.length > 0 && !/\p{Cc}/u.test(password) },
    { label: "Não é uma senha comum", valid: password.length > 0 && !commonPasswords.has(normalizedPassword) },
  ]
  const passwordIsValid = passwordRules.every((rule) => rule.valid)
  const passwordsMatch = passwordConfirmation.length > 0 && password === passwordConfirmation

  function authenticated(session) {
    setPassword("")
    setPasswordConfirmation("")
    if (onAuthenticated) onAuthenticated(session)
    else window.location.assign("/home")
  }

  async function authenticate(social = false) {
    if (submittingRef.current || (social && !onGoogleSignIn)) return
    if (!social && isRegister) {
      if (!passwordIsValid) {
        setError("A senha ainda não atende a todos os requisitos.")
        return
      }
      if (password !== passwordConfirmation) {
        setError("As senhas não coincidem.")
        return
      }
    }
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
    setPasswordConfirmation("")
    setShowPassword(false)
    setShowPasswordConfirmation(false)
    setError("")
    requestAnimationFrame(() => (isRegister ? emailRef : nameRef).current?.focus())
  }

  function handleGoHome() {
    clearLandingIntent()
    if (onGoHome) onGoHome()
    else window.location.assign("/")
  }

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased [--primary:#00749C]">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-6">
        <div className="flex h-11 items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={handleGoHome}
            aria-label="Voltar para a página inicial"
            title="Voltar para a página inicial"
            className="login-close group relative size-11 rounded-full p-0 text-gray-700 transition-colors hover:bg-white hover:text-gray-900"
          >
            <X aria-hidden="true" className="size-5" />
            <span id={`${id}-home-tooltip`} role="tooltip" className="login-close-tooltip pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-10 whitespace-nowrap rounded-lg bg-[#111827] px-3 py-2 text-[11px] font-medium text-white shadow-lg">Voltar para a página inicial</span>
          </Button>
        </div>

        <div className="flex flex-1 flex-col justify-center py-8 sm:py-10">
          <header className="flex flex-col items-center gap-3 text-center">
            <img src="/brand/optimized/logo-256.webp" alt="NA Barbearia" width="256" height="256" className="mb-1 size-24 object-contain" />
            <h1 className="text-2xl leading-tight font-bold tracking-[-0.035em] sm:text-[1.75rem]">{staffOnly ? "Acesso da equipe" : isRegister ? "Crie sua conta" : "Bem-vindo de volta!"}</h1>
            <p className="max-w-sm text-sm leading-6 text-gray-600">
            {staffOnly ? "Entre com sua conta de barbeiro, administração ou superadministrador da NA Barbearia." : isRegister ? `Cadastre-se para agendar e acompanhar seus serviços na ${BARBERSHOP_INFO.name}.` : `Acesse sua conta para agendar e acompanhar seus serviços na ${BARBERSHOP_INFO.name}.`}
            </p>
          </header>

          {!staffOnly && <LandingChoiceNotice disabled={busy} />}

          <section aria-label={isRegister ? "Cadastro de cliente" : "Acesso à conta"} className="mt-10 flex flex-col gap-4 sm:mt-12">
          {!staffOnly && <div>
            <Button type="button" variant="outline" disabled={busy || !onGoogleSignIn} onClick={() => authenticate(true)} aria-describedby={!onGoogleSignIn ? `${id}-google-status` : undefined} className="h-12 w-full gap-2.5 rounded-xl border-gray-200 bg-white px-4 py-2.5 text-sm! font-semibold! text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
              <img src="/icons/google.svg" alt="" aria-hidden="true" className="size-4" />
              Continuar com o Google
            </Button>
            {!onGoogleSignIn && <p id={`${id}-google-status`} className="mt-2 text-center text-xs text-gray-600">Acesso com Google ainda não disponível.</p>}
          </div>}
          {!staffOnly && <div className="my-2 flex items-center gap-3">
            <span aria-hidden="true" className="flex-1 border-t border-gray-200" />
            <span className="text-xs font-medium text-gray-600">{isRegister ? "ou cadastre-se com e-mail" : "ou entre com e-mail"}</span>
            <span aria-hidden="true" className="flex-1 border-t border-gray-200" />
          </div>}
          {error && <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-white p-3"><AlertDescription className="text-sm leading-relaxed text-destructive">{error}</AlertDescription></Alert>}

          <form onSubmit={(event) => { event.preventDefault(); void authenticate() }} aria-busy={busy} className="space-y-4">
            {isRegister && (
              <div className="space-y-1.5">
                <label htmlFor={`${id}-name`} className="block text-sm font-semibold text-gray-700">Nome completo</label>
                <Input ref={nameRef} id={`${id}-name`} name="name" autoComplete="name" placeholder="Como você se chama?" required minLength={2} maxLength={120} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor={`${id}-email`} className="block text-sm font-semibold text-gray-700">E-mail</label>
              <Input ref={emailRef} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete={isRegister ? "email" : "username"} autoCapitalize="none" spellCheck={false} placeholder="seu@email.com" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${id}-password`} className="text-sm font-semibold text-gray-700">Senha</label>
                {!isRegister && <a href={supportUrl} target="_blank" rel="noopener noreferrer" aria-label="Esqueceu a senha? Fale com a recepção no WhatsApp (nova aba)" className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">Esqueceu?</a>}
              </div>
              <div className="relative">
                <Input id={`${id}-password`} name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="••••••••" minLength={isRegister ? 8 : undefined} maxLength={isRegister ? 128 : undefined} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={isRegister ? `${id}-password-hint` : undefined} className={`${inputClass} pr-12!`} />
                <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setShowPassword((previous) => !previous)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} aria-controls={`${id}-password`} className="absolute inset-y-0 right-0 size-12 rounded-xl text-gray-600 transition-colors">
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </Button>
              </div>
              {isRegister && <div id={`${id}-password-hint`} className="space-y-2 rounded-xl border border-gray-200 bg-white/70 p-3">
                <p className="text-xs font-medium text-gray-700">Sua senha precisa ter:</p>
                <ul aria-label="Requisitos da senha" aria-live="polite" className="grid gap-1.5 text-xs sm:grid-cols-2">
                  {passwordRules.map((rule) => (
                    <li key={rule.label} className={`flex items-center gap-2 ${rule.valid ? "text-emerald-700" : "text-gray-500"}`}>
                      {rule.valid ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <Circle aria-hidden="true" className="size-3.5 shrink-0" />}
                      <span>{rule.label}</span>
                      <span className="sr-only">{rule.valid ? "Atendido" : "Pendente"}</span>
                    </li>
                  ))}
                </ul>
              </div>}
            </div>
            {isRegister && (
              <div className="space-y-1.5">
                <label htmlFor={`${id}-password-confirmation`} className="block text-sm font-semibold text-gray-700">Confirmar senha</label>
                <div className="relative">
                  <Input
                    id={`${id}-password-confirmation`}
                    name="passwordConfirmation"
                    type={showPasswordConfirmation ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Digite a senha novamente"
                    maxLength={128}
                    required
                    disabled={busy}
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    aria-invalid={passwordConfirmation.length > 0 && !passwordsMatch}
                    aria-describedby={`${id}-password-confirmation-hint`}
                    className={`${inputClass} pr-12!`}
                  />
                  <Button type="button" variant="ghost" size="icon" disabled={busy} onClick={() => setShowPasswordConfirmation((previous) => !previous)} aria-label={showPasswordConfirmation ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"} aria-pressed={showPasswordConfirmation} aria-controls={`${id}-password-confirmation`} className="absolute inset-y-0 right-0 size-12 rounded-xl text-gray-600 transition-colors">
                    {showPasswordConfirmation ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  </Button>
                </div>
                <p id={`${id}-password-confirmation-hint`} className={`text-xs ${passwordConfirmation.length === 0 ? "text-gray-600" : passwordsMatch ? "text-emerald-700" : "text-red-600"}`}>
                  {passwordConfirmation.length === 0 ? "Repita a senha para confirmar." : passwordsMatch ? "As senhas coincidem." : "As senhas não coincidem."}
                </p>
              </div>
            )}
            <Button type="submit" disabled={busy} className="mt-1 h-12 w-full gap-2 rounded-xl bg-primary px-4 py-3 text-sm! font-semibold! text-primary-foreground shadow-sm transition-colors hover:bg-[#006487]">
              {busy ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Aguarde…</> : isRegister ? "Criar conta" : "Entrar"}
            </Button>
            <p role="status" aria-live="polite" className="sr-only">{busy ? "Acessando sua conta, aguarde." : ""}</p>
          </form>
          </section>
        </div>

        {!staffOnly && <footer className="mb-1 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-gray-600">
            {isRegister ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
            <button type="button" disabled={busy} onClick={changeMode} className="rounded-sm text-sm! font-bold! text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">{isRegister ? "Entrar" : "Cadastre-se"}</button>
          </p>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { clearLandingIntent(); if (onGuest) onGuest(); else window.location.assign("/home") }} className="min-h-11 gap-1 rounded-xl px-3 py-2 text-sm! font-medium! text-gray-600 transition-colors hover:text-gray-800">
            Continuar como visitante <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        </footer>}
      </main>
    </div>
  )
}
