import { useRef, useState } from 'react'
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, Camera01Icon, Cancel01Icon, Luggage01Icon, MagicWand01Icon, SecurityCheckIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type GuideAction = 'batch' | 'outfits' | 'history' | 'packing' | 'wardrobe'

const STEPS: Array<{ title: string; icon: typeof Camera01Icon; text: string; points: string[]; action: [string, GuideAction] }> = [
  {
    title: 'Fotografía tus prendas',
    icon: Camera01Icon,
    text: 'Sube fotos de una en una o muchas de golpe. Molt quita el fondo y reconoce el tipo de prenda y el color.',
    points: ['Añade una foto de la etiqueta para leer marca, talla y composición.', 'Revisa lo sugerido antes de guardar: siempre decides tú.'],
    action: ['Añadir prendas', 'batch']
  },
  {
    title: 'Crea tus outfits',
    icon: MagicWand01Icon,
    text: 'Al abrir Outfits ya tienes una propuesta para hoy, según la ocasión y el tiempo o la temporada.',
    points: ['Fija la prenda que quieras y cambia el resto.', 'Toca una foto para elegir otra: primero, lo que mejor combina.'],
    action: ['Ir a Outfits', 'outfits']
  },
  {
    title: 'Apunta lo que llevas',
    icon: Calendar03Icon,
    text: 'Con «Me lo pongo hoy» el outfit pasa al calendario, y Molt aprende de lo que llevas, guardas y descartas.',
    points: ['Evita repetirte y recupera lo que tenías olvidado.', 'Mira qué usas de verdad y cuánto te cuesta cada puesta.'],
    action: ['Ver el historial', 'history']
  },
  {
    title: 'Prepara la maleta',
    icon: Luggage01Icon,
    text: 'Di a dónde vas y qué días: Molt consulta la previsión y propone un outfit para cada día.',
    points: ['Tendrás una lista para marcar lo que vas guardando.', 'Solo la ciudad sale de tu dispositivo, para pedir el tiempo.'],
    action: ['Ir a Maleta', 'packing']
  },
  {
    title: 'Tu armario es tuyo',
    icon: SecurityCheckIcon,
    text: 'No hay cuentas. Las prendas y las fotos se guardan solo en este navegador y se analizan aquí mismo.',
    points: ['Si borras los datos del navegador, se pierden: haz una copia de seguridad.', 'En Armario, «Datos» guarda una copia en un archivo o en tu Google Drive.'],
    action: ['Ir al armario', 'wardrobe']
  }
]

interface HowItWorksProps {
  onClose: () => void
  onAction: (action: GuideAction) => void
}

/** A short guide to how the app works, one step at a time. */
export default function HowItWorks({ onClose, onAction }: HowItWorksProps) {
  const [current, setCurrent] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const step = STEPS[current]!
  const last = current === STEPS.length - 1

  function goTo(index: number) {
    setCurrent(index)
    panel.current?.focus({ preventScroll: true })
  }

  return (
    <section className="guide" aria-labelledby="guide-title">
      <header className="guide-header">
        <h2 id="guide-title">Cómo funciona</h2>
        <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar la guía"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
      </header>

      <ol className="guide-steps">
        {STEPS.map((item, index) => (
          <li key={item.title} className={index < current ? 'done' : undefined}>
            <button type="button" aria-current={index === current ? 'step' : undefined} aria-label={`Paso ${index + 1} de ${STEPS.length}: ${item.title}`} onClick={() => goTo(index)}>
              {index < current ? <HugeiconsIcon icon={Tick02Icon} size={14} /> : index + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="guide-panel" key={current} ref={panel} tabIndex={-1}>
        <span className="guide-icon" aria-hidden="true"><HugeiconsIcon icon={step.icon} size={30} /></span>
        <div>
          <p className="guide-count">Paso {current + 1} de {STEPS.length}</p>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <ul>{step.points.map((point) => <li key={point}><HugeiconsIcon icon={Tick02Icon} size={13} />{point}</li>)}</ul>
          <button type="button" className="studio-link" onClick={() => onAction(step.action[1])}>{step.action[0]}</button>
        </div>
      </div>

      <footer className="guide-nav">
        <button type="button" className="button button-outline" onClick={() => goTo(current - 1)} disabled={current === 0}><HugeiconsIcon icon={ArrowLeft01Icon} size={15} />Anterior</button>
        {last
          ? <button type="button" className="button button-dark" onClick={onClose}><HugeiconsIcon icon={Tick02Icon} size={15} />Entendido</button>
          : <button type="button" className="button button-dark" onClick={() => goTo(current + 1)}>Siguiente<HugeiconsIcon icon={ArrowRight01Icon} size={15} /></button>}
      </footer>
    </section>
  )
}
