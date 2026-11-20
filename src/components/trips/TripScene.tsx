import { useId, useMemo, type ReactNode } from 'react'
import { sequence, type Scene } from '../../trips/tripScene'

// The drawn picture behind a trip's header (tripScene.ts says what it shows). Soft, in the app's colours, and
// faded on the left where the trip's name is written.

const W = 1200
const H = 400

const SKIES: Record<Scene['sky'], [string, string][]> = {
  // [top, bottom] for dawn, day and dusk.
  sun: [['#F2C6B4', '#F6E9EE'], ['#BCD4EE', '#EEF1F8'], ['#8A79B2', '#F1C3AE']],
  cloud: [['#D9C9C8', '#EEEAF0'], ['#C3CCDB', '#ECEDF3'], ['#9D93B3', '#E3CFCB']],
  rain: [['#A9A6B6', '#DCDCE4'], ['#9DA7B8', '#D9DDE6'], ['#7F7899', '#C9C2CC']],
  snow: [['#E3DDE6', '#F6F5F9'], ['#DCE4EF', '#F7F8FB'], ['#B9B0CB', '#EFE6EA']]
}

export default function TripScene({ scene }: { scene: Scene }) {
  const id = useId().replace(/:/g, '')
  const art = useMemo(() => draw(scene, id), [scene, id])
  const [top, bottom] = SKIES[scene.sky][scene.light]!
  return (
    <svg className="trip-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7E9DC2" />
          <stop offset="1" stopColor="#3F5F8C" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {art}
    </svg>
  )
}

