// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import source from './destinationPhoto.ts?raw'
import { findDestinationPhoto, placeImage, plainText } from './destinationPhoto'

const place = { name: 'Zaragoza', region: 'Aragón', country: 'España', latitude: 41.6, longitude: -0.9 }

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// The article's images in its own order, as Wikipedia's media list gives them: the flag and coat of arms first.
const zaragozaMedia = () => reply({
  items: [
    { title: 'Archivo:Flag_of_Zaragoza.svg', type: 'image' },
    { title: 'Archivo:Coat_of_Arms_of_Saragossa.svg', type: 'image' },
    { title: 'Archivo:Zaragoza_-_Basílica_del_Pilar_y_río_Ebro.jpg', type: 'image' },
    { title: 'Archivo:La_Seo-Zaragoza.jpg', type: 'image' }
  ]
})

const imageInfo = (extmetadata: Record<string, { value: string }>) => reply({
  query: { pages: { '-1': { imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Pilar.jpg/1280px-Pilar.jpg?utm_source=es.wikipedia.org&utm_campaign=imageinfo', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Pilar.jpg', extmetadata }] } } }
})

describe('photo of a destination', () => {
  it('takes the first photograph of the place in its article, with its author and licence as text', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const address = new URL(String(url))
      if (address.pathname.includes('/media-list/')) {
        expect(decodeURIComponent(address.pathname)).toMatch(/media-list\/Zaragoza$/)
        return zaragozaMedia()
      }
      expect(address.searchParams.get('titles')).toBe('File:Zaragoza_-_Basílica_del_Pilar_y_río_Ebro.jpg')
      return imageInfo({
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana&nbsp;Silva</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        ObjectName: { value: 'El Pilar y el Ebro' }
      })
    })
    const cover = await findDestinationPhoto(place, fetcher as unknown as typeof fetch)
    expect(cover).toMatchObject({
      // From the host a page can download, without the tracking parameters.
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pilar.jpg/1280px-Pilar.jpg',
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Pilar.jpg',
      title: 'El Pilar y el Ebro',
      author: 'Ana Silva',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0'
    })
    // Only the place's name went to Wikipedia.
    for (const [url] of fetcher.mock.calls) expect(String(url)).not.toMatch(/2026|date/)
  })

  it('searches with the region and country when the name is not an article, and gives up without a free image', async () => {
    const searched: string[] = []
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const address = new URL(String(url))
      if (address.pathname.endsWith('/media-list/Zaragoza')) return reply({}, 404)
      if (address.searchParams.get('gsrsearch')) {
        searched.push(address.searchParams.get('gsrsearch')!)
        return reply({ query: { pages: { 2: { title: 'Zaragoza (España)' } } } })
      }
      if (address.pathname.includes('/media-list/')) return zaragozaMedia()
      return imageInfo({ LicenseShortName: { value: 'Fair use' }, NonFree: { value: 'true' } })
    })
    expect(await findDestinationPhoto(place, fetcher as unknown as typeof fetch)).toBeUndefined()
    expect(searched).toEqual(['Zaragoza Aragón España'])
  })

  it('passes over flags, coats of arms, maps and old prints', () => {
    expect(placeImage(['Archivo:Bandera_de_Benicàssim.svg', 'Archivo:Escut_de_Benicàssim.svg', "Archivo:Platja_d'Heliòpolis_(Benicàssim).JPG"])).toBe("Platja_d'Heliòpolis_(Benicàssim).JPG")
    expect(placeImage(['Archivo:1917-10-13,_La_Esfera,_Zaragoza.jpg', 'Archivo:Mapa_de_Aragón.png', 'Archivo:Zaragoza_-_Puente_de_Piedra.jpg'])).toBe('Zaragoza_-_Puente_de_Piedra.jpg')
    expect(placeImage(['Archivo:1917-10-13,_La_Esfera,_Zaragoza.jpg'])).toBe('1917-10-13,_La_Esfera,_Zaragoza.jpg')
    expect(placeImage(['Archivo:Localización_de_Benicàssim.png'])).toBeUndefined()
  })

  it('reads the HTML credits Wikipedia gives as plain text', () => {
    expect(plainText('<span>Foto de <b>Juan</b> &amp; Marta</span>')).toBe('Foto de Juan & Marta')
    expect(plainText(undefined)).toBe('')
  })

  it('only calls hosts the content security policy allows', () => {
    const allowed = indexHtml.match(/connect-src ([^;]+);/)?.[1]?.split(' ') ?? []
    const called = [...source.matchAll(/['`](https:\/\/[a-z.]+)/g)].map((match) => match[1]!)
    expect(called).toEqual(expect.arrayContaining(['https://es.wikipedia.org', 'https://upload.wikimedia.org']))
    for (const origin of called) expect(allowed).toContain(origin)
  })
})
