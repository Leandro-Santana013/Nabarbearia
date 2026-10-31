import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { api } from '../services/api'
import { isStaff } from '../lib/staff-routing'
import { ANDROID_APK_URL, availableAndroidUpdate, installedAndroidVersion, type AndroidRelease } from '../lib/android-update'
import LoginScreen from '../pages/LoginScreen'
import { useAndroidReady } from '../lib/android-startup'
import { Button } from './ui/button'

type CheckState = { kind: 'current' } | { kind: 'update'; release: AndroidRelease }
type DownloadState = 'idle' | 'downloading' | 'ready' | 'permission' | 'installing' | 'error'

export default function AndroidUpdateGate({ children }: { children: ReactNode }) {
  const [installed] = useState(() => installedAndroidVersion(navigator.userAgent))
  const [state, setState] = useState<CheckState>({ kind: 'current' })
  useAndroidReady(state.kind === 'update')
  const [download, setDownload] = useState<DownloadState>('idle')
  const [message, setMessage] = useState('')
  const [login, setLogin] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const checkSequence = useRef(0)

  const check = useCallback(async (signal?: AbortSignal) => {
    if (installed === null) return
    const sequence = ++checkSequence.current
    try {
      const release = await availableAndroidUpdate(installed, signal)
      if (!signal?.aborted && sequence === checkSequence.current) setState(release ? { kind: 'update', release } : { kind: 'current' })
    } catch {
      // A routine check must not interrupt entry or erase a confirmed update.
      // The next foreground event retries; actual APK download errors stay visible.
    }
  }, [installed])

  useEffect(() => {
    const controller = new AbortController()
    void check(controller.signal)
    return () => controller.abort()
  }, [check])
  useEffect(() => {
    if (installed === null) return
    const resumed = () => { if (download === 'idle') void check() }
    const visible = () => { if (document.visibilityState === 'visible' && download === 'idle') void check() }
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ state: DownloadState; message: string }>).detail
      if (!detail || !['downloading', 'ready', 'permission', 'installing', 'error'].includes(detail.state)) return
      setDownload(detail.state)
      setMessage(detail.message)
    }
    window.addEventListener('staff-resume', resumed)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('na-android-update', status)
    return () => {
      window.removeEventListener('staff-resume', resumed)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('na-android-update', status)
    }
  }, [installed, check, download])

  function startDownload() {
    setLogin(false)
    setDownload('downloading')
    setMessage('Baixando a atualização. Aguarde a confirmação de instalação do Android.')
    window.location.assign(ANDROID_APK_URL)
  }
  async function update() {
    setAuthorizing(true)
    try {
      const session = await api.authSession()
      if (session && isStaff(session.user)) startDownload()
      else setLogin(true)
    } catch {
      setDownload('error')
      setMessage('Não foi possível conectar. Verifique sua internet e tente novamente.')
    } finally { setAuthorizing(false) }
  }

  if (state.kind === 'current') return children
  if (login) return <LoginScreen staffOnly initialError="Entre com sua conta da equipe para instalar a atualização." onAuthenticated={startDownload} />
  const busy = authorizing || (installed !== 0 && (download === 'downloading' || download === 'installing'))
  return <main className="flex min-h-dvh flex-col bg-background px-6 py-10 text-foreground">
    <div className="m-auto w-full max-w-sm">
      <div className="mb-10 flex items-center gap-3 border-b border-border pb-5">
        <img src="/brand/na-logo-cutout.png" alt="NA Barbearia" className="size-14 rounded-2xl bg-[#079dc5] object-contain" />
        <div><p className="font-semibold">NA Barbearia</p><p className="text-sm text-muted-foreground">Aplicativo da equipe</p></div>
      </div>
      <div className="space-y-6">
        <Download className="size-9 text-primary" />
        <div className="space-y-3"><p className="text-sm font-medium text-primary">Nova versão disponível · {state.release.version_name}</p><h1 className="text-3xl font-semibold tracking-tight">Atualize para continuar</h1><p className="leading-relaxed text-muted-foreground">Uma nova versão da NA Barbearia está pronta. Instale a atualização para acessar seu painel.</p></div>
        <div className="flex items-center justify-between border-y border-border py-4 text-sm"><span>Seus dados e sua conta serão mantidos</span><span className="ml-3 shrink-0 text-muted-foreground">{(state.release.size_bytes / 1024 / 1024).toFixed(1)} MB</span></div>
        <Button className="min-h-12 w-full gap-2" disabled={busy} onClick={() => void update()}>{busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Download className="size-4" />}{authorizing ? 'Preparando atualização…' : download === 'installing' ? 'Confirme no Android' : download === 'downloading' ? installed === 0 ? 'Baixar novamente' : 'Baixando atualização…' : download === 'ready' || download === 'permission' ? 'Instalar atualização' : 'Atualizar aplicativo'}</Button>
        {message && <p role={download === 'error' ? 'alert' : 'status'} className="text-sm leading-relaxed text-muted-foreground">{message}</p>}
        {installed === 0 && <p className="text-sm leading-relaxed text-muted-foreground">Nesta versão, abra o arquivo pela notificação de download e confirme a instalação.</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">O Android pedirá sua confirmação. Não é necessário desinstalar o aplicativo.</p>
      </div>
    </div>
  </main>
}
