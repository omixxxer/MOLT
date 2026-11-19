// Review page for the reference colours of a local evaluation set (scripts/eval-prepare.mjs --colors).
// Open bench/colors.html?set=<name>; it exports the reviewed colours in the format eval-prepare reads.
import { taxonomy } from '../src/ml/taxonomy'

interface Photo { id: string; file: string; colors?: string[]; colorsDoubtful?: boolean }

const palette = taxonomy.attributes.colors.values.map((value) => value.label)
const set = new URLSearchParams(location.search).get('set') ?? 'eval-clothing-dataset-test'
const storageKey = `molt-color-review:${set}`
const grid = document.querySelector('#grid')!
const count = document.querySelector('#count')!
const onlyDoubtful = document.querySelector<HTMLInputElement>('#onlyDoubtful')!

function loadEdits(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, string[]> } catch { return {} }
}
function saveEdits() {
  try { localStorage.setItem(storageKey, JSON.stringify(edits)) } catch { /* private window: edits live until reload */ }
}

let photos: Photo[] = []
let edits = loadEdits()
const current = (photo: Photo) => edits[photo.id] ?? photo.colors!
const same = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index])

function render() {
  grid.innerHTML = ''
  const shown = photos.filter((photo) => !onlyDoubtful.checked || photo.colorsDoubtful)
  const changed = photos.filter((photo) => edits[photo.id] && !same(edits[photo.id]!, photo.colors!)).length
  count.textContent = `${shown.length} fotos · ${changed} cambiadas`
  for (const photo of shown) {
    const colors = current(photo)
    const card = document.createElement('div')
    card.className = `card${photo.colorsDoubtful ? ' doubtful' : ''}${same(colors, photo.colors!) ? '' : ' changed'}`
    const number = photos.indexOf(photo) + 1
    card.innerHTML = `<img loading="lazy" alt="" src="/test-photos/${set}/${photo.file}" />
      <div>#${number} ${photo.colorsDoubtful ? '<span class="badge">dudosa</span>' : ''}</div>
      <div class="chosen">${colors.length ? colors.join(' + ') : '(sin color)'}</div>`
    const chips = document.createElement('div')
    chips.className = 'chips'
    for (const color of palette) {
      const button = document.createElement('button')
      button.textContent = color
      button.setAttribute('aria-pressed', String(colors.includes(color)))
      button.onclick = () => {
        edits[photo.id] = colors.includes(color) ? colors.filter((value) => value !== color) : [...colors, color]
        saveEdits(); render()
      }
      chips.append(button)
    }
    const main = document.createElement('button')
    main.textContent = 'Principal ↺'
    main.title = 'Rota los colores: el segundo pasa a ser el principal'
    main.disabled = colors.length < 2
    main.onclick = () => { edits[photo.id] = [...colors.slice(1), colors[0]!]; saveEdits(); render() }
    chips.append(main)
    card.append(chips)
    grid.append(card)
  }
}

onlyDoubtful.onchange = render
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => {
  if (!confirm('¿Deshacer todos tus cambios?')) return
  edits = {}; saveEdits(); render()
}
document.querySelector<HTMLButtonElement>('#download')!.onclick = () => {
  const file = {
    labelledBy: 'Claude a ojo, revisado por el usuario',
    reviewedAt: new Date().toISOString(),
    photos: Object.fromEntries(photos.map((photo) => [photo.id, { colors: current(photo) }]))
  }
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }))
  link.download = `colors-${set.replace(/^eval-/, '')}.json`
  link.click()
}
void fetch(`/test-photos/${set}/list.json`).then((response) => response.json() as Promise<{ photos: Photo[] }>).then((list) => {
  photos = list.photos.filter((photo) => photo.colors?.length)
  render()
})
