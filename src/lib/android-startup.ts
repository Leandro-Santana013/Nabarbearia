import { useEffect } from 'react'

// The native launch screen only leaves after the destination has its initial
// data (or an actionable error). Never publish readiness from a loading shell.
export function useAndroidReady(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let active = true
    let frame = 0
    void document.fonts.ready.then(() => {
      if (!active) return
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (active) document.documentElement.dataset.naReady = 'true'
        })
      })
    })
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [ready])
}
