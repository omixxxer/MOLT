// Runs bench/classifier.html or bench/look.html in a headless Chrome of its own (new profile) and saves the result, with the memory
// the operating system gives the page's process, sampled every second (Windows only). The bench page's own figure
// (performance.measureUserAgentSpecificMemory) does not see SlimSAM's worker (src/ai/sam.ts), so cut-out memory
// has to be read from the OS.
//
//   MOLT_BENCH=1 npm run build && npm run preview      (in another terminal)
//   node scripts/bench-chrome.mjs "http://localhost:4173/bench/classifier.html?set=eval-clothing-dataset-test&auto&colors&limit=40&keepcuts" out.json
//   node scripts/bench-chrome.mjs --compare before.json after.json      (are the cut-outs the same?)
//
// CHROME sets the browser's path (default: Chrome's usual place on Windows). With &keepcuts in the URL the result
// also holds each cut-out's mask, so --compare can tell how much two different ones overlap.
import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const args = process.argv.slice(2)

if (args[0] === '--compare') {
  const [a, b] = args.slice(1, 3).map((file) => JSON.parse(readFileSync(file, 'utf8')))
  const after = new Map(b.rows.map((row) => [row.id, row]))
  const counts = { same: 0, different: 0, onlyInOne: 0 }
  for (const row of a.rows) {
    const other = after.get(row.id)
    // bench/look.html: the cut-outs of a photo, in order.
    if (other && row.cuts) {
      const [x, y] = [row.cuts, other.cuts ?? []].map((cuts) => cuts.map((cut) => cut.sha256).join(','))
      if (x === y) counts.same += 1
      else {
        counts.different += 1
        console.log('distinto', row.id, x, '→', y)
      }
      continue
    }
    if (!other || row.cutout === undefined) continue
    if (!row.cutout !== !other.cutout) {
      counts.onlyInOne += 1
      console.log('solo en uno', row.id)
    } else if (!row.cutout || row.cutout.sha256 === other.cutout.sha256) counts.same += 1
    else {
      counts.different += 1
      const [ma, mb] = [a.masks?.[row.id], b.masks?.[row.id]]
      let iou = null
      if (ma && mb && ma.width === mb.width && ma.height === mb.height) {
        let both = 0
        let either = 0
        for (let i = 0; i < ma.bits.length; i += 1) {
          if (ma.bits[i] === '1' && mb.bits[i] === '1') both += 1
          if (ma.bits[i] === '1' || mb.bits[i] === '1') either += 1
        }
        iou = either ? +(both / either).toFixed(4) : 1
      }
      console.log('distinto', row.id, JSON.stringify(row.cutout), JSON.stringify(other.cutout), 'IoU', iou)
    }
  }
  console.log(counts)
  process.exit(0)
}

const [url, out, port = '9401'] = args
if (!url || !out) {
  console.error('Uso: node scripts/bench-chrome.mjs <url del banco> <salida.json> [puerto de depuración]')
  process.exit(1)
}
const profile = mkdtempSync(join(tmpdir(), 'molt-bench-'))
const chrome = spawn(process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--enable-blink-features=ForceEagerMeasureMemory', 'about:blank'
], { stdio: 'ignore' })

// Private bytes (commit) of the largest renderer of this Chrome, which holds the page and its workers.
const tag = profile.split(/[\\/]/).pop()
const query = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' -and $_.CommandLine -like '*type=renderer*' } | ForEach-Object { [math]::Round($_.PrivatePageCount / 1MB) }`
const privateMb = () => process.platform !== 'win32' ? Promise.resolve(null) : new Promise((resolve) =>
  execFile('powershell', ['-NoProfile', '-Command', query], (error, stdout) =>
    resolve(error ? null : Math.max(0, ...stdout.trim().split(/\s+/).map(Number).filter(Number.isFinite)))))

let targets = []
for (let attempt = 0; attempt < 60 && !targets.some((target) => target.type === 'page'); attempt += 1) {
  await sleep(500)
  targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()).catch(() => [])
}
const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => socket.addEventListener('open', resolve))
let nextId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
const send = (method, params = {}) => new Promise((resolve) => {
  nextId += 1
  pending.set(nextId, resolve)
  socket.send(JSON.stringify({ id: nextId, method, params }))
})
const evaluate = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 800))
  return reply.result?.result?.value
}

const started = Date.now()
const samples = []
let sampling = true
const sampler = (async () => {
  while (sampling) {
    const at = Date.now()
    const mb = await privateMb()
    if (mb !== null) samples.push([at, mb])
    await sleep(1000)
  }
})()

await send('Page.navigate', { url })
let result
let status = ''
while (!result && Date.now() - started < 60 * 60 * 1000) {
  await sleep(3000)
  const now = await evaluate(`document.querySelector('#status')?.textContent ?? ''`).catch(() => '')
  if (now !== status) process.stdout.write(`\r${Math.round((Date.now() - started) / 1000)} s · ${(status = now).slice(0, 60)}   `)
  if (now.startsWith('Error')) break
  result = await evaluate('window.classifierBenchResult ?? window.lookBenchResult').catch(() => undefined)
}
console.log()
if (result) {
  // Readings after the end too: SlimSAM's worker is ended SAM_IDLE_MS (5 s) after the last cut-out.
  const ended = Date.now()
  await sleep(15_000)
  sampling = false
  await sampler
  const during = samples.filter(([at]) => at <= ended).map(([, mb]) => mb)
  result.os = during.length ? {
    privatePeakMb: Math.max(...during),
    privateAtEndMb: during.at(-1),
    privateAfter15sMb: samples.at(-1)[1],
    samples: samples.map(([at, mb]) => [Math.round((at - started) / 1000), mb])
  } : null
  result.memoryMb ??= {}
  result.memoryMb.after15s = await evaluate('performance.measureUserAgentSpecificMemory().then((m) => Math.round(m.bytes / 1048576)).catch(() => null)')
  result.masks = await evaluate(`(async () => {
    const masks = {}
    for (const [id, blob] of window.benchCutouts ?? []) {
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      let bits = ''
      for (let i = 3; i < data.length; i += 4) bits += data[i] >= 128 ? '1' : '0'
      masks[id] = { width: bitmap.width, height: bitmap.height, bits }
    }
    return masks
  })()`)
  writeFileSync(out, JSON.stringify(result))
  console.log(JSON.stringify({ os: result.os && { ...result.os, samples: undefined }, memoryMb: result.memoryMb, latencyMs: result.latencyMs, cutoutLatencyMs: result.cutoutLatencyMs, samLoadsMs: result.samLoadsMs }, null, 1))
} else {
  sampling = false
  console.log('Sin resultado:', status)
}
socket.close()
chrome.kill()
await sleep(1500)
rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
process.exit(result ? 0 : 1)
