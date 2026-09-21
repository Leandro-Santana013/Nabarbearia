import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import DemoApp from './DemoApp'
import PublicSite from './PublicSite'

const INTERNAL_DEMO_PATH = '/demo-interno'

function InternalDemoFrame() {
  const currentPath = useMemo(() => window.location.pathname, [])
  return (
    <div className="internal-demo-frame">
      <div className="internal-demo-banner" role="note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span><strong>Ambiente interno fictício.</strong> Esta rota demonstra uma operação local e não é o site público nem uma integração com o Trinks.</span>
        <a href="/" className="internal-demo-exit">Voltar ao site público <ExternalLink size={13} aria-hidden="true" /></a>
        <span className="internal-demo-path">{currentPath}</span>
      </div>
      <DemoApp />
    </div>
  )
}

export default function App() {
  const isInternalDemo = window.location.pathname.replace(/\/$/, '') === INTERNAL_DEMO_PATH
  return isInternalDemo ? <InternalDemoFrame /> : <PublicSite />
}
