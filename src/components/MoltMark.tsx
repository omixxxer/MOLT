import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'

interface MetallicPaintProps {
  imageSrc: string
  color: string
  lightMode: boolean
  scale: number
  density: number
  distortion: number
  dispersion: number
  shadow: number
  dpr: number
  paused: boolean
  mouseTilt: number
}

const MetallicPaint = lazy(() => import('./MetallicPaint.jsx')) as unknown as ComponentType<MetallicPaintProps>

/** The liquid runs for a moment and then stays still: this is always on screen, and must not spend battery. Hovering still tilts it. */
const FLOW_MS = 7000

const logo = <img className="molt-mark__logo" src="/icons/logo-96.png" alt="" width="32" height="32" />

function supportsWebgl2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

/** The logo in the header, its M in liquid metal. Where WebGL 2 is missing, the plain logo. */
export default function MoltMark() {
  const [metal] = useState(supportsWebgl2)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setPaused(true), FLOW_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <span className="molt-mark" aria-hidden="true">
      {metal ? (
        <Suspense fallback={logo}>
          {/* Far above the screen's density: the shader blurs its stripes on canvases this small. The shadow is kept
              lighter than the tile, because chrome's near-black stripes break the M apart at this size. */}
          <MetallicPaint imageSrc="/icons/logo-mark.png" color="#FFFFFF" lightMode={false} scale={0.88} density={1.2} distortion={0.05} dispersion={0.08} shadow={0.68} dpr={12} paused={paused} mouseTilt={0.5} />
        </Suspense>
      ) : logo}
    </span>
  )
}
