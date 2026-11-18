import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, dayKey, addDays, diffDays, getMeta, setMeta, toggleHabit, levelFor,
  exportAll, importAll, resetAll, PROGRAM_DAYS, type Habit,
} from './db'
import { AISettings, CoachCard, Reflect } from './AIPanel'

const GOALS: Record<string, { label: string; emoji: string; habits: [string, string][] }> = {
  body: { label: 'Fitness', emoji: '💪', habits: [['🏃', 'Move 30 minutes'], ['💧', 'Drink 2L water'], ['🥗', 'Eat a clean meal']] },
  mind: { label: 'Mind', emoji: '🧠', habits: [['📖', 'Read 10 pages'], ['🧘', 'Meditate 10 minutes']] },
  focus: { label: 'Focus', emoji: '🎯', habits: [['⏱️', '1 deep work session'], ['📵', 'No phone first hour']] },
  sleep: { label: 'Sleep', emoji: '😴', habits: [['🌙', 'In bed by 11pm'], ['☀️', 'Wake up on time']] },
  discipline: { label: 'Discipline', emoji: '🔥', habits: [['🚿', 'Cold shower'], ['🛏️', 'Make your bed']] },
  calm: { label: 'Wellbeing', emoji: '🌿', habits: [['✍️', 'Write 3 gratitudes'], ['🚶', 'Walk outside']] },
}
const QUOTES = [
  'Discipline is choosing what you want most over what you want now.',
  'Small steps every day beat big steps once in a while.',
  'You don’t rise to your goals, you fall to your systems.',
  'Show up. Even on the bad days. Especially on the bad days.',
  'The streak is the reward. Protect it.',
  'Be 1% better than yesterday.',
]
const MOODS = ['😞', '😕', '😐', '🙂', '😄']

type Tab = 'today' | 'progress' | 'journal' | 'settings'

export default function App() {
  const start = useLiveQuery(() => getMeta<string | null>('startDate', null), [], undefined)
  const [tab, setTab] = useState<Tab>('today')
  const today = useToday()
  if (start === undefined) return null
  if (!start) return <Onboarding />
  return (
    <div className="mx-auto max-w-md min-h-dvh pb-24">
      {tab === 'today' && <Today start={start} today={today} />}
      {tab === 'progress' && <Progress start={start} today={today} />}
      {tab === 'journal' && <JournalView today={today} />}
      {tab === 'settings' && <Settings />}
      <nav className="fixed bottom-0 inset-x-0 bg-[#0b0f19]/95 backdrop-blur border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-md grid grid-cols-4">
          {([['today', '✅', 'Today'], ['progress', '📈', 'Progress'], ['journal', '📓', 'Journal'], ['settings', '⚙️', 'Settings']] as const).map(([k, i, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-3 flex flex-col items-center text-xs ${tab === k ? 'text-orange-400' : 'text-gray-500'}`}>
              <span className="text-xl leading-none mb-1">{i}</span>{l}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function useToday() {
  const [t, setT] = useState(dayKey())
  useEffect(() => {
    const tick = () => setT(dayKey())
    const id = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return t
}

/* ---------- Onboarding ---------- */
function Onboarding() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [goals, setGoals] = useState<string[]>(['body', 'mind'])
  const picked = goals.flatMap(g => GOALS[g].habits)

  const begin = async () => {
    await db.habits.bulkAdd(picked.map(([emoji, n], i) => ({ name: n, emoji, xp: 10, active: 1, order: i })))
    await setMeta('name', name.trim())
    await setMeta('startDate', dayKey())
  }
  return (
    <div className="mx-auto max-w-md min-h-dvh px-5 py-10 flex flex-col">
      {step === 0 && (<>
        <div className="text-6xl mb-6">🔥</div>
        <h1 className="text-3xl font-extrabold mb-3">Reset your life in 66 days</h1>
        <p className="text-gray-400 mb-8">Research suggests a new habit takes about 66 days to become automatic. Pick a few daily quests, earn XP, and protect your streak. Everything stays on this device.</p>
        <label className="text-sm text-gray-400 mb-2">What should we call you?</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6 outline-none focus:border-orange-400" />
        <button onClick={() => setStep(1)} className="mt-auto btn-primary bg-orange-500 rounded-xl py-4 font-bold">Continue</button>
      </>)}
      {step === 1 && (<>
        <h1 className="text-2xl font-extrabold mb-2">What do you want to improve?</h1>
        <p className="text-gray-400 mb-6">We’ll build your starting quests. You can edit them any time.</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {Object.entries(GOALS).map(([k, g]) => {
            const on = goals.includes(k)
            return (
              <button key={k} onClick={() => setGoals(on ? goals.filter(x => x !== k) : [...goals, k])}
                className={`rounded-2xl p-4 text-left border ${on ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="text-2xl">{g.emoji}</div><div className="font-semibold mt-1">{g.label}</div>
              </button>
            )
          })}
        </div>
        {picked.length > 0 && <div className="text-sm text-gray-400 mb-6">Your quests: {picked.map(p => p[1]).join(' · ')}</div>}
        <div className="mt-auto flex gap-3">
          <button onClick={() => setStep(0)} className="rounded-xl py-4 px-6 bg-white/5">Back</button>
          <button disabled={!picked.length} onClick={begin} className="flex-1 bg-orange-500 disabled:opacity-40 rounded-xl py-4 font-bold">Start day 1</button>
        </div>
      </>)}
    </div>
  )
}

