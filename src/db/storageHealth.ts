// Protections for a wardrobe that exists only in this browser: asking not to be purged, saying when space runs out,
// and reminding the user to keep a copy.

const LAST_BACKUP_KEY = 'molt-last-backup'
const SNOOZE_KEY = 'molt-backup-snooze'
const DAY = 86_400_000

/** Below this, losing the wardrobe costs little and the reminder would only get in the way. */
const REMINDER_MIN_GARMENTS = 5
const REMINDER_INTERVAL = 14 * DAY
const REMINDER_SNOOZE = 7 * DAY

export const STORAGE_FULL_MESSAGE = 'No queda espacio en este dispositivo y no se ha podido guardar. Lo que ya tenías sigue intacto: libera espacio o borra prendas que no uses.'

/** Asks the browser not to purge the wardrobe when space is short. It may say no; nothing else depends on the answer. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage?.persist) return false
    return await storage.persisted() || await storage.persist()
  } catch {
    return false
  }
}

/** Browsers report it as QuotaExceededError; Dexie wraps it in its own errors (`inner`). */
export function isStorageFull(error: unknown): boolean {
  let current = error as { name?: string; inner?: unknown; cause?: unknown } | null | undefined
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.name === 'QuotaExceededError') return true
    current = (current.inner ?? current.cause) as typeof current
  }
  return false
}

function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Without localStorage the reminder just comes back; nothing is lost.
  }
}

export const lastFileBackup = () => read(LAST_BACKUP_KEY)
export const backupReminderSnoozedUntil = () => read(SNOOZE_KEY)
export const recordFileBackup = (now = new Date()) => write(LAST_BACKUP_KEY, now.toISOString())
export const snoozeBackupReminder = (now = new Date()) => write(SNOOZE_KEY, new Date(now.getTime() + REMINDER_SNOOZE).toISOString())

export interface BackupReminderFacts {
  garments: ReadonlyArray<{ updatedAt: string }>
  /** Latest copy to a file or to Drive, whichever is newer. */
  lastBackupAt: string | undefined
  snoozedUntil: string | undefined
  now: Date
}

/** With no copy yet, as soon as the wardrobe is worth keeping; afterwards, when it has changed and the copy is old. */
export function shouldRemindBackup({ garments, lastBackupAt, snoozedUntil, now }: BackupReminderFacts): boolean {
  if (garments.length < REMINDER_MIN_GARMENTS) return false
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return false
  if (!lastBackupAt) return true
  const last = Date.parse(lastBackupAt)
  return now.getTime() - last >= REMINDER_INTERVAL && garments.some((garment) => Date.parse(garment.updatedAt) > last)
}