function draw(scene: Scene, id: string): ReactNode {
  const random = sequence(scene.seed)
  const between = (low: number, high: number) => low + random() * (high - low)
  const parts: ReactNode[] = []

  // The sun (or a low glow at dawn and dusk) behind everything, only with a clear sky.
  if (scene.sky === 'sun') {
    const x = between(560, 1080)
    const y = scene.light === 1 ? between(70, 130) : between(170, 220)
    parts.push(<circle key="sun-glow" cx={x} cy={y} r={92} fill="#FFFFFF" opacity={0.25} />)
    parts.push(<circle key="sun" cx={x} cy={y} r={46} fill={scene.light === 1 ? '#FFF6DA' : '#FBD9B6'} />)
  }
  // Clouds for any sky but a clear one (a few, thin, even then).
  const clouds = scene.sky === 'sun' ? 2 : 5
  for (let index = 0; index < clouds; index += 1) {
    const x = between(420, 1180)
    const y = between(40, 170)
    const size = between(0.7, 1.3) * (scene.sky === 'sun' ? 0.7 : 1)
    const shade = scene.sky === 'rain' ? '#B7BCCB' : '#FFFFFF'
    parts.push(
      <g key={`cloud-${index}`} opacity={scene.sky === 'sun' ? 0.55 : 0.8} transform={`translate(${x} ${y}) scale(${size})`}>
        <ellipse cx={0} cy={0} rx={70} ry={22} fill={shade} />
        <ellipse cx={-30} cy={-14} rx={34} ry={24} fill={shade} />
        <ellipse cx={22} cy={-20} rx={40} ry={28} fill={shade} />
      </g>
    )
  }

  const ground = 300
  if (scene.landscape === 'city') {
    // Three rows of buildings, the nearest one darkest and with lit windows.
    const rows: Array<[string, number, number]> = [['#CFC8DD', 0.35, 0.75], ['#A99DC4', 0.55, 0.95], ['#5E5476', 0.8, 1]]
    rows.forEach(([color, low, high], row) => {
      let x = row * 18 - 20
      while (x < W + 40) {
        const width = between(46, 110)
        const height = between(low, high) * (row === 2 ? 170 : 210)
        const top = ground + 40 - height + row * 22
        parts.push(<rect key={`b-${row}-${x}`} x={x} y={top} width={width} height={H - top} fill={color} />)
        if (row === 2 && random() > 0.35) {
          for (let wy = top + 14; wy < H - 20; wy += 22) {
            for (let wx = x + 10; wx < x + width - 12; wx += 18) {
              if (random() > 0.55) parts.push(<rect key={`w-${wx}-${wy}`} x={wx} y={wy} width={7} height={10} fill="#F6E3B4" opacity={scene.light === 1 ? 0.35 : 0.85} />)
            }
          }
        }
        x += width + between(2, 14)
      }
    })
  } else if (scene.landscape === 'coast') {
    parts.push(<rect key="sea" x={0} y={250} width={W} height={H - 250} fill={`url(#${id}-sea)`} />)
    for (let index = 0; index < 6; index += 1) {
      const y = 268 + index * 16
      parts.push(<path key={`wave-${index}`} d={`M0 ${y} Q 150 ${y - 6} 300 ${y} T 600 ${y} T 900 ${y} T 1200 ${y}`} fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={2} />)
    }
    const boat = between(650, 1050)
    parts.push(<path key="boat" d={`M${boat} 262 l40 0 l-6 9 l-28 0 z M${boat + 18} 262 l0 -42 l20 38 z`} fill="#F6F1F7" opacity={0.9} />)
    parts.push(<path key="sand" d={`M0 ${H} L0 330 Q 260 ${between(300, 330)} 520 350 T ${W} ${between(355, 375)} L ${W} ${H} Z`} fill="#E9D6B4" />)
  } else if (scene.landscape === 'country') {
    const hills: Array<[string, number]> = [['#BFD1B2', 240], ['#93B08A', 280], ['#6F8F6A', 320]]
    hills.forEach(([color, base], row) => {
      const a = between(-40, 40)
      const b = between(-40, 40)
      parts.push(<path key={`hill-${row}`} d={`M0 ${base + a} Q 300 ${base - 50 + b} 600 ${base + b} T ${W} ${base + a} L ${W} ${H} L 0 ${H} Z`} fill={color} />)
    })
    for (let index = 0; index < 9; index += 1) {
      const x = between(380, 1180)
      const y = between(300, 360)
      parts.push(<g key={`tree-${index}`}><rect x={x - 2} y={y} width={4} height={14} fill="#5B4A3E" /><circle cx={x} cy={y - 4} r={between(9, 15)} fill="#58795A" /></g>)
    }
  } else {
    // Mountains; with snow, white caps, snowy ground and pines.
    const snowy = scene.landscape === 'snow'
    const rows: Array<[string, number, number]> = [['#C9C3DA', 120, 0.6], ['#9C92B8', 170, 0.8], ['#6C6290', 230, 1]]
    rows.forEach(([color, base, scale], row) => {
      let x = -80 + row * 40
      while (x < W + 80) {
        const width = between(220, 380) * scale
        const peak = base + between(-50, 40)
        const tip = x + width / 2
        parts.push(<path key={`m-${row}-${x}`} d={`M${x} ${ground + 30} L${tip} ${peak} L${x + width} ${ground + 30} Z`} fill={color} />)
        if (snowy || row < 2) {
          const cap = (ground + 30 - peak) * (snowy ? 0.38 : 0.22)
          parts.push(<path key={`c-${row}-${x}`} d={`M${tip - cap * 0.55} ${peak + cap} L${tip} ${peak} L${tip + cap * 0.55} ${peak + cap} l-${cap * 0.18} ${-cap * 0.12} l-${cap * 0.2} ${cap * 0.14} l-${cap * 0.18} ${-cap * 0.1} Z`} fill="#FFFFFF" opacity={0.92} />)
        }
        x += width * between(0.55, 0.8)
      }
    })
    parts.push(<path key="ground" d={`M0 ${ground + 20} Q 400 ${ground} 800 ${ground + 24} T ${W} ${ground + 14} L ${W} ${H} L 0 ${H} Z`} fill={snowy ? '#F4F4F8' : '#8FA58A'} />)
    if (snowy) {
      for (let index = 0; index < 10; index += 1) {
        const x = between(420, 1180)
        const y = between(330, 380)
        const size = between(14, 26)
        parts.push(<path key={`pine-${index}`} d={`M${x} ${y - size * 2} L${x + size * 0.7} ${y} L${x - size * 0.7} ${y} Z`} fill="#4F6B5C" />)
      }
    }
  }

  // Rain or snow falling over it all.
  if (scene.sky === 'rain' || scene.sky === 'snow') {
    for (let index = 0; index < 70; index += 1) {
      const x = between(300, W)
      const y = between(0, H)
      parts.push(scene.sky === 'rain'
        ? <line key={`drop-${index}`} x1={x} y1={y} x2={x - 6} y2={y + 16} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.5} />
        : <circle key={`flake-${index}`} cx={x} cy={y} r={between(1.5, 3.5)} fill="#FFFFFF" opacity={0.85} />)
    }
  }
  return parts
}
