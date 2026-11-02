import { LatticeLoader } from '../reactBits'
import { savable, useBatch } from './batchQueue'

/** Back to a batch left running or waiting for review; the analysis goes on while the user looks at the wardrobe. */
export default function BatchReturn({ onOpen }: { onOpen: () => void }) {
  const batch = useBatch()
  if (!batch.photos.length) return null
  const done = batch.photos.filter((photo) => photo.status === 'done' || photo.status === 'failed').length
  const ready = savable(batch).length
  return (
    <button className="batch-return" type="button" onClick={onOpen}>
      {batch.running
        ? <LatticeLoader label={`Analizando ${done} de ${batch.photos.length} fotos`} fontSize={12} cellSize={4} showTimer={false} />
        : <span>{ready === 1 ? '1 prenda lista' : `${ready} prendas listas`} para revisar y guardar</span>}
      <strong>Continuar →</strong>
    </button>
  )
}
