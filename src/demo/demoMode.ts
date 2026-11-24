/**
 * The example wardrobe («Probar con armario de ejemplo»). It lives in a database of its own, opened instead of the real
 * one only in the tab where the example was started: while it is on, the real wardrobe is not even opened, so nothing
 * done in the example can change it. The mark is kept for the tab (sessionStorage): closing it ends the example.
 */
const DEMO_KEY = 'molt-demo'
const TOUR_KEY = 'molt-tour'
const AFTER_KEY = 'molt-after-demo'
export const DEMO_DATABASE_NAME = 'molt-wardrobe-demo'

function readFlag() {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

// Read once: the database is chosen when the app starts, and changing it means loading the app again.
const active = readFlag()

export function isDemo() {
  return active
}

/** Starts the example: this tab opens the example database from now on; `tour`, with the guided tour. */
export function startDemo(reload = () => window.location.reload(), { tour = false } = {}) {
  try {
    sessionStorage.setItem(DEMO_KEY, '1')
    if (tour) sessionStorage.setItem(TOUR_KEY, '1')
  } catch {
    // Without storage for the tab the example cannot be kept apart from the real wardrobe: it is not started.
    return false
  }
  // Always a fresh example: one left behind by a tab closed without leaving it may be from an older version.
  void deleteDemoDatabase().finally(reload)
  return true
}

/** Forgets the mark, so the next load of this tab opens the real wardrobe. The data is deleted by `leaveDemo`. */
export function clearDemoFlag() {
  try {
    sessionStorage.removeItem(DEMO_KEY)
  } catch {
    // Nothing kept for the tab, so the next load opens the real wardrobe anyway.
  }
}

/**
 * Deletes the example database, by its own name: never the real wardrobe, which is a different database. It must be
 * closed first; another tab still showing the example can hold it for a moment, so it is not waited for forever.
 */
export async function deleteDemoDatabase() {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DEMO_DATABASE_NAME)
    request.onsuccess = request.onerror = () => resolve()
    request.onblocked = () => setTimeout(resolve, 3000)
  })
}

/** For the network calls the example does not make (weather, destination photos, Google Drive). */
export const DEMO_OFFLINE_MESSAGE = 'En el armario de ejemplo no se consulta el tiempo: se usa una previsión de muestra.'

// Read once, when the app loads: the tour is asked for when the example starts, and reloading does not start it again.
const tourAsked = take(TOUR_KEY) === '1'
const afterDemo = take(AFTER_KEY) === 'batch' ? 'batch' as const : undefined

/** Whether the example was started for the guided tour. */
export function takeTourRequest() {
  return active && tourAsked
}

/** What to open in the real wardrobe on leaving the example. */
export type AfterDemo = 'batch'

export function requestAfterDemo(page: AfterDemo) {
  try {
    sessionStorage.setItem(AFTER_KEY, page)
  } catch {
    // The real wardrobe then opens on Inicio, which also offers adding garments.
  }
}

export function takeAfterDemo(): AfterDemo | undefined {
  return active ? undefined : afterDemo
}

function take(key: string) {
  try {
    const value = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    return value
  } catch {
    return null
  }
}
