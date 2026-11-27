import { useCallback, useEffect, useRef } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'

export function PublicShopReel() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] })
  const reducedMotion = useReducedMotion()
  const reelOpacity = useTransform(scrollYProgress, [0, 0.14, 0.58, 0.74], [0, 1, 1, 0])
  const reelY = useSpring(useTransform(scrollYProgress, [0, 0.14, 0.74, 1], [56, 0, 0, -56]), { stiffness: 150, damping: 28, mass: 0.35 })

  const syncVideoPlayback = useCallback((progress: number) => {
    const video = videoRef.current
    if (!video) return
    if (reducedMotion || progress <= 0.01 || progress >= 0.74) {
      video.pause()
    } else if (video.paused) {
      void video.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Não foi possível reproduzir o vídeo da NA Barbearia.', error)
      })
    }
  }, [reducedMotion])

  useEffect(() => {
    syncVideoPlayback(scrollYProgress.get())
    return () => videoRef.current?.pause()
  }, [scrollYProgress, syncVideoPlayback])

  useMotionValueEvent(scrollYProgress, 'change', syncVideoPlayback)

  return <section ref={sectionRef} className="public-section public-reel" aria-labelledby="reel-title">
    <div className="public-container">
      <div className="public-section-heading">
        <span className="public-eyebrow">Por dentro da NA</span>
        <h2 id="reel-title">Trabalho sério. Resenha boa.</h2>
        <p>Um pouco do ritmo e da personalidade da barbearia.</p>
      </div>
      <motion.div
        className="public-reel-stage"
        initial={false}
        style={{
          opacity: reducedMotion ? 1 : reelOpacity,
          y: reducedMotion ? 0 : reelY,
        }}
      >
        <video ref={videoRef} className="public-reel-video" poster="/brand/optimized/showreel-poster.webp" muted loop playsInline preload="none" aria-label="Vídeo da NA Barbearia">
          <source src="/brand/na-barbearia-showreel.mp4" type="video/mp4" />
          Seu navegador não consegue reproduzir este vídeo.
        </video>
        <span className="public-reel-caption">NA BARBEARIA <span>·</span> SANTOS, SP</span>
      </motion.div>
    </div>
  </section>
}

export default PublicShopReel
