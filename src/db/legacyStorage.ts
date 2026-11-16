const LEGACY_PREFIX = 'vesta-'
const PREFIX = 'molt-'
/** Settings still in use. Anything else under the old name is from versions gone by, and is simply dropped. */
const LEGACY_KEYS = ['drive', 'place', 'weather-cache', 'guide-seen']
const OBSOLETE_KEYS = ['trip', 'weather', 'weather-city']

/**
 * Brings the settings and caches on this device over from before the app was renamed. A value already under the new
 * name wins. Caches are moved in the background: until then a file is simply fetched again.
 */
export function moveLegacyStorage() {
  try {
    for (const key of LEGACY_KEYS) {
      const value = localStorage.getItem(LEGACY_PREFIX + key)
      if (value === null) continue
      if (localStorage.getItem(PREFIX + key) === null) localStorage.setItem(PREFIX + key, value)
      localStorage.removeItem(LEGACY_PREFIX + key)
    }
    for (const key of OBSOLETE_KEYS) localStorage.removeItem(LEGACY_PREFIX + key)
  } catch {
    // Without storage there is nothing to bring over.
  }
  void moveLegacyCaches().catch(() => undefined)
}

export async function moveLegacyCaches() {
  if (typeof caches === 'undefined') return
  for (const name of await caches.keys()) {
    if (!name.startsWith(LEGACY_PREFIX)) continue
    const legacy = await caches.open(name)
    const target = await caches.open(PREFIX + name.slice(LEGACY_PREFIX.length))
    for (const request of await legacy.keys()) {
      const response = await legacy.match(request)
      if (response) await target.put(request, response)
    }
    await caches.delete(name)
  }
}
