import { useEffect, useMemo, useState } from 'react'
import { AlarmClock, BarChart3, Bell, BookOpen, CalendarCheck, Check, ChevronLeft, ChevronRight, Download, Flame, HardDrive, ListChecks, Lock, MessageCircle, PartyPopper, Pause, Play, Settings2, Share, Sparkles, Trash2, Trophy, Upload, User, Zap, type LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, dayKey, addDays, diffDays, getMeta, setMeta, toggleHabit, levelFor,
  exportAll, importAll, resetAll, PROGRAM_DAYS, type Habit,
} from './db'
import { AISettings, CoachCard, Reflect, useAIModel, modelLabel } from './AIPanel'
import { Talk } from './Talk'
import { Confetti, Ring, Toaster, toast, RemindersSettings, fmt12 } from './ui'
import { DEFAULT_REMINDER, startReminders, type Reminder } from './reminders'

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

type Tab = 'today' | 'progress' | 'journal' | 'talk' | 'settings'

export default function App() {
  const start = useLiveQuery(() => getMeta<string | null>('startDate', null), [], undefined)
  const [tab, setTab] = useState<Tab>('today')
  const [page, setPage] = useState<SettingsPage>('home')
  const openSettings = (p: SettingsPage) => { setPage(p); setTab('settings') }
  const today = useToday()
  useEffect(() => { startReminders() }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [tab, page])
  if (start === undefined) return null
  if (!start) return <Onboarding />
  return (
    <div className="mx-auto max-w-md min-h-dvh pb-24">
      {tab === 'today' && <Today start={start} today={today} openSettings={openSettings} />}
      {tab === 'progress' && <Progress start={start} today={today} />}
      {tab === 'journal' && <JournalView today={today} goTalk={() => setTab('talk')} />}
      {tab === 'talk' && <Talk goSettings={() => openSettings('ai')} />}
      {tab === 'settings' && <Settings page={page} setPage={setPage} onAIDone={w => setTab(w)} />}
      <Toaster />
      <nav className="fixed bottom-0 inset-x-0 bg-[#0b0f19]/95 backdrop-blur border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-md grid grid-cols-5">
          {([['today', ListChecks, 'Today'], ['progress', BarChart3, 'Progress'], ['journal', BookOpen, 'Journal'], ['talk', MessageCircle, 'Talk'], ['settings', Settings2, 'Settings']] as const).map(([k, Icon, l]) => (
            <button key={k} onClick={() => { if (k === 'settings') setPage('home'); setTab(k) }} className={`py-3 flex flex-col items-center text-xs ${tab === k ? 'text-orange-400' : 'text-gray-500'}`}>
              <Icon size={22} strokeWidth={tab === k ? 2.4 : 1.8} className="mb-1" />{l}
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
        <div className="w-16 h-16 rounded-2xl bg-orange-500/15 flex items-center justify-center mb-6"><Flame size={36} className="text-orange-400" /></div>
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
const MILESTONES: Record<number, string> = {
  1: 'Day 1. The hardest step is the first one, and you took it.',
  7: 'One full week! The habit is taking root.',
  14: 'Two weeks in. You’re proving it to yourself.',
  21: 'Day 21. Three weeks of showing up.',
  30: 'Day 30! Almost halfway. Look how far you’ve come.',
  45: 'Day 45. The finish line is in sight.',
  60: 'Six days to go. Finish strong.',
  66: 'Day 66! You did it. This is who you are now.',
}
const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Today({ start, today, openSettings }: { start: string; today: string; openSettings: (p: SettingsPage) => void }) {
  const { habits, byDate, xp, streak, day } = useStats(start, today)
  const name = useLiveQuery(() => getMeta('name', ''), []) ?? ''
  const reminder = useLiveQuery(() => getMeta<Reminder>('reminder', DEFAULT_REMINDER), [])
  const done = byDate.get(today) ?? new Set<number>()
  const { lvl, progress, toNext } = levelFor(xp)
  const quote = QUOTES[day % QUOTES.length]
  const pct = Math.min(day, PROGRAM_DAYS) / PROGRAM_DAYS
  const doneCount = habits.filter(h => done.has(h.id!)).length
  const perfect = habits.length > 0 && doneCount === habits.length
  const [boom, setBoom] = useState(0)
  const milestone = MILESTONES[day]

  const tap = async (h: Habit) => {
    navigator.vibrate?.(15)
    const wasLast = !done.has(h.id!) && doneCount === habits.length - 1
    await toggleHabit(today, h)
    if (wasLast) { setBoom(Date.now()); navigator.vibrate?.([30, 50, 30]); toast('Perfect day! Streak protected') }
  }

  // In-app reminder: past the reminder time with quests still open.
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [rh, rm] = (reminder?.time ?? '20:00').split(':').map(Number)
  const left = habits.length - doneCount
  const showNudgeBanner = reminder?.enabled && left > 0 && nowMin >= rh * 60 + rm

  return (
    <div className="px-5 pt-6">
      <Confetti fire={boom} />
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="min-w-0">
          <div className="text-gray-400 text-sm truncate">{greeting()}{name ? `, ${name}` : ''}</div>
          <h1 className="text-2xl font-extrabold">Day {day}{day <= PROGRAM_DAYS && <span className="text-gray-500 font-semibold"> / {PROGRAM_DAYS}</span>}</h1>
          <div className="text-sm text-orange-400 font-semibold mt-0.5 flex items-center gap-1"><Flame size={15} /> {streak} day streak</div>
        </div>
        <Ring value={habits.length ? doneCount / habits.length : 0} size={68}>
          {perfect ? <Check size={26} strokeWidth={3} className="text-green-400" /> : `${doneCount}/${habits.length}`}
        </Ring>
      </div>

      <CoachCard today={today} goSettings={() => openSettings('ai')}
        context={`Day ${day} of a 66-day habit program. Current streak: ${streak} days. Level ${lvl}. Time of day: ${greeting().toLowerCase()}. Quests: ${habits.map(h => `${h.name} (${done.has(h.id!) ? 'done' : 'not done yet'})`).join(', ')}.`} />

      {showNudgeBanner && (
        <div className="mb-4 rounded-2xl bg-orange-500/15 border border-orange-400/40 p-3 text-sm flex items-center gap-2">
          <AlarmClock size={18} className="text-orange-300 shrink-0" />{left} quest{left > 1 ? 's' : ''} left today. You’ve got this!
        </div>
      )}
      {milestone && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-yellow-500/20 to-orange-500/10 border border-yellow-400/30 p-3 text-sm flex items-center gap-2"><Trophy size={18} className="text-yellow-300 shrink-0" />{milestone}</div>
      )}

      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-bold text-lg">Today’s quests</h2>
        <span className="text-xs text-gray-500">Tap to complete</span>
      </div>
      <div className="space-y-2">
        {habits.map(h => {
          const on = done.has(h.id!)
          return (
            <button key={h.id} onClick={() => tap(h)}
              className={`w-full flex items-center gap-3 rounded-2xl p-4 border text-left transition active:scale-[.98] ${on ? 'bg-green-500/15 border-green-500/40' : 'bg-white/5 border-white/10'}`}>
              <span className="text-2xl">{h.emoji}</span>
              <span className={`flex-1 font-medium ${on ? 'line-through text-gray-400' : ''}`}>{h.name}</span>
              <span className={`text-xs ${on ? 'text-green-400' : 'text-gray-500'}`}>+{h.xp} XP</span>
              <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition ${on ? 'bg-green-500 border-green-500 pop' : 'border-gray-600'}`}>{on && <Check size={16} strokeWidth={3} />}</span>
            </button>
          )
        })}
        {!habits.length && <button onClick={() => openSettings('quests')} className="w-full rounded-2xl p-4 border border-dashed border-white/20 text-gray-400 text-sm">No active quests. Tap to add some.</button>}
      </div>
      {perfect && (
        <div className="mt-4 rounded-2xl bg-green-500/15 border border-green-500/40 p-4 font-semibold flex items-center justify-center gap-2"><PartyPopper size={20} className="text-green-300" /> Perfect day! Streak protected.</div>
      )}

      <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="flex justify-between items-baseline mb-2">
          <span className="font-bold">Level {lvl}</span><span className="text-xs text-gray-400">{xp} XP · {toNext} to next</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-purple-400 transition-all" style={{ width: `${progress * 100}%` }} /></div>
        <div className="flex justify-between text-xs text-gray-500 mt-3 mb-1"><span>66-day journey</span><span>{Math.round(pct * 100)}%</span></div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${pct * 100}%` }} /></div>
        <p className="text-sm text-gray-400 mt-3 italic">“{quote}”</p>
      </div>
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
        <Stat label="Current streak" icon={<Flame size={20} className="text-orange-400" />} value={`${streak}`} />
        <Stat label="Best streak" icon={<Trophy size={20} className="text-yellow-300" />} value={`${best}`} />
        <Stat label="Perfect days" icon={<CalendarCheck size={20} className="text-green-400" />} value={`${perfectDays}`} />
        <Stat label="Total XP" icon={<Zap size={20} className="text-purple-300" />} value={`${xp}`} />
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
const Stat = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-2xl font-extrabold flex items-center gap-2">{icon}{value}</div><div className="text-xs text-gray-400">{label}</div></div>
)

/* ---------- Journal ---------- */
function JournalView({ today, goTalk }: { today: string; goTalk: () => void }) {
  const entries = useLiveQuery(() => db.entries.orderBy('createdAt').reverse().limit(100).toArray(), []) ?? []
  const draftKey = 'journal-draft'
  const [text, setText] = useState(() => { try { return localStorage.getItem(draftKey) ?? '' } catch { return '' } })
  const [mood, setMood] = useState(-1)
  const [saved, setSaved] = useState(false)
  useEffect(() => { try { localStorage.setItem(draftKey, text) } catch { /* ignore */ } }, [text])

  const save = async () => {
    if (!text.trim() && mood < 0) return
    await db.entries.add({ date: today, createdAt: Date.now(), mood, text: text.trim() })
    setText(''); setMood(-1); setSaved(true); toast('Entry saved')
    setTimeout(() => setSaved(false), 2500)
  }
  const fmtDay = (d: string) => d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday'
    : new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const groups = entries.reduce<Record<string, typeof entries>>((g, e) => ((g[e.date] ??= []).push(e), g), {})

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Journal</h1>
      <div className="text-sm text-gray-400 mb-2">How do you feel right now?</div>
      <div className="flex justify-between mb-4">
        {MOODS.map((m, i) => (
          <button key={i} onClick={() => setMood(mood === i ? -1 : i)} className={`text-3xl rounded-2xl w-14 h-14 ${mood === i ? 'bg-orange-500/25 ring-2 ring-orange-400' : 'bg-white/5'}`}>{m}</button>
        ))}
      </div>
      {mood >= 0 && mood <= 1 && (
        <button onClick={goTalk} className="w-full mb-3 rounded-xl py-2.5 text-sm bg-purple-500/20 border border-purple-400/30 flex items-center justify-center gap-2"><MessageCircle size={16} /> Rough day? Talk it out with Buddy</button>
      )}
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Wins, struggles, what you learned…" rows={5}
        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-orange-400" />
      <button disabled={!text.trim() && mood < 0} onClick={save} className="mt-2 w-full bg-orange-500 disabled:opacity-40 rounded-xl py-3 font-bold">
        {saved ? <span className="inline-flex items-center gap-1"><Check size={18} /> Saved</span> : 'Save entry'}
      </button>
      <Reflect text={text} mood={mood >= 0 ? MOODS[mood] : ''} />

      <h2 className="font-bold mt-8 mb-3">Entries</h2>
      {!entries.length && <p className="text-sm text-gray-500">No entries yet. Your saved notes will show up here.</p>}
      {Object.entries(groups).map(([day, list]) => (
        <div key={day} className="mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{fmtDay(day)}</div>
          <div className="space-y-2">
            {list.map(e => (
              <div key={e.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>{fmtTime(e.createdAt)} {e.mood >= 0 && <span className="text-base">{MOODS[e.mood]}</span>}</span>
                  <button onClick={() => confirm('Delete this entry?') && db.entries.delete(e.id!)} className="p-1 text-gray-500" aria-label="Delete entry"><Trash2 size={15} /></button>
                </div>
                {e.text && <div className="text-sm whitespace-pre-wrap">{e.text}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Settings ---------- */
type SettingsPage = 'home' | 'profile' | 'quests' | 'reminders' | 'ai' | 'data'

function Settings({ page, setPage, onAIDone }: { page: SettingsPage; setPage: (p: SettingsPage) => void; onAIDone: (where: 'today' | 'talk') => void }) {
  const name = useLiveQuery(() => getMeta('name', ''), []) ?? ''
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const reminder = useLiveQuery(() => getMeta<Reminder>('reminder', DEFAULT_REMINDER), [])
  const aiModel = useAIModel()
  const active = habits.filter(h => h.active).length

  if (page !== 'home') {
    const titles: Record<Exclude<SettingsPage, 'home'>, string> = {
      profile: 'Profile', quests: 'Quests', reminders: 'Reminders', ai: 'AI coach', data: 'Backup & data',
    }
    return (
      <div className="px-5 pt-4">
        <button onClick={() => setPage('home')} className="flex items-center gap-1 text-orange-400 text-sm py-2 -ml-1 mb-1">
          <ChevronLeft size={20} /> Settings
        </button>
        <h1 className="text-2xl font-extrabold mb-5">{titles[page]}</h1>
        {page === 'profile' && <ProfilePage />}
        {page === 'quests' && <QuestsPage />}
        {page === 'reminders' && <RemindersSettings />}
        {page === 'ai' && <AISettings onDone={onAIDone} />}
        {page === 'data' && <DataPage />}
      </div>
    )
  }

  const Item = ({ icon: Icon, color, title, value, to }: { icon: LucideIcon; color: string; title: string; value?: string; to: SettingsPage }) => (
    <button onClick={() => setPage(to)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/5">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}><Icon size={17} /></span>
      <span className="flex-1 font-medium">{title}</span>
      {value && <span className="text-sm text-gray-400 truncate max-w-[45%]">{value}</span>}
      <ChevronRight size={18} className="text-gray-600" />
    </button>
  )
  const Group = ({ label, children }: { label?: string; children: React.ReactNode }) => (
    <div className="mb-6">
      {label && <div className="text-xs uppercase tracking-wide text-gray-500 mb-2 px-1">{label}</div>}
      <div className="rounded-2xl bg-white/5 border border-white/10 divide-y divide-white/5 overflow-hidden">{children}</div>
    </div>
  )

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-5">Settings</h1>

      {!aiModel && (
        <button onClick={() => setPage('ai')} className="w-full text-left mb-6 rounded-2xl p-[1.5px] bg-gradient-to-br from-purple-500 via-fuchsia-500 to-orange-400">
          <div className="rounded-2xl bg-[#141827] p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center"><Sparkles size={20} /></span>
            <span className="flex-1"><span className="font-bold block">Set up your AI coach</span><span className="text-xs text-gray-400">Private, on-device, about 2 minutes</span></span>
            <ChevronRight size={18} className="text-gray-500" />
          </div>
        </button>
      )}

      <Group label="You">
        <Item icon={User} color="bg-blue-500/20 text-blue-300" title="Profile" value={name || 'Add your name'} to="profile" />
        <Item icon={ListChecks} color="bg-green-500/20 text-green-300" title="Quests" value={`${active} active`} to="quests" />
      </Group>
      <Group label="Help & motivation">
        <Item icon={Bell} color="bg-orange-500/20 text-orange-300" title="Reminders" value={reminder?.enabled ? fmt12(reminder.time) : 'Off'} to="reminders" />
        <Item icon={Sparkles} color="bg-purple-500/20 text-purple-300" title="AI coach" value={aiModel ? modelLabel(aiModel) : 'Off'} to="ai" />
      </Group>
      <Group label="Your data">
        <Item icon={HardDrive} color="bg-gray-500/20 text-gray-300" title="Backup & data" to="data" />
      </Group>

      <p className="text-center text-xs text-gray-600 mt-2">Life Reset · private · works offline<br />All your data stays on this device.</p>
      <InstallHint />
    </div>
  )
}

function ProfilePage() {
  const name = useLiveQuery(() => getMeta('name', ''), [])
  const [val, setVal] = useState<string | null>(null)
  if (name === undefined) return null
  const v = val ?? name
  return (
    <div>
      <label className="text-sm text-gray-400 block mb-2">Your name</label>
      <input value={v} onChange={e => setVal(e.target.value)} placeholder="What should we call you?"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-orange-400" />
      <button disabled={v.trim() === name} onClick={async () => { await setMeta('name', v.trim()); setVal(null); toast('Saved') }}
        className="w-full mt-3 bg-orange-500 disabled:opacity-40 rounded-xl py-3 font-bold">Save</button>
    </div>
  )
}

function QuestsPage() {
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray(), []) ?? []
  const [emoji, setEmoji] = useState('⭐')
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await db.habits.add({ name: name.trim(), emoji: emoji || '⭐', xp: 10, active: 1, order: habits.length })
    setName(''); toast('Quest added')
  }
  const upd = (h: Habit, p: Partial<Habit>) => db.habits.update(h.id!, p)
  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">Small daily actions you want to make automatic. Tap a name to rename it. Paused quests don’t count toward your streak.</p>
      <div className="space-y-2 mb-6">
        {habits.map(h => (
          <div key={h.id} className={`rounded-2xl bg-white/5 border border-white/10 p-3 ${h.active ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{h.emoji}</span>
              <input defaultValue={h.name} onBlur={e => e.target.value.trim() && e.target.value !== h.name && upd(h, { name: e.target.value.trim() })}
                className="flex-1 bg-transparent outline-none min-w-0 font-medium" aria-label="Quest name" />
            </div>
            <div className="flex items-center gap-2 mt-2 pl-8">
              <select value={h.xp} onChange={e => upd(h, { xp: +e.target.value })} className="bg-white/10 rounded-lg text-xs px-2 py-1.5" aria-label="XP">
                {[5, 10, 20, 30].map(x => <option key={x} value={x}>{x} XP</option>)}
              </select>
              <button onClick={() => upd(h, { active: h.active ? 0 : 1 })} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 inline-flex items-center gap-1">{h.active ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>
              <button onClick={() => confirm(`Delete "${h.name}"? Its history is kept.`) && db.habits.delete(h.id!)} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300">Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="text-sm font-semibold mb-2">Add a quest</div>
      <div className="flex gap-2">
        <input value={emoji} onChange={e => setEmoji(e.target.value)} className="w-14 text-center text-xl bg-white/5 border border-white/10 rounded-xl" aria-label="Emoji" />
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="e.g. Stretch 5 minutes"
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-orange-400" />
        <button disabled={!name.trim()} onClick={add} className="bg-orange-500 disabled:opacity-40 rounded-xl px-4 font-bold">Add</button>
      </div>
    </div>
  )
}

function DataPage() {
  const exportFile = async () => {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `life-reset-${dayKey()}.json` })
    a.click(); URL.revokeObjectURL(a.href)
    toast('Backup file saved')
  }
  const importFile = async (f?: File) => {
    if (!f) return
    if (!confirm('Restoring replaces everything currently in the app with the backup. Continue?')) return
    try { await importAll(JSON.parse(await f.text())); toast('Backup restored') } catch (e) { toast((e as Error).message) }
  }
  return (
    <div>
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-gray-300 mb-4 flex gap-3">
        <Lock size={18} className="text-gray-400 shrink-0 mt-0.5" /><span>Everything (quests, streaks, journal, chats) is stored only on this device. Nothing is uploaded. If you clear site data or lose the phone, it’s gone, so save a backup now and then.</span>
      </div>
      <button onClick={exportFile} className="w-full bg-orange-500 rounded-xl py-3 font-bold mb-2 flex items-center justify-center gap-2"><Download size={18} /> Save backup file</button>
      <label className="w-full bg-white/10 rounded-xl py-3 cursor-pointer mb-8 flex items-center justify-center gap-2"><Upload size={18} /> Restore from backup
        <input type="file" accept="application/json" className="hidden" onChange={e => importFile(e.target.files?.[0])} />
      </label>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Danger zone</div>
      <button onClick={() => confirm('Erase all data and start over? This cannot be undone.') && resetAll()} className="w-full bg-red-500/15 text-red-300 rounded-xl py-3">Erase everything and start over</button>
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
  if (evt) return <button onClick={() => evt.prompt().then(() => setEvt(null))} className="mt-6 w-full rounded-2xl border border-orange-400/50 bg-orange-500/10 py-3 font-semibold flex items-center justify-center gap-2"><Download size={18} /> Install app</button>
  if (ios) return <p className="mt-6 text-sm text-gray-400 flex items-center justify-center gap-1.5 flex-wrap">To install: tap <Share size={15} /> Share → “Add to Home Screen”</p>
  return null
}
