import manifest from '../config/publicMedia.generated.json'

interface PublicMedia {
  src: string
  srcSet: string
  width: number
  height: number
}

const optimizedMedia: Readonly<Record<string, PublicMedia>> = manifest

export function publicImageProps(source: string | undefined, sizes: string) {
  if (!source) return {}
  const media = optimizedMedia[source]
  return media ? { src: media.src, srcSet: media.srcSet, sizes } : { src: source }
}

export const publicImageSizes = {
  symbol: '(max-width: 700px) 80px, 94px',
  hero: '(max-width: 380px) 229px, (max-width: 700px) 265px, (max-width: 900px) 330px, 423px',
  team: '(max-width: 620px) calc(100vw - 32px), (max-width: 700px) 580px, (max-width: 900px) calc(100vw - 48px), 580px',
  portrait: '(max-width: 380px) calc(100vw - 32px), (max-width: 620px) calc((100vw - 44px) / 2), (max-width: 700px) 284px, (max-width: 900px) calc((100vw - 88px) / 3), 275px',
  gallery: '(max-width: 620px) calc((100vw - 48px) / 2), (max-width: 700px) 282px, (max-width: 900px) calc((100vw - 64px) / 2), 371px',
  shop: '(max-width: 620px) calc(100vw - 32px), (max-width: 700px) 580px, (max-width: 900px) calc(100vw - 48px), 552px',
} as const
