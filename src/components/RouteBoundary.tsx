import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { useAndroidReady } from '../lib/android-startup'

interface RouteBoundaryProps {
  routeKey: string
  children: ReactNode
}

function RouteLoading() {
  // Match the native launch surface without declaring the destination ready.
  return <main aria-busy="true" aria-label="Carregando" style={{ backgroundColor: '#F4F4F6', minHeight: '100dvh' }} />
}

function RouteLoadFailure() {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useAndroidReady(true)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])
  const fontFamily = "'Plus Jakarta Sans Variable', 'Geist Variable', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  return (
    <main
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        minHeight: '100dvh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F7FBFC',
        color: '#173746',
        fontFamily,
        padding: '24px',
      }}
    >
      <style>{'.na-route-retry:focus-visible{outline:2px solid #062d40;outline-offset:4px}.na-route-home:focus-visible{outline:2px solid #006487;outline-offset:4px}'}</style>
      <div
        role="alert"
        style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '20px',
          width: '100%',
          maxWidth: '28rem',
        }}
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{
            margin: 0,
            fontSize: '1.5rem',
            lineHeight: '2rem',
            fontWeight: 600,
          }}
        >
          Não foi possível abrir esta página
        </h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>
          Confira sua conexão e recarregue para tentar novamente.
        </p>
        <button
          type="button"
          className="na-route-retry"
          onClick={() => window.location.reload()}
          style={{
            boxSizing: 'border-box',
            minHeight: '44px',
            border: 0,
            borderRadius: '1.25rem',
            backgroundColor: '#062d40',
            padding: '12px 20px',
            font: 'inherit',
            lineHeight: 1.5,
            fontWeight: 600,
            color: '#FFFFFF',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Recarregar página
        </button>
        <a
          href="/"
          className="na-route-home"
          style={{
            display: 'block',
            width: 'fit-content',
            paddingBlock: '12px',
            lineHeight: 1.5,
            color: '#006487',
            textDecoration: 'underline',
          }}
        >
          Voltar ao início
        </a>
      </div>
    </main>
  )
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
