import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import openMeteoSource from './openMeteo.ts?raw'

describe('content security policy', () => {
  it('allows every Open-Meteo host the weather client calls', () => {
    const allowed = indexHtml.match(/connect-src ([^;]+);/)?.[1]?.split(' ') ?? []
    const called = [...openMeteoSource.matchAll(/new URL\('(https:\/\/[^/']+)/g)].map((match) => match[1])

    expect(called.length).toBeGreaterThan(0)
    for (const origin of called) expect(allowed).toContain(origin)
  })
})
