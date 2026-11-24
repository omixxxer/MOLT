// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRIVE_SCOPE } from './cloud/googleAuth'
import { DRIVE_FILE_NAME } from './cloud/googleDrive'

// The privacy policy is a static page (Google's consent screen links to it): it must keep saying what the code does.
const page = readFileSync(new URL('../public/privacidad.html', import.meta.url), 'utf8')
const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('privacy policy page', () => {
  it('names the Drive permission and file the app really uses, and Google’s limited use terms', () => {
    expect(page).toContain(DRIVE_SCOPE.split('/').pop())
    expect(page).toContain(DRIVE_FILE_NAME)
    expect(page).toContain('https://developers.google.com/terms/api-services-user-data-policy')
    expect(page).toMatch(/uso limitado/)
  })

  it('mentions every outside service the app may connect to', () => {
    const connect = /connect-src ([^;"]+)/.exec(app)![1]!.split(/\s+/).filter((source) => source.startsWith('https://'))
    expect(connect.length).toBeGreaterThan(0)
    for (const host of connect) {
      const service = host.includes('open-meteo') ? 'Open-Meteo' : host.includes('googleapis') ? 'Google Drive' : host.replace('https://', '')
      expect(page, host).toContain(service)
    }
  })

  it('tells of the library logging the app blocks, and keeps it blocked', () => {
    expect(page).toContain('odml.pa.googleapis.com')
    expect(app).not.toContain('odml.pa.googleapis.com')
    expect(app).not.toMatch(/connect-src[^;"]*https:\/\/\*\.googleapis\.com/)
  })

  it('loads nothing from outside its own site', () => {
    expect(page).not.toMatch(/<script/i)
    expect(page).not.toMatch(/<link[^>]+href="https?:/i)
    expect(page).not.toMatch(/<img[^>]+src="https?:/i)
    expect(page).toMatch(/Última actualización: \d{1,2} de \w+ de \d{4}/)
  })
})
