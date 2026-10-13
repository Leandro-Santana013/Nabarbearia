import { useState } from 'react'
import type { ImgHTMLAttributes } from 'react'

type BarberPhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'onError' | 'src'> & {
  src?: string | null
  alt: string
  initials: string
  fallbackClassName?: string
}

export function BarberPhoto({ src, alt, initials, className, fallbackClassName, ...imageProps }: BarberPhotoProps) {
  const [failed, setFailed] = useState(false)
  const normalizedSrc = src?.trim()

  if (!normalizedSrc || failed) {
    return <span className={fallbackClassName ?? className} role="img" aria-label={alt}>{initials}</span>
  }

  return <img {...imageProps} className={className} src={normalizedSrc} alt={alt} onError={() => setFailed(true)} />
}
