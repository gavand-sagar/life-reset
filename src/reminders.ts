// Local-only reminders. No server, so delivery is best-effort:
// 1. While the app is open or alive in the background: a timer fires at the chosen time.
// 2. Android Chrome (installed app): Periodic Background Sync wakes the service worker ~hourly.
// 3. Every launch / foreground: if the time has passed and quests are left, notify once.
// 4. Calendar (.ics) daily alarm: the only option that is 100% reliable on every phone, incl. iPhone.
import { db, getMeta, setMeta, dayKey } from './db'
import { getPlan, DEFAULT_DIET_REMINDERS, type DietReminders } from './dietData'

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
  const dr = await getMeta<DietReminders>('dietReminders', DEFAULT_DIET_REMINDERS)
  const bg = await periodicSync(r.enabled || dr.meals || dr.water || dr.weighIn)
  schedule()
  return { backgroundSync: bg }
}

export async function showTest() {
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification('Life Reset', { body: 'Reminders are working.', icon: '/pwa-192x192.png', tag: 'test' })
}

async function questsLeft(today: string) {
  const habits = (await db.habits.toArray()).filter(h => h.active)
  const done = new Set((await db.logs.where('date').equals(today).toArray()).map(l => l.habitId))
  return { total: habits.length, left: habits.filter(h => !done.has(h.id!)).length }
}

/* ---------- Reminder events (quests, meals, water, weigh-in) ---------- */
interface Event { key: string; at: number; window: number; title: string; body: () => Promise<string | null> }
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

async function eventsFor(today: string): Promise<Event[]> {
  const out: Event[] = []
  const r = await getMeta<Reminder>('reminder', DEFAULT_REMINDER)
  if (r.enabled) out.push({
    key: 'quests', at: hm(r.time), window: 24 * 60, title: 'Life Reset',
    body: async () => { const { total, left } = await questsLeft(today); return total && left ? `${left} quest${left > 1 ? 's' : ''} left today. Keep your streak alive.` : null },
  })
  const plan = await getPlan()
  const dr = await getMeta<DietReminders>('dietReminders', DEFAULT_DIET_REMINDERS)
  if (plan) {
    if (dr.meals) for (const m of plan.meals.filter(m => m.time)) out.push({
      key: `meal:${m.id}`, at: hm(m.time), window: 90, title: `${m.title} time`,
      body: async () => ((await db.dietDays.get(today))?.meals[m.id] ? null : m.items || `Time for ${m.title.toLowerCase()}`),
    })
    if (dr.water && plan.waterMl > 0) {
      const from = hm(dr.waterFrom), to = hm(dr.waterTo), step = Math.max(1, dr.waterEveryH) * 60
      for (let t = from + step; t <= to; t += step) out.push({
        key: `water:${t}`, at: t, window: step - 1, title: 'Drink water',
        body: async () => {
          const had = (await db.dietDays.get(today))?.waterMl ?? 0
          const expected = plan.waterMl * Math.min(1, (t - from) / Math.max(1, to - from))
          return had + 1 < expected ? `${(had / 1000).toFixed(1)} of ${plan.waterMl / 1000} L so far. Have a glass now.` : null
        },
      })
    }
    if (dr.weighIn && new Date().getDay() === dr.weighDay) out.push({
      key: 'weigh', at: hm(dr.weighTime), window: 6 * 60, title: 'Weekly weigh-in',
      body: async () => ((await db.weights.get(today)) ? null : 'Step on the scale and log it in the Diet tab.'),
    })
  }
  return out
}

/** Fire anything due now. Visible app → in-app toast; hidden → system notification. */
export async function checkDue() {
  const now = new Date(), today = dayKey(now), min = now.getHours() * 60 + now.getMinutes()
  const sent = await getMeta<{ date: string; keys: string[] }>('notified', { date: today, keys: [] })
  const keys = sent.date === today ? sent.keys : []
  for (const e of await eventsFor(today)) {
    if (min < e.at || min >= e.at + e.window || keys.includes(e.key)) continue
    const body = await e.body()
    keys.push(e.key)
    await setMeta('notified', { date: today, keys })
    if (!body) continue
    if (document.visibilityState === 'visible') {
      window.dispatchEvent(new CustomEvent('lr-reminder', { detail: `${e.title}: ${body}` }))
    } else if (notifySupported() && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(e.title, { body, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: e.key })
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
export async function schedule() {
  clearTimeout(timer)
  const now = new Date(), min = now.getHours() * 60 + now.getMinutes()
  const upcoming = (await eventsFor(dayKey(now))).map(e => e.at).filter(t => t > min).sort((a, b) => a - b)
  const wait = upcoming.length ? (upcoming[0] - min) * 60_000 - now.getSeconds() * 1000 + 1000 : 3600_000
  // Cap at 30 min so a throttled timer re-checks regularly.
  timer = setTimeout(() => { checkDue().finally(schedule) }, Math.min(wait, 30 * 60_000))
}

export function startReminders() {
  checkDue().finally(schedule)
  // Re-arm when the app returns (timers are frozen while suspended).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDue().finally(schedule) })
}

export async function saveDietReminders(r: DietReminders) {
  await setMeta('dietReminders', r)
  if (r.meals || r.water || r.weighIn) await periodicSync(true)
  schedule()
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
