// Before and after for src/ai/recompose.ts with the garments stored in this browser (read only): each garment as
// the wardrobe shows it now and recomposed, with what was done to it (turned, lit, specks taken out) and how long it
// took. Judged by eye: measuring the size or brightness of the new pictures also counts their shadow, so those
// figures said nothing (tried on 20-11-2026).
import { recompose } from '../src/ai/recompose'
import { garmentRepository } from '../src/db/garmentRepository'
import type { Garment } from '../src/types/domain'

const status = document.querySelector('#status')!
const say = (text: string) => { status.textContent = text }

function card(list: Element, image: Blob, garment: Garment, note: string) {
  const item = document.createElement('li')
  item.className = 'card'
  item.innerHTML = `<div class="card-image"><img alt="" src="${URL.createObjectURL(image)}" /></div><span>${garment.name || garment.subcategory || garment.category}</span><span class="note">${note}</span>`
  list.append(item)
}

export async function run() {
  const garments = await garmentRepository.list()
  const thumbnails = await garmentRepository.thumbnails(garments.map((garment) => garment.id))
  const rows: Array<{ name: string; category: string; recomposed: boolean; angle: number; gain: number; specks: number; ms: number }> = []
  for (const [index, garment] of garments.entries()) {
    say(`${index + 1}/${garments.length}: ${garment.name}`)
    const photos = await garmentRepository.photos(garment.id)
    const before = thumbnails.get(garment.id)
    if (!before) continue
    const started = performance.now()
    const result = photos?.cutout ? await recompose(photos.cutout, garment.category, photos.image) : undefined
    const ms = Math.round(performance.now() - started)
    card(document.querySelector('#before')!, before, garment, garment.category)
    card(document.querySelector('#after')!, result?.image ?? before, garment, result
      ? [result.angle ? `girada ${result.angle.toFixed(0)}°` : '', result.gain !== 1 ? `luz ×${result.gain.toFixed(2)}` : '', result.specks > 0.001 ? `motas ${(result.specks * 100).toFixed(1)} %` : '', `${ms} ms`].filter(Boolean).join(' · ')
      : 'sin recorte: igual')
    rows.push({ name: garment.name, category: garment.category, recomposed: !!result, angle: result?.angle ?? 0, gain: result?.gain ?? 1, specks: result?.specks ?? 0, ms })
  }
  const done = rows.filter((row) => row.recomposed)
  const summary = {
    garments: rows.length,
    recomposed: done.length,
    turned: done.filter((row) => row.angle).map((row) => `${row.name} ${row.angle.toFixed(1)}°`),
    lifted: done.filter((row) => row.gain !== 1).map((row) => `${row.name} ×${row.gain.toFixed(2)}`),
    specksOverOnePercent: done.filter((row) => row.specks > 0.01).map((row) => `${row.name} ${(row.specks * 100).toFixed(1)} %`),
    msMedian: done.map((row) => row.ms).sort((a, b) => a - b)[Math.floor(done.length / 2)] ?? 0
  }
  document.querySelector('#summary')!.innerHTML = `<pre>${JSON.stringify(summary, null, 1)}</pre>`
  say(`Listo: ${rows.length} prendas.`)
  return { summary, rows }
}

declare global { interface Window { recomposeResult?: unknown } }
void run().then((result) => { window.recomposeResult = result }).catch((error: unknown) => say(`Error: ${String(error)}`))