/* ---------- Shared stats ---------- */
function useStats(start: string, today: string) {
  const habits = useLiveQuery(() => db.habits.where('active').equals(1).sortBy('order'), []) ?? []
  const logs = useLiveQuery(() => db.logs.toArray(), []) ?? []
  return useMemo(() => {
    const byDate = new Map<string, Set<number>>()
    let xp = 0
    for (const l of logs) {
      xp += l.xp
      if (!byDate.has(l.date)) byDate.set(l.date, new Set())
      byDate.get(l.date)!.add(l.habitId)
    }
    const ids = habits.map(h => h.id!)
    const ratio = (d: string) => ids.length ? ids.filter(i => byDate.get(d)?.has(i)).length / ids.length : 0
    const perfect = (d: string) => ratio(d) === 1
    // streak: consecutive perfect days ending today (or yesterday if today not done yet)
    let streak = 0
    let d = perfect(today) ? today : addDays(today, -1)
    while (diffDays(start, d) >= 0 && perfect(d)) { streak++; d = addDays(d, -1) }
    let best = 0, run = 0
    for (let i = 0, k = start; diffDays(k, today) >= 0; i++, k = addDays(start, i + 1)) {
      run = perfect(k) ? run + 1 : 0; best = Math.max(best, run)
    }
    const day = diffDays(start, today) + 1
    const perfectDays = [...byDate.keys()].filter(perfect).length
    return { habits, byDate, xp, ratio, streak, best, day, perfectDays }
  }, [habits, logs, start, today])
}

