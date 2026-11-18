// Prepares a local labelled set for bench/classifier.html: copies the photos of one source and split of the ML
// manifest into public/test-photos/<name>/ (ignored by git) with a list.json of their labels.
//
//   node scripts/eval-prepare.mjs [--source clothing-dataset] [--split test|all] [--name eval-cd-test] [--limit N]
//                                 [--colors path/to/colors.json]
//
// The manifest is the one of the ML tools (ml/README.md): VESTA_ML_DATA, or %LOCALAPPDATA%\vesta-ml. The same
// arguments always pick the same photos, in the same order. A colours file ({ "<photo id>": ["Azul", …] }) adds
// reference colours to the photos it names (photos whose manifest labels already have colours, like the own photos
// of the «vesta» source, keep those); bench/colors.html shows them for review and exports the corrected file.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : 'true'])
  return pairs
}, []))
const source = args.source ?? 'clothing-dataset'
const split = args.split ?? 'test'
const name = args.name ?? `eval-${source}-${split}`
const limit = args.limit ? Number(args.limit) : Infinity

const root = process.env.VESTA_ML_DATA ?? join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '.', '.local', 'share'), 'vesta-ml')
const manifest = join(root, 'manifest.jsonl')
if (!existsSync(manifest)) {
  console.error(`No encuentro el manifiesto en ${manifest}. Prepara los datos con ml/ (ver ml/README.md) o define VESTA_ML_DATA.`)
  process.exit(1)
}
// Either { "<id>": ["Azul"] } or { photos: { "<id>": { colors: ["Azul"], doubtful?: true } } }.
const colorFile = args.colors ? JSON.parse(readFileSync(args.colors, 'utf8')) : {}
const colors = Object.fromEntries(Object.entries(colorFile.photos ?? colorFile).map(([id, entry]) =>
  [id, Array.isArray(entry) ? { colors: entry } : entry]))

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')
const colorLabel = new Map(JSON.parse(readFileSync(join(repository, 'ml', 'taxonomy.json'), 'utf8')).attributes.colors.values.map((value) => [value.id, value.label]))
const target = join(repository, 'public', 'test-photos', name)
mkdirSync(target, { recursive: true })

const records = readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  .filter((record) => record.source === source && (split === 'all' || record.split === split) && record.labels?.category)
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, limit)

const photos = []
for (const record of records) {
  const file = `${record.id.replace(/[^a-zA-Z0-9_-]+/g, '_')}${basename(record.image).match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg'}`
  copyFileSync(join(root, record.image), join(target, file))
  photos.push({
    id: record.id,
    file,
    category: record.labels.category,
    subcategory: record.labels.subcategory ?? null,
    ...(colors[record.id]?.colors?.length ? { colors: colors[record.id].colors }
      : record.labels.colors?.length ? { colors: record.labels.colors.map((id) => colorLabel.get(id) ?? id) } : {}),
    ...(colors[record.id]?.doubtful ? { colorsDoubtful: true } : {}),
    license: record.license?.name ?? null
  })
}
writeFileSync(join(target, 'list.json'), JSON.stringify({ source, split, preparedAt: new Date().toISOString(), photos }, null, 1))
console.log(`${photos.length} fotos en public/test-photos/${name}/ (${photos.filter((photo) => photo.colors).length} con colores de referencia).`)
console.log(`Ábrelas en bench/classifier.html?set=${name} con npm run dev, o con MOLT_BENCH=1 npm run build && npm run preview.`)
