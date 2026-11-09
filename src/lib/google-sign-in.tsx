import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'

type GoogleCredentialResponse = { credential: string }
type GoogleIdentityServices = {
  accounts: {
    id: {
      initialize: (configuration: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
        cancel_on_tap_outside?: boolean
      }) => void
      renderButton: (element: HTMLElement, options: Record<string, string | number>) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

let scriptPromise: Promise<void> | null = null

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)
    const script = existing ?? document.createElement('script')
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearInterval(poll)
      window.clearTimeout(timeout)
      if (window.google?.accounts?.id) resolve()
      else reject(new Error('Google Identity Services não carregou.'))
    }
    const poll = window.setInterval(() => {
      if (window.google?.accounts?.id) finish()
    }, 100)
    const timeout = window.setTimeout(() => {
      settled = true
      reject(new Error('Google Identity Services demorou para carregar.'))
      window.clearInterval(poll)
    }, 10000)
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', () => {
      if (!settled) {
        settled = true
        window.clearInterval(poll)
        window.clearTimeout(timeout)
        reject(new Error('Google Identity Services não pôde ser carregado.'))
      }
    }, { once: true })
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  }).finally(() => {
    scriptPromise = null
  })
  return scriptPromise
}

interface GoogleSignInButtonProps {
  clientId: string
  disabled?: boolean
  onCredential: (credential: string) => void
}

export function GoogleSignInButton({ clientId, disabled = false, onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const credentialRef = useRef(onCredential)
  const [retry, setRetry] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  credentialRef.current = onCredential

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setFailed(false)
    void loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return
        containerRef.current.replaceChildren()
        window.google.accounts.id.initialize({
          client_id: clientId,
          cancel_on_tap_outside: true,
          callback: (response) => {
            if (response.credential) credentialRef.current(response.credential)
          },
        })
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          locale: 'pt-BR',
          width: Math.min(400, Math.max(200, containerRef.current.clientWidth)),
        })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      containerRef.current?.replaceChildren()
    }
  }, [clientId, retry])

  if (failed) {
    return <div className="space-y-2">
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setRetry((value) => value + 1)} className="h-12 w-full rounded-xl border-gray-200 bg-white text-sm! font-semibold! text-gray-700 shadow-sm">Tentar carregar o Google novamente</Button>
      <p className="text-center text-xs text-gray-600">Não foi possível carregar o acesso do Google.</p>
    </div>
  }

  return <div className={`relative flex min-h-12 w-full justify-center overflow-hidden rounded-xl ${disabled ? 'pointer-events-none opacity-60' : ''}`} aria-busy={!ready}>
    {!ready && <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 shadow-sm"><LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin motion-reduce:animate-none" />Carregando Google…</div>}
    <div ref={containerRef} className="flex min-h-12 w-full justify-center" />
  </div>
}
