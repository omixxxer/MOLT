import { describe, expect, it, vi } from 'vitest'
import { draggedImageUrl, imagesFromDrop, imagesFromPaste } from './imageIntake'

/** A DataTransfer as a browser hands it over: files and the text it carries by type. */
function transfer(files: File[], text: Record<string, string> = {}): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })) as unknown as DataTransferItemList,
    types: [...(files.length ? ['Files'] : []), ...Object.keys(text)],
    getData: (type: string) => text[type] ?? ''
  } as unknown as DataTransfer
}

const png = (name = 'image.png') => new File(['png'], name, { type: 'image/png' })

describe('photos from outside the camera roll', () => {
  it('takes the images of a paste and leaves text to the fields', () => {
    const [pasted] = imagesFromPaste(transfer([png()]))
    expect(pasted?.type).toBe('image/png')
    expect(pasted?.name).toMatch(/^pegada-\d+\.png$/)
    expect(imagesFromPaste(transfer([], { 'text/plain': 'hola' }))).toEqual([])
    expect(imagesFromPaste(transfer([new File(['pdf'], 'a.pdf', { type: 'application/pdf' })]))).toEqual([])
  })

  it('tells a photo from the computer from one dragged from a web page', async () => {
    expect(await imagesFromDrop(transfer([png('mia.png')]))).toMatchObject({ fromWeb: false, files: [expect.objectContaining({ name: 'mia.png' })] })
    const fromPage = await imagesFromDrop(transfer([png()], { 'text/uri-list': 'https://tienda.example/camisa.png' }))
    expect(fromPage.fromWeb).toBe(true)
    expect(fromPage.files).toHaveLength(1)
  })

  it('takes a dragged address only from Molt itself or inside the page, and connects to no shop', async () => {
    const html = '<a href="/p/1"><img src="https://cdn.tienda.example/camisa.webp" alt=""></a>'
    expect(draggedImageUrl(transfer([], { 'text/html': html }))).toBe('https://cdn.tienda.example/camisa.webp')
    const download = vi.fn(async () => new Blob(['webp'], { type: 'image/webp' }))
    // A shop's address: nothing is requested, and it says how to bring the image.
    const shop = await imagesFromDrop(transfer([], { 'text/html': html, 'text/uri-list': 'https://tienda.example/p/1' }), download)
    expect(download).not.toHaveBeenCalled()
    expect(shop).toMatchObject({ files: [], fromWeb: true })
    expect(shop.error).toMatch(/Cópiala .* y pégala aquí/)
    // Molt's own image, downloaded.
    const own = await imagesFromDrop(transfer([], { 'text/uri-list': `${location.origin}/demo/camisa.webp` }), download)
    expect(download).toHaveBeenCalledWith(`${location.origin}/demo/camisa.webp`)
    expect(own).toMatchObject({ fromWeb: true, files: [expect.objectContaining({ type: 'image/webp' })] })
    // An image inside the page (data:), decoded without any connection.
    const inline = await imagesFromDrop(transfer([], { 'text/html': '<img src="data:image/png;base64,iVBORw0K">' }))
    expect(inline.files[0]).toMatchObject({ type: 'image/png' })
    // A page, not an image.
    expect(draggedImageUrl(transfer([], { 'text/uri-list': 'javascript:alert(1)' }))).toBeUndefined()
  })
})
