/* Life Reset: reminder handlers, imported into the generated service worker.
   Reads the app's IndexedDB directly (Dexie store names). No network.
   Mirrors eventsFor()/checkDue() in src/reminders.ts. */
function idb() {
  return new Promise((res, rej) => { const q = indexedDB.open('life-reset'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
}
function get(db, store, key) {
  return new Promise(res => { try { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined) } catch { res(undefined) } })
}
function all(db, store) {
  return new Promise(res => { try { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]) } catch { res([]) } })
}
function put(db, store, val) {
  return new Promise(res => { try { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(val); t.oncomplete = () => res(); t.onerror = () => res() } catch { res() } })
}
const meta = async (db, k, d) => { const r = await get(db, 'meta', k); return r && r.value != null ? r.value : d }
function dayKey(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10) }
const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }

async function events(db, today) {
  const out = []
  const r = await meta(db, 'reminder', { enabled: false, time: '20:00' })
  if (r.enabled) out.push({
    key: 'quests', at: hm(r.time), window: 1440, title: 'Life Reset',
    body: async () => {
      const habits = (await all(db, 'habits')).filter(h => h.active)
      const logs = (await all(db, 'logs')).filter(l => l.date === today)
      const left = habits.filter(h => !logs.some(l => l.habitId === h.id)).length
      return habits.length && left ? `${left} quest${left > 1 ? 's' : ''} left today. Keep your streak alive.` : null
    },
  })
  const plan = await meta(db, 'dietPlan', null)
  const dr = await meta(db, 'dietReminders', {})
  if (plan) {
    const day = async () => (await get(db, 'dietDays', today)) || { meals: {}, waterMl: 0 }
    if (dr.meals) for (const m of plan.meals.filter(m => m.time)) out.push({
      key: 'meal:' + m.id, at: hm(m.time), window: 90, title: m.title + ' time',
      body: async () => ((await day()).meals[m.id] ? null : (m.items || 'Time for ' + m.title.toLowerCase())),
    })
    if (dr.water && plan.waterMl > 0) {
      const from = hm(dr.waterFrom || '08:00'), to = hm(dr.waterTo || '20:00'), step = Math.max(1, dr.waterEveryH || 2) * 60
      for (let t = from + step; t <= to; t += step) out.push({
        key: 'water:' + t, at: t, window: step - 1, title: 'Drink water',
        body: async () => {
          const had = (await day()).waterMl || 0
          const expected = plan.waterMl * Math.min(1, (t - from) / Math.max(1, to - from))
          return had + 1 < expected ? `${(had / 1000).toFixed(1)} of ${plan.waterMl / 1000} L so far. Have a glass now.` : null
        },
      })
    }
    if (dr.weighIn && new Date().getDay() === dr.weighDay) out.push({
      key: 'weigh', at: hm(dr.weighTime || '08:00'), window: 360, title: 'Weekly weigh-in',
      body: async () => ((await get(db, 'weights', today)) ? null : 'Step on the scale and log it in the Diet tab.'),
    })
  }
  return out
}

async function maybeRemind() {
  const db = await idb()
  const now = new Date(), today = dayKey(now), min = now.getHours() * 60 + now.getMinutes()
  const sent = await meta(db, 'notified', { date: today, keys: [] })
  const keys = sent.date === today ? sent.keys : []
  for (const e of await events(db, today)) {
    if (min < e.at || min >= e.at + e.window || keys.includes(e.key)) continue
    const body = await e.body()
    keys.push(e.key)
    await put(db, 'meta', { key: 'notified', value: { date: today, keys } })
    if (body) await self.registration.showNotification(e.title, { body, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: e.key, data: { url: '/' } })
  }
}

self.addEventListener('periodicsync', e => { if (e.tag === 'daily-reminder') e.waitUntil(maybeRemind()) })
self.addEventListener('message', e => { if (e.data && e.data.type === 'check-reminder') e.waitUntil(maybeRemind()) })
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.length) return wins[0].focus()
    return self.clients.openWindow('/')
  })())
})
