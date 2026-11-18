import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta } from './db'
import {
  DEFAULT_REMINDER, saveReminder, requestPermission, showTest, notifySupported,
  isStandalone, isIOS, downloadCalendarReminder, type Reminder,
} from './reminders'

/* ---------- Toasts ---------- */
let toastMsg: { id: number; text: string } | null = null
const toastSubs = new Set<() => void>()
export function toast(text: string) {
  toastMsg = { id: Date.now(), text }
  toastSubs.forEach(f => f())
  const id = toastMsg.id
  setTimeout(() => { if (toastMsg?.id === id) { toastMsg = null; toastSubs.forEach(f => f()) } }, 2600)
}
export function Toaster() {
  const t = useSyncExternalStore(cb => (toastSubs.add(cb), () => toastSubs.delete(cb)), () => toastMsg)
  if (!t) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-white text-gray-900 text-sm font-semibold shadow-lg toast-in whitespace-nowrap"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }} role="status">{t.text}</div>
  )
}

/* ---------- Celebration ---------- */
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<{ id: number; x: number; d: number; e: string; r: number }[]>([])
  useEffect(() => {
    if (!fire) return
    const em = ['🎉', '🔥', '⭐', '✨', '💪', '🏆']
    setPieces(Array.from({ length: 28 }, (_, i) => ({ id: fire * 100 + i, x: Math.random() * 100, d: Math.random() * 0.6, e: em[i % em.length], r: Math.random() * 360 })))
    const t = setTimeout(() => setPieces([]), 2600)
    return () => clearTimeout(t)
  }, [fire])
  if (!pieces.length) return null
  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden" aria-hidden>
      {pieces.map(p => (
        <span key={p.id} className="absolute text-2xl confetti" style={{ left: `${p.x}%`, animationDelay: `${p.d}s`, transform: `rotate(${p.r}deg)` }}>{p.e}</span>
      ))}
    </div>
  )
}

/* ---------- Progress ring ---------- */
export function Ring({ value, size = 64, stroke = 7, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={value >= 1 ? '#22c55e' : '#f97316'} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{children}</div>
    </div>
  )
}

/* ---------- Reminder settings ---------- */
export function RemindersSettings() {
  const saved = useLiveQuery(() => getMeta<Reminder>('reminder', DEFAULT_REMINDER), [])
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : 'unsupported')
  const [bg, setBg] = useState<boolean | null>(null)
  if (!saved) return null
  const iosBrowser = isIOS() && !isStandalone()

  const update = async (r: Reminder) => {
    if (r.enabled && perm !== 'granted') {
      const p = await requestPermission()
      setPerm(p)
      if (p !== 'granted') {
        toast(p === 'denied' ? 'Notifications are blocked in settings' : 'Notifications not available here')
        // still save so the in-app banner works
      }
    }
    const res = await saveReminder(r)
    setBg(res.backgroundSync)
    if (r.enabled) toast(`Reminder set for ${fmt12(r.time)}`)
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="font-semibold">Daily reminder</span>
          <span className="block text-xs text-gray-400">Only if you still have quests left</span>
        </span>
        <input type="checkbox" className="w-5 h-5 accent-orange-500" checked={saved.enabled} onChange={e => update({ ...saved, enabled: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-300">Time</span>
        <input type="time" value={saved.time} onChange={e => e.target.value && update({ ...saved, time: e.target.value })}
          className="bg-white/10 rounded-lg px-3 py-1.5 [color-scheme:dark]" />
      </label>

      {iosBrowser && <p className="text-xs text-yellow-300">On iPhone, notifications only work after you add the app to your Home Screen (Share → Add to Home Screen) and open it from there.</p>}
      {perm === 'denied' && <p className="text-xs text-yellow-300">Notifications are blocked. Allow them in your browser/phone settings for this site.</p>}
      {saved.enabled && perm === 'granted' && (
        <p className="text-xs text-gray-400">
          {bg ? '✅ Background reminders enabled on this device.' : 'Reminders arrive while the app is open or running in the background. For a guaranteed alarm, add it to your calendar too.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button disabled={perm !== 'granted'} onClick={() => showTest().catch(() => toast('Could not show a notification'))}
          className="text-sm bg-white/10 rounded-xl py-2.5 disabled:opacity-40">Test notification</button>
        <button onClick={() => { downloadCalendarReminder(saved.time); toast('Open the file to add it to your calendar') }}
          className="text-sm bg-white/10 rounded-xl py-2.5">📅 Add to calendar</button>
      </div>
    </div>
  )
}
export const fmt12 = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
