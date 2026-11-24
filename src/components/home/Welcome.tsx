import { ArrowRight01Icon, Calendar03Icon, Camera01Icon, Image01Icon, Luggage01Icon, MagicWand01Icon, ShirtIcon, Upload01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DemoButton } from '../demo/DemoMode'

export type AddWay = 'batch' | 'add' | 'look'

const WAYS: Array<{ way: AddWay; icon: typeof Camera01Icon; title: string; text: string; badge?: string }> = [
  { way: 'batch', icon: Upload01Icon, title: 'Varias de golpe', text: 'Elige muchas fotos de la galería y revísalas todas juntas.', badge: 'Lo más rápido' },
  { way: 'add', icon: ShirtIcon, title: 'Una prenda', text: 'Con calma, y con la etiqueta para leer marca, talla y composición.' },
  { way: 'look', icon: Image01Icon, title: 'Desde un look', text: 'Una foto tuya y Molt separa cada prenda que llevas puesta.' }
]

const NEXT: Array<{ icon: typeof Camera01Icon; text: string }> = [
  { icon: MagicWand01Icon, text: 'Molt te propone outfits con tu propia ropa' },
  { icon: Calendar03Icon, text: 'Apuntas lo que llevas y aprende de ti' },
  { icon: Luggage01Icon, text: 'Y te prepara la maleta para cada viaje' }
]

interface WelcomeProps {
  onAdd: (way: AddWay) => void
}

/** The first screen of an empty wardrobe: one clear first step, and a glimpse of what comes after it. */
export default function Welcome({ onAdd }: WelcomeProps) {
  return (
    <div className="welcome">
      {/* Under the title, in the first screen of a phone: second to adding garments, never in its way. */}
      <div className="welcome-tour">
        <span>¿Primero quieres verlo?</span>
        <DemoButton className="studio-link" />
        <small>Con un armario de ejemplo; el tuyo no se toca.</small>
      </div>
      <section className="welcome-start" aria-labelledby="welcome-start-title">
        <p className="welcome-kicker">Paso 1</p>
        <h2 id="welcome-start-title">Fotografía tu ropa</h2>
        <p className="welcome-lead">Molt quita el fondo y reconoce el tipo de prenda y el color aquí, en tu dispositivo. Tú solo revisas y guardas.</p>
        <ul className="welcome-ways">
          {WAYS.map(({ way, icon, title, text, badge }) => (
            <li key={way}>
              <button type="button" className={way === 'batch' ? 'welcome-way welcome-way-main' : 'welcome-way'} onClick={() => onAdd(way)}>
                <span className="welcome-way-icon" aria-hidden="true"><HugeiconsIcon icon={icon} size={22} /></span>
                <span className="welcome-way-text">
                  <strong>{title}{badge && <small>{badge}</small>}</strong>
                  <span>{text}</span>
                </span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="welcome-way-arrow" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <p className="welcome-tip">Para tu primer outfit basta con <strong>una parte de arriba y una de abajo</strong> (o un vestido). Con unos zapatos, mejor.</p>
      </section>

      <section className="welcome-next" aria-labelledby="welcome-next-title">
        <h2 id="welcome-next-title">Después</h2>
        <ul>
          {NEXT.map(({ icon, text }) => <li key={text}><HugeiconsIcon icon={icon} size={18} aria-hidden="true" />{text}</li>)}
        </ul>
      </section>
    </div>
  )
}
