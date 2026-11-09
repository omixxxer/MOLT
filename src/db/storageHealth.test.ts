import { afterEach, describe, expect, it, vi } from 'vitest'
import { isStorageFull, requestPersistentStorage, shouldRemindBackup } from './storageHealth'

const now = new Date('2026-11-09T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
const wardrobe = (count: number, updatedAt = daysAgo(30)) => Array.from({ length: count }, () => ({ updatedAt }))

describe('shouldRemindBackup', () => {
  const facts = { lastBackupAt: undefined, snoozedUntil: undefined, now }

  it('waits until the wardrobe is worth keeping', () => {
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(4) })).toBe(false)
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5) })).toBe(true)
  })

  it('stays quiet while snoozed', () => {
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5), snoozedUntil: daysAgo(-1) })).toBe(false)
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5), snoozedUntil: daysAgo(1) })).toBe(true)
  })

  it('asks again only when the copy is old and the wardrobe has changed since', () => {
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5, daysAgo(1)), lastBackupAt: daysAgo(3) })).toBe(false)
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5, daysAgo(40)), lastBackupAt: daysAgo(20) })).toBe(false)
    expect(shouldRemindBackup({ ...facts, garments: wardrobe(5, daysAgo(1)), lastBackupAt: daysAgo(20) })).toBe(true)
  })
})

describe('isStorageFull', () => {
  it('recognises the browser error, also wrapped by Dexie', () => {
    const quota = new DOMException('full', 'QuotaExceededError')
    expect(isStorageFull(quota)).toBe(true)
    expect(isStorageFull(Object.assign(new Error('aborted'), { name: 'AbortError', inner: quota }))).toBe(true)
  })

  it('does not confuse other failures with lack of space', () => {
    expect(isStorageFull(new Error('otra cosa'))).toBe(false)
    expect(isStorageFull(undefined)).toBe(false)
  })
})

describe('requestPersistentStorage', () => {
  afterEach(() => { Reflect.deleteProperty(navigator, 'storage') })

  function mockStorage(storage: unknown) {
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })
  }

  it('does not ask again when already persistent', async () => {
    const persist = vi.fn(async () => true)
    mockStorage({ persisted: async () => true, persist })
    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('asks when it is not, and survives browsers without the API or that fail', async () => {
    mockStorage({ persisted: async () => false, persist: async () => true })
    await expect(requestPersistentStorage()).resolves.toBe(true)
    mockStorage(undefined)
    await expect(requestPersistentStorage()).resolves.toBe(false)
    mockStorage({ persisted: async () => { throw new Error('no') }, persist: async () => true })
    await expect(requestPersistentStorage()).resolves.toBe(false)
  })
})
