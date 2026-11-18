/* Life Reset: reminder handlers, imported into the generated service worker.
   Reads the app's IndexedDB directly (Dexie store names). No network. */
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
function dayKey(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10) }

async function maybeRemind() {
  const db = await idb()
  const r = (await get(db, 'meta', 'reminder'))?.value
  if (!r || !r.enabled) return
  const now = new Date(), today = dayKey(now)
  const [hh, mm] = String(r.time || '20:00').split(':').map(Number)
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return
  if ((await get(db, 'meta', 'reminderLast'))?.value === today) return
  const habits = (await all(db, 'habits')).filter(h => h.active)
  const logs = (await all(db, 'logs')).filter(l => l.date === today)
  const left = habits.filter(h => !logs.some(l => l.habitId === h.id)).length
  if (!habits.length || left === 0) return
  await put(db, 'meta', { key: 'reminderLast', value: today })
  await self.registration.showNotification('Life Reset', {
    body: `${left} quest${left > 1 ? 's' : ''} left today. Keep your streak alive 🔥`,
    icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: 'daily-reminder', data: { url: '/' },
  })
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
