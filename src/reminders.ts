// Local-only reminders. No server, so delivery is best-effort:
// 1. While the app is open or alive in the background: a timer fires at the chosen time.
// 2. Android Chrome (installed app): Periodic Background Sync wakes the service worker ~hourly.
// 3. Every launch / foreground: if the time has passed and quests are left, notify once.
// 4. Calendar (.ics) daily alarm: the only option that is 100% reliable on every phone, incl. iPhone.
import { db, getMeta, setMeta, dayKey } from './db'

export interface Reminder { enabled: boolean; time: string }
export const DEFAULT_REMINDER: Reminder = { enabled: false, time: '20:00' }

export const notifySupported = () => 'Notification' in window && 'serviceWorker' in navigator
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

async function periodicSync(on: boolean) {
  try {
    const reg = await navigator.serviceWorker.ready
    const ps = (reg as unknown as { periodicSync?: { register: (t: string, o: object) => Promise<void>; unregister: (t: string) => Promise<void> } }).periodicSync
    if (!ps) return false
    if (!on) { await ps.unregister('daily-reminder'); return false }
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName })
    if (st.state !== 'granted') return false
    await ps.register('daily-reminder', { minInterval: 60 * 60 * 1000 })
    return true
  } catch { return false }
}

export async function saveReminder(r: Reminder) {
  await setMeta('reminder', r)
  const bg = await periodicSync(r.enabled)
  schedule()
  return { backgroundSync: bg }
}

export async function showTest() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Life Reset', { body: 'Reminders are working 🎉', icon: '/pwa-192x192.png', tag: 'test' })
}

async function questsLeft(today: string) {
  const habits = (await db.habits.toArray()).filter(h => h.active)
  const done = new Set((await db.logs.where('date').equals(today).toArray()).map(l => l.habitId))
  return { total: habits.length, left: habits.filter(h => !done.has(h.id!)).length }
}

async function fireIfDue() {
  const r = await getMeta<Reminder>('reminder', DEFAULT_REMINDER)
  if (!r.enabled || !notifySupported() || Notification.permission !== 'granted') return
  const now = new Date(), today = dayKey(now)
  const [hh, mm] = r.time.split(':').map(Number)
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return
  if (await getMeta('reminderLast', '') === today) return
  const { total, left } = await questsLeft(today)
  if (!total || !left) return
  await setMeta('reminderLast', today)
  // If the user is looking at the app right now, an in-app nudge is enough.
  if (document.visibilityState === 'visible') return
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Life Reset', {
    body: `${left} quest${left > 1 ? 's' : ''} left today. Keep your streak alive 🔥`,
    icon: '/pwa-192x192.png', tag: 'daily-reminder',
  })
}

let timer: ReturnType<typeof setTimeout> | undefined
export async function schedule() {
  clearTimeout(timer)
  const r = await getMeta<Reminder>('reminder', DEFAULT_REMINDER)
  if (!r.enabled) return
  const [hh, mm] = r.time.split(':').map(Number)
  const next = new Date(); next.setHours(hh, mm, 0, 0)
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
  // Cap at 1h so a sleeping/throttled timer re-checks regularly.
  timer = setTimeout(() => { fireIfDue().finally(schedule) }, Math.min(next.getTime() - Date.now() + 1000, 3600_000))
}

export function startReminders() {
  schedule()
  // Re-arm the timer when the app returns (timers are frozen while suspended).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule() })
}

/** Daily repeating calendar event with an alarm: reliable on every phone. */
export function downloadCalendarReminder(time: string) {
  const [hh, mm] = time.split(':')
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const url = location.origin
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Reset//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:life-reset-daily-${Date.now()}@life-reset`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${hh}${mm}00`,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY;COUNT=66',
    'SUMMARY:🔥 Life Reset: finish today’s quests',
    `DESCRIPTION:Open Life Reset and keep your streak alive. ${url}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Life Reset quests', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })),
    download: 'life-reset-reminder.ics',
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
