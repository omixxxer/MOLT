// Cloudflare rejects the whole deploy if one file passes 25 MiB, and the classifier is close to it.
// Run after the build, so a retrained model fails here with a clear message instead of in the deploy.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LIMIT = 25 * 1024 * 1024
const directory = process.argv[2] ?? 'dist'

const files = readdirSync(directory, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .map((path) => ({ path, bytes: statSync(path).size }))
  .sort((left, right) => right.bytes - left.bytes)

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`
const tooLarge = files.filter((file) => file.bytes > LIMIT)

if (tooLarge.length) {
  for (const file of tooLarge) console.error(`Demasiado grande para Cloudflare: ${file.path} (${mib(file.bytes)}, límite 25 MiB)`)
  process.exit(1)
}
console.log(`Tamaño correcto: el archivo mayor es ${files[0]?.path} (${mib(files[0]?.bytes ?? 0)} de 25 MiB).`)