/* ---------- Today ---------- */
function Today({ start, today }: { start: string; today: string }) {
  const { habits, byDate, xp, streak, day } = useStats(start, today)
  const name = useLiveQuery(() => getMeta('name', ''), []) ?? ''
  const done = byDate.get(today) ?? new Set<number>()
  const { lvl, progress, toNext } = levelFor(xp)
  const quote = QUOTES[day % QUOTES.length]
  const pct = Math.min(day, PROGRAM_DAYS) / PROGRAM_DAYS

  return (
    <div className="px-5 pt-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-gray-400 text-sm">{name ? `Hey ${name},` : 'Welcome back'}</div>
          <h1 className="text-2xl font-extrabold">Day {day}{day <= PROGRAM_DAYS && <span className="text-gray-500 font-semibold"> / {PROGRAM_DAYS}</span>}</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-orange-400">🔥 {streak}</div>
          <div className="text-xs text-gray-500">day streak</div>
        </div>
      </div>

      <div className="h-2 rounded-full bg-white/10 mb-5 overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${pct * 100}%` }} /></div>

      <div className="rounded-2xl bg-gradient-to-br from-orange-500/20 to-purple-500/10 border border-white/10 p-4 mb-5">
        <div className="flex justify-between items-baseline mb-2">
          <span className="font-bold">Level {lvl}</span><span className="text-xs text-gray-400">{xp} XP · {toNext} to next</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-purple-400" style={{ width: `${progress * 100}%` }} /></div>
        <p className="text-sm text-gray-300 mt-3 italic">“{quote}”</p>
      </div>

      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-bold text-lg">Today’s quests</h2>
        <span className="text-sm text-gray-400">{habits.filter(h => done.has(h.id!)).length}/{habits.length}</span>
      </div>
      <div className="space-y-2">
        {habits.map(h => {
          const on = done.has(h.id!)
          return (
            <button key={h.id} onClick={() => { navigator.vibrate?.(15); toggleHabit(today, h) }}
              className={`w-full flex items-center gap-3 rounded-2xl p-4 border text-left transition ${on ? 'bg-green-500/15 border-green-500/40' : 'bg-white/5 border-white/10'}`}>
              <span className="text-2xl">{h.emoji}</span>
              <span className={`flex-1 font-medium ${on ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
              <span className="text-xs text-gray-500">+{h.xp}</span>
              <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${on ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>{on && '✓'}</span>
            </button>
          )
        })}
        {!habits.length && <p className="text-gray-500 text-sm">No active quests. Add some in Settings.</p>}
      </div>
      {habits.length > 0 && habits.every(h => done.has(h.id!)) && (
        <div className="mt-5 rounded-2xl bg-green-500/15 border border-green-500/40 p-4 text-center font-semibold">🎉 Perfect day! Streak protected.</div>
      )}
      <CoachCard context={`Day ${day} of a 66-day habit program. Current streak: ${streak} days. Level ${lvl}. Quests: ${habits.map(h => `${h.name} (${done.has(h.id!) ? 'done' : 'not done yet'})`).join(', ')}.`} />
      <InstallHint />
    </div>
  )
}

/* ---------- Progress ---------- */
function Progress({ start, today }: { start: string; today: string }) {
  const { ratio, streak, best, xp, perfectDays, day } = useStats(start, today)
  const total = Math.max(PROGRAM_DAYS, day)
  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Progress</h1>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Current streak" value={`🔥 ${streak}`} />
        <Stat label="Best streak" value={`🏆 ${best}`} />
        <Stat label="Perfect days" value={`${perfectDays}`} />
        <Stat label="Total XP" value={`${xp}`} />
      </div>
      <h2 className="font-bold mb-3">Your {PROGRAM_DAYS}-day journey</h2>
      <div className="grid grid-cols-11 gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const d = addDays(start, i)
          const future = diffDays(d, today) < 0
          const r = future ? 0 : ratio(d)
          const bg = future ? 'bg-white/5' : r === 1 ? 'bg-green-500' : r > 0 ? 'bg-orange-500/60' : 'bg-red-500/25'
          return <div key={d} title={`Day ${i + 1} · ${d}`} className={`aspect-square rounded-md ${bg} ${d === today ? 'ring-2 ring-white' : ''} text-[9px] flex items-center justify-center text-white/70`}>{i + 1}</div>
        })}
      </div>
      <div className="flex gap-4 text-xs text-gray-400 mt-3">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500 mr-1" />All done</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500/60 mr-1" />Partial</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/25 mr-1" />Missed</span>
      </div>
    </div>
  )
}
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-2xl font-extrabold">{value}</div><div className="text-xs text-gray-400">{label}</div></div>
)

/* ---------- Journal ---------- */
function JournalView({ today }: { today: string }) {
  const entry = useLiveQuery(() => db.journal.get(today), [today])
  const past = useLiveQuery(() => db.journal.orderBy('date').reverse().limit(30).toArray(), []) ?? []
  const [text, setText] = useState<string | null>(null)
  const value = text ?? entry?.text ?? ''
  const save = (patch: { mood?: number; text?: string }) =>
    db.journal.put({ date: today, mood: entry?.mood ?? -1, text: value, ...patch, updatedAt: Date.now() })

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Journal</h1>
      <div className="text-sm text-gray-400 mb-2">How do you feel today?</div>
      <div className="flex justify-between mb-4">
        {MOODS.map((m, i) => (
          <button key={i} onClick={() => save({ mood: i })} className={`text-3xl rounded-2xl w-14 h-14 ${entry?.mood === i ? 'bg-orange-500/25 ring-2 ring-orange-400' : 'bg-white/5'}`}>{m}</button>
        ))}
      </div>
      <textarea value={value} onChange={e => setText(e.target.value)} onBlur={() => text !== null && save({ text: value })}
        placeholder="Wins, struggles, what you learned…" rows={6}
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-orange-400" />
      <button onClick={() => save({ text: value })} className="mt-2 w-full bg-orange-500 rounded-xl py-3 font-bold">Save</button>
      <Reflect text={value} mood={entry && entry.mood >= 0 ? MOODS[entry.mood] : ''} />
      <h2 className="font-bold mt-8 mb-3">Past entries</h2>
      <div className="space-y-2">
        {past.filter(p => p.date !== today && (p.text || p.mood >= 0)).map(p => (
          <div key={p.date} className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs text-gray-400 mb-1">{p.date} {p.mood >= 0 && MOODS[p.mood]}</div>
            <div className="text-sm whitespace-pre-wrap">{p.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Settings ---------- */
function Settings() {
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray(), []) ?? []
  const [emoji, setEmoji] = useState('⭐')
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await db.habits.add({ name: name.trim(), emoji: emoji || '⭐', xp: 10, active: 1, order: habits.length })
    setName('')
  }
  const exportFile = async () => {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `life-reset-${dayKey()}.json` })
    a.click(); URL.revokeObjectURL(a.href)
  }
  const importFile = async (f?: File) => {
    if (!f) return
    try { await importAll(JSON.parse(await f.text())); alert('Backup restored.') } catch (e) { alert((e as Error).message) }
  }
  const upd = (h: Habit, p: Partial<Habit>) => db.habits.update(h.id!, p)

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Settings</h1>
      <h2 className="font-bold mb-3">Quests</h2>
      <div className="space-y-2 mb-3">
        {habits.map(h => (
          <div key={h.id} className={`flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-3 ${h.active ? '' : 'opacity-50'}`}>
            <span className="text-xl">{h.emoji}</span>
            <input defaultValue={h.name} onBlur={e => upd(h, { name: e.target.value })} className="flex-1 bg-transparent outline-none min-w-0" />
            <select value={h.xp} onChange={e => upd(h, { xp: +e.target.value })} className="bg-white/10 rounded-lg text-xs px-1 py-1">
              {[5, 10, 20, 30].map(x => <option key={x} value={x}>{x} XP</option>)}
            </select>
            <button onClick={() => upd(h, { active: h.active ? 0 : 1 })} className="text-xs px-2 py-1 rounded-lg bg-white/10">{h.active ? 'Pause' : 'Resume'}</button>
            <button onClick={() => confirm(`Delete "${h.name}"?`) && db.habits.delete(h.id!)} className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-300">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-8">
        <input value={emoji} onChange={e => setEmoji(e.target.value)} className="w-14 text-center bg-white/5 border border-white/10 rounded-xl" aria-label="Emoji" />
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="New quest" className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-orange-400" />
        <button onClick={add} className="bg-orange-500 rounded-xl px-4 font-bold">Add</button>
      </div>

      <h2 className="font-bold mb-1">🤖 On-device AI coach <span className="text-xs font-normal text-gray-400">(optional)</span></h2>
      <div className="mb-8"><AISettings /></div>

      <h2 className="font-bold mb-1">Your data</h2>
      <p className="text-sm text-gray-400 mb-3">Everything is stored only on this device (IndexedDB). Export a backup regularly.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={exportFile} className="bg-white/10 rounded-xl py-3">Export backup</button>
        <label className="bg-white/10 rounded-xl py-3 text-center cursor-pointer">Import backup
          <input type="file" accept="application/json" className="hidden" onChange={e => importFile(e.target.files?.[0])} />
        </label>
      </div>
      <button onClick={() => confirm('Erase all data and start over? This cannot be undone.') && resetAll()} className="w-full bg-red-500/15 text-red-300 rounded-xl py-3 mt-2">Reset everything</button>
      <p className="text-center text-xs text-gray-600 mt-8">Life Reset · works offline</p>
    </div>
  )
}

/* ---------- Install hint ---------- */
type BIP = Event & { prompt: () => Promise<void> }
function InstallHint() {
  const [evt, setEvt] = useState<BIP | null>(null)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (standalone) return null
  if (evt) return <button onClick={() => evt.prompt().then(() => setEvt(null))} className="mt-6 w-full rounded-2xl border border-orange-400/50 bg-orange-500/10 py-3 font-semibold">📲 Install app</button>
  if (ios) return <p className="mt-6 text-center text-sm text-gray-400">📲 To install: tap Share → “Add to Home Screen”</p>
  return null
}
