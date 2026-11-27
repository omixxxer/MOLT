// Photos from outside the camera roll: an image copied in another tab (or app) and pasted here, one dragged from a
// web page, or one shared to Molt from another app (src/sw.ts). A page cannot show a shop inside itself nor capture
// one, so these are the ways in. What comes this way is marked as from a shop or the internet: it never goes into
// the training export (datasetExport.ts), since its licence is the shop's, not the user's.

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface IntakeResult {
  files: File[]
  /** It came from a web page or the clipboard, not from the user's own files: most likely a shop's photo. */
  fromWeb: boolean
  /** In the user's words, why nothing could be taken. */
  error?: string
}

const isImage = (file: File) => IMAGE_TYPES.includes(file.type)

/** A name for an image without one (a pasted image is «image.png»): what it is and when. */
function named(blob: Blob, base: string): File {
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${base}-${Date.now()}.${extension}`, { type: blob.type, lastModified: Date.now() })
}

/** The images in a paste (Ctrl+V); empty when the clipboard holds text, so text fields paste as always. */
export function imagesFromPaste(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = [...data.files].filter(isImage)
  if (files.length) return files.map((file) => named(file, 'pegada'))
  return [...data.items].filter((item) => item.kind === 'file' && IMAGE_TYPES.includes(item.type))
    .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file)).map((file) => named(file, 'pegada'))
}

/** The address of the image dragged from a web page: its link (uri-list) or the src of the <img> in its HTML. */
export function draggedImageUrl(data: DataTransfer): string | undefined {
  const html = data.getData('text/html')
  const src = html && new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src')
  const uri = data.getData('text/uri-list').split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('#'))
  const url = src || uri
  return url && /^(https?:|data:image\/)/.test(url) ? url : undefined
}

/**
 * What a drop brings: files (from the computer, or an image a browser hands over as a file) or, from another tab, only
 * the image's address. Molt connects to no shop (its CSP allows only its own origin and the services it names), so an
 * address is downloaded only from Molt itself, or decoded when the image is inside it (data:); for a shop's, it says
 * how to bring the image (copy and paste it, or save it).
 */
export async function imagesFromDrop(data: DataTransfer, download: (url: string) => Promise<Blob> = fetchImage): Promise<IntakeResult> {
  // Dragged from a page, a browser adds its address (and HTML) to the files; from the computer, only files.
  const fromWeb = data.types.includes('text/uri-list') || data.types.includes('text/html')
  // From the computer, every file as it is: the form and the batch check them and say which they leave out.
  if (!fromWeb && data.files.length) return { files: [...data.files], fromWeb }
  const files = [...data.files].filter(isImage)
  if (files.length) return { files: files.map((file) => named(file, 'web')), fromWeb }
  if (data.files.length) return { files: [], fromWeb, error: 'Solo se pueden añadir fotos JPG, PNG o WebP.' }
  const url = draggedImageUrl(data)
  if (!url) return { files: [], fromWeb, error: fromWeb ? 'No se ha encontrado una imagen en lo que has arrastrado.' : undefined }
  if (!url.startsWith('data:') && new URL(url, location.href).origin !== location.origin) {
    return { files: [], fromWeb: true, error: COPY_INSTEAD }
  }
  try {
    const blob = await download(url)
    if (!IMAGE_TYPES.includes(blob.type)) return { files: [], fromWeb: true, error: 'Esa imagen no es JPG, PNG ni WebP. Prueba a copiarla y pegarla aquí.' }
    return { files: [named(blob, 'web')], fromWeb: true }
  } catch {
    return { files: [], fromWeb: true, error: COPY_INSTEAD }
  }
}

const COPY_INSTEAD = 'Desde esa web la imagen no llega sola. Cópiala (clic derecho → Copiar imagen) y pégala aquí, o guárdala y elígela.'

/** An image of Molt's own (its address) or inside the page (data:, decoded here: the CSP allows no fetch of it). */
async function fetchImage(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const [head = '', body = ''] = url.split(',', 2)
    const type = head.slice(5).split(';')[0] ?? ''
    const bytes = head.endsWith(';base64') ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body))
    return new Blob([bytes], { type })
  }
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

/** Whether this browser lets a button read an image from the clipboard (Chromium, Safari; not Firefox). */
export function canReadClipboardImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'
}

/** «Pegar imagen»: the images on the clipboard, read when the user presses the button (the browser may ask first). */
export async function imagesFromClipboard(): Promise<IntakeResult> {
  try {
    const items = await navigator.clipboard.read()
    const files: File[] = []
    for (const item of items) {
      const type = item.types.find((candidate) => IMAGE_TYPES.includes(candidate))
      if (type) files.push(named(await item.getType(type), 'pegada'))
    }
    return files.length
      ? { files, fromWeb: true }
      : { files: [], fromWeb: true, error: 'No hay ninguna imagen copiada. En la tienda, haz clic derecho en la foto → Copiar imagen.' }
  } catch {
    return { files: [], fromWeb: true, error: 'El navegador no ha dejado leer lo copiado. Prueba con Ctrl+V (o ⌘V).' }
  }
}
