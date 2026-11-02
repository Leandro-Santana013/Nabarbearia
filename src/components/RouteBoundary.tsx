import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { useAndroidReady } from '../lib/android-startup'

interface RouteBoundaryProps {
  routeKey: string
  children: ReactNode
}

function RouteLoading() {
  // Match the native launch surface without declaring the destination ready.
  return <main aria-busy="true" aria-label="Carregando" className="min-h-dvh" style={{ backgroundColor: '#F4F4F6' }} />
}

function RouteLoadFailure() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useAndroidReady(true)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])
  return <main className="flex min-h-dvh items-center justify-center bg-background p-6">
    <div role="alert" className="w-full max-w-md space-y-5">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">Não foi possível abrir esta página</h1>
      <p>Confira sua conexão e recarregue para tentar novamente.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-[#062d40] px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4">Recarregar página</button>
      <a href="/" className="block w-fit py-3 text-[#006487] underline focus-visible:outline-2 focus-visible:outline-offset-4">Voltar ao início</a>
    </div>
  </main>
}

export class RouteBoundary extends Component<RouteBoundaryProps, { failed: boolean; routeKey: string }> {
  state = { failed: false, routeKey: this.props.routeKey }

  static getDerivedStateFromError() { return { failed: true } }

  static getDerivedStateFromProps(props: RouteBoundaryProps, state: { routeKey: string }) {
    return props.routeKey !== state.routeKey ? { failed: false, routeKey: props.routeKey } : null
  }

  render() {
    return this.state.failed ? <RouteLoadFailure /> : <Suspense fallback={<RouteLoading />}>{this.props.children}</Suspense>
  }
}
