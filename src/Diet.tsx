import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell, Check, ChevronDown, Droplets, Flame, Pencil, Plus, Salad, Scale, Target, Trash2, TriangleAlert, Utensils, X,
} from 'lucide-react'
import { db, dayKey, diffDays, getMeta } from './db'
import {
  getPlan, savePlan, ketoTemplate, blankPlan, newMeal, sortedMeals, setMealStatus, addWater, logWeight, dietStreak,
  toMin, nowMin, DEFAULT_DIET_REMINDERS, type DietPlan, type MealStatus, type DietReminders,
} from './dietData'
import { Ring, toast, fmt12 } from './ui'

export function DietTab({ today, openReminders }: { today: string; openReminders: () => void }) {
  const plan = useLiveQuery(() => getPlan(), [])
  const [editing, setEditing] = useState<DietPlan | null>(null)
  if (plan === undefined) return null
  if (editing) return <PlanEditor initial={editing} isNew={!plan} onClose={() => setEditing(null)} />
  if (!plan) return <DietSetup onPick={p => setEditing(p)} />
  return <DietToday plan={plan} today={today} onEdit={() => setEditing(structuredClone(plan))} openReminders={openReminders} />
}

/* ---------- First run ---------- */
function DietSetup({ onPick }: { onPick: (p: DietPlan) => void }) {
  const t = ketoTemplate()
  return (
    <div className="px-5 pt-6">
      <div className="w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center mb-4"><Salad size={30} className="text-green-400" /></div>
      <h1 className="text-2xl font-extrabold mb-2">Track your diet</h1>
      <p className="text-gray-400 mb-6">Follow a daily meal plan, tick off meals, track water and weigh in weekly, with optional reminders. Everything stays on this device.</p>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-3">
        <div className="text-xs text-green-300 font-semibold mb-1">TEMPLATE</div>
        <div className="font-bold text-lg">{t.name}</div>
        <p className="text-sm text-gray-400 mb-3">{t.meals.length} meals a day · {t.waterMl / 1000} L water · ≤ {t.targets.netCarbs} g net carbs · ~{t.targets.protein} g protein</p>
        <ul className="text-sm space-y-1 mb-4">
          {sortedMeals(t).map(m => (
            <li key={m.id} className="flex gap-3"><span className="w-14 text-gray-500 shrink-0">{m.time ? fmt12(m.time) : 'Anytime'}</span><span className="text-gray-300">{m.items}</span></li>
          ))}
        </ul>
        <button onClick={() => onPick(t)} className="w-full rounded-xl py-3 bg-green-600 font-bold">Use this plan</button>
        <p className="text-xs text-gray-500 mt-2 text-center">You can change portions, times and targets on the next screen.</p>
      </div>
      <button onClick={() => onPick(blankPlan())} className="w-full rounded-xl py-3 bg-white/10 font-semibold">Create my own plan</button>
    </div>
  )
}

/* ---------- Daily view ---------- */
const STATUS: Record<MealStatus, { label: string; cls: string }> = {
  done: { label: 'Ate as planned', cls: 'bg-green-500/15 border-green-500/40' },
  off: { label: 'Off plan', cls: 'bg-yellow-500/10 border-yellow-400/40' },
  skipped: { label: 'Skipped', cls: 'bg-white/5 border-white/10 opacity-60' },
}

function DietToday({ plan, today, onEdit, openReminders }: { plan: DietPlan; today: string; onEdit: () => void; openReminders: () => void }) {
  const day = useLiveQuery(() => db.dietDays.get(today), [today])
  const days = useLiveQuery(() => db.dietDays.toArray(), []) ?? []
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? []
  const rem = useLiveQuery(() => getMeta<DietReminders>('dietReminders', DEFAULT_DIET_REMINDERS), [])
  const [open, setOpen] = useState<string | null>(null)
  const meals = sortedMeals(plan)
  const timed = meals.filter(m => m.time)
  const status = day?.meals ?? {}
  const water = day?.waterMl ?? 0
  const doneCount = timed.filter(m => status[m.id] === 'done').length
  const dayNo = diffDays(plan.startDate, today) + 1
  const week = Math.ceil(dayNo / 7)
  const streak = dietStreak(plan, days, today)

  // Highlight the meal to act on: the latest one that's due but not logged, else the next upcoming.
  const now = nowMin()
  const due = [...timed].reverse().find(m => toMin(m.time) <= now && !status[m.id])
  const next = timed.find(m => toMin(m.time) > now)
  const focusId = due?.id ?? next?.id

  const mark = async (id: string, s: MealStatus) => {
    navigator.vibrate?.(12)
    await setMealStatus(today, id, status[id] === s ? null : s)
    if (s === 'done' && status[id] !== 'done' && doneCount + 1 === timed.length) toast('All meals on plan today!')
  }
  const reminderOn = rem && (rem.meals || rem.water || rem.weighIn)

  return (
    <div className="px-5 pt-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-gray-400 text-sm truncate">{plan.name}</div>
          <h1 className="text-2xl font-extrabold">
            {dayNo < 1 ? 'Starts soon' : dayNo > plan.weeks * 7 ? `Day ${dayNo}` : <>Week {week}<span className="text-gray-500 font-semibold"> / {plan.weeks}</span></>}
          </h1>
          <div className="text-sm text-green-400 font-semibold mt-0.5 flex items-center gap-1"><Flame size={15} /> {streak} day{streak === 1 ? '' : 's'} on plan</div>
        </div>
        <button onClick={onEdit} className="p-2 rounded-xl bg-white/10" aria-label="Edit plan"><Pencil size={18} /></button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-[auto_1fr] gap-4 items-center rounded-2xl bg-white/5 border border-white/10 p-4 mb-5">
        <Ring value={timed.length ? doneCount / timed.length : 0} size={64}>{doneCount}/{timed.length}</Ring>
        <div>
          <div className="flex justify-between items-baseline text-sm mb-1.5">
            <span className="flex items-center gap-1.5 font-semibold"><Droplets size={16} className="text-sky-400" /> Water</span>
            <span className="text-gray-400">{+(water / 1000).toFixed(2)} / {plan.waterMl / 1000} L</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2"><div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, water / plan.waterMl * 100)}%` }} /></div>
          <div className="flex gap-1.5">
            <button onClick={() => addWater(today, 250)} className="flex-1 text-xs rounded-lg py-1.5 bg-sky-500/20 text-sky-200 font-semibold">+ Glass</button>
            <button onClick={() => addWater(today, 500)} className="flex-1 text-xs rounded-lg py-1.5 bg-sky-500/20 text-sky-200 font-semibold">+ Bottle</button>
            <button disabled={!water} onClick={() => addWater(today, -250)} className="text-xs rounded-lg px-2.5 py-1.5 bg-white/10 disabled:opacity-30" aria-label="Undo a glass">−</button>
          </div>
        </div>
      </div>

      {!reminderOn && (
        <button onClick={openReminders} className="w-full text-left mb-5 rounded-2xl border border-dashed border-white/20 p-3 text-sm text-gray-300 flex items-center gap-3">
          <Bell size={18} className="text-orange-300 shrink-0" /><span className="flex-1">Get reminded at meal times and to drink water</span><span className="text-orange-300 font-semibold shrink-0">Set up</span>
        </button>
      )}

      {/* Meals */}
      <h2 className="font-bold text-lg mb-3 flex items-center gap-2"><Utensils size={18} /> Today’s meals</h2>
      <div className="space-y-2 mb-6">
        {meals.map(m => {
          const s = status[m.id]
          const focus = m.id === focusId && !s
          return (
            <div key={m.id} className={`rounded-2xl border p-3.5 transition ${s ? STATUS[s].cls : focus ? 'border-orange-400/60 bg-orange-500/10' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-start gap-3">
                <div className="w-14 shrink-0 text-xs text-gray-400 pt-0.5">{m.time ? fmt12(m.time) : 'Anytime'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.title}</span>
                    {focus && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/30 text-orange-200">{due?.id === m.id ? 'NOW' : 'NEXT'}</span>}
                    {s && <span className="text-[11px] text-gray-400">{STATUS[s].label}</span>}
                  </div>
                  {m.items && <p className="text-sm text-gray-300 mt-0.5">{m.items}</p>}
                  <div className="flex gap-1.5 mt-2.5">
                    <button onClick={() => mark(m.id, 'done')} className={`flex-1 text-xs rounded-lg py-1.5 flex items-center justify-center gap-1 font-semibold ${s === 'done' ? 'bg-green-500 text-white' : 'bg-white/10'}`}><Check size={14} /> Ate it</button>
                    <button onClick={() => mark(m.id, 'off')} className={`flex-1 text-xs rounded-lg py-1.5 flex items-center justify-center gap-1 ${s === 'off' ? 'bg-yellow-500 text-gray-900 font-semibold' : 'bg-white/10'}`}><TriangleAlert size={13} /> Off plan</button>
                    <button onClick={() => mark(m.id, 'skipped')} className={`text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-1 ${s === 'skipped' ? 'bg-gray-400 text-gray-900 font-semibold' : 'bg-white/10'}`} aria-label="Skipped"><X size={13} /> Skip</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Targets */}
      {(plan.targets.kcal > 0 || plan.targets.protein > 0 || plan.targets.netCarbs > 0) && (
        <div className="mb-6">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Target size={18} /> Daily targets</h2>
          <div className="grid grid-cols-3 gap-2">
            {plan.targets.kcal > 0 && <Chip label="Calories" value={`~${plan.targets.kcal.toLocaleString()}`} unit="kcal" />}
            {plan.targets.protein > 0 && <Chip label="Protein" value={`~${plan.targets.protein}`} unit="g" />}
            {plan.targets.netCarbs > 0 && <Chip label="Net carbs" value={`≤ ${plan.targets.netCarbs}`} unit="g" />}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Estimates for following the plan. Not tracked per meal.</p>
        </div>
      )}

      <WeightCard weights={weights} today={today} />

      {plan.rules.length > 0 && <Fold id="rules" title="Plan rules" open={open} setOpen={setOpen} items={plan.rules} />}
      {plan.expect.length > 0 && <Fold id="expect" title="What to expect" open={open} setOpen={setOpen} items={plan.expect} />}
    </div>
  )
}

const Chip = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
    <div className="text-lg font-extrabold leading-tight">{value}<span className="text-xs text-gray-400 font-normal"> {unit}</span></div>
    <div className="text-[11px] text-gray-400">{label}</div>
  </div>
)

function Fold({ id, title, open, setOpen, items }: { id: string; title: string; open: string | null; setOpen: (v: string | null) => void; items: string[] }) {
  const isOpen = open === id
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 mb-3">
      <button onClick={() => setOpen(isOpen ? null : id)} className="w-full flex justify-between items-center p-4 font-semibold">
        {title}<ChevronDown size={18} className={`text-gray-500 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <ul className="px-4 pb-4 space-y-2 text-sm text-gray-300 list-disc pl-8">{items.map((r, i) => <li key={i}>{r}</li>)}</ul>}
    </div>
  )
}

/* ---------- Weight ---------- */
function WeightCard({ weights, today }: { weights: { date: string; kg: number }[]; today: string }) {
  const [val, setVal] = useState('')
  const last = weights[weights.length - 1]
  const first = weights[0]
  const change = last && first && last !== first ? Math.round((last.kg - first.kg) * 10) / 10 : null
  const due = !last || diffDays(last.date, today) >= 7
  const pts = weights.slice(-12)
  const save = async () => {
    const kg = parseFloat(val.replace(',', '.'))
    if (!(kg > 20 && kg < 400)) { toast('Enter your weight in kg'); return }
    await logWeight(kg, dayKey()); setVal(''); toast('Weight saved')
  }
  let path = ''
  if (pts.length > 1) {
    const min = Math.min(...pts.map(p => p.kg)), max = Math.max(...pts.map(p => p.kg)), span = max - min || 1
    path = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${36 - ((p.kg - min) / span) * 32}`).join(' ')
  }
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2"><Scale size={18} /> Weight</h2>
        {last && <span className="text-xs text-gray-400">Last: {new Date(last.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
      </div>
      {last ? (
        <div className="flex items-end gap-4 mb-3">
          <div className="text-3xl font-extrabold">{last.kg}<span className="text-sm text-gray-400 font-normal"> kg</span></div>
          {change !== null && <div className={`text-sm font-semibold pb-1 ${change <= 0 ? 'text-green-400' : 'text-orange-300'}`}>{change > 0 ? '+' : ''}{change} kg since start</div>}
          {path && <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="flex-1 h-10"><polyline points={path} fill="none" stroke="#22c55e" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>}
        </div>
      ) : <p className="text-sm text-gray-400 mb-3">Log your starting weight, then weigh in once a week, same day and time.</p>}
      {due && (
        <div className="flex gap-2">
          <input inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder="Weight in kg"
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-green-400" />
          <button onClick={save} className="rounded-xl px-4 bg-green-600 font-semibold">Save</button>
        </div>
      )}
      {!due && last && <p className="text-xs text-gray-500">Next weigh-in in {7 - diffDays(last.date, today)} day{7 - diffDays(last.date, today) === 1 ? '' : 's'}.</p>}
    </div>
  )
}

/* ---------- Editor ---------- */
function PlanEditor({ initial, isNew, onClose }: { initial: DietPlan; isNew: boolean; onClose: () => void }) {
  const [p, setP] = useState<DietPlan>(initial)
  const [rules, setRules] = useState(initial.rules.join('\n'))
  const [expect, setExpect] = useState(initial.expect.join('\n'))
  const set = (patch: Partial<DietPlan>) => setP({ ...p, ...patch })
  const setMeal = (id: string, patch: Partial<DietPlan['meals'][number]>) => set({ meals: p.meals.map(m => m.id === id ? { ...m, ...patch } : m) })
  const lines = (s: string) => s.split('\n').map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)
  const save = async () => {
    if (!p.meals.length) { toast('Add at least one meal'); return }
    await savePlan({ ...p, name: p.name.trim() || 'My diet plan', rules: lines(rules), expect: lines(expect) })
    toast(isNew ? 'Plan started' : 'Plan saved'); onClose()
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0))
  const field = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 outline-none focus:border-green-400'

  return (
    <div className="px-5 pt-6 pb-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-extrabold">{isNew ? 'Set up your plan' : 'Edit plan'}</h1>
        <button onClick={onClose} className="p-2 rounded-xl bg-white/10" aria-label="Cancel"><X size={18} /></button>
      </div>

      <label className="block text-sm text-gray-400 mb-1">Plan name</label>
      <input value={p.name} onChange={e => set({ name: e.target.value })} className={field + ' mb-4'} />

      <label className="block text-sm text-gray-400 mb-4">Start date<input type="date" value={p.startDate} onChange={e => e.target.value && set({ startDate: e.target.value })} className={field + ' mt-1 [color-scheme:dark]'} /></label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="text-sm text-gray-400">Weeks<input inputMode="numeric" value={p.weeks} onChange={e => set({ weeks: Math.max(1, num(e.target.value)) })} className={field + ' mt-1'} /></label>
        <label className="text-sm text-gray-400">Water (L)<input inputMode="decimal" value={p.waterMl / 1000} onChange={e => set({ waterMl: Math.round((parseFloat(e.target.value) || 0) * 1000) })} className={field + ' mt-1'} /></label>
      </div>

      <div className="text-sm font-semibold mb-2">Daily targets <span className="text-gray-500 font-normal">(optional, 0 hides)</span></div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        <label className="text-xs text-gray-400">Calories<input inputMode="numeric" value={p.targets.kcal} onChange={e => set({ targets: { ...p.targets, kcal: num(e.target.value) } })} className={field + ' mt-1'} /></label>
        <label className="text-xs text-gray-400">Protein g<input inputMode="numeric" value={p.targets.protein} onChange={e => set({ targets: { ...p.targets, protein: num(e.target.value) } })} className={field + ' mt-1'} /></label>
        <label className="text-xs text-gray-400">Net carbs g<input inputMode="numeric" value={p.targets.netCarbs} onChange={e => set({ targets: { ...p.targets, netCarbs: num(e.target.value) } })} className={field + ' mt-1'} /></label>
      </div>

      <div className="text-sm font-semibold mb-2">Meals</div>
      <div className="space-y-2 mb-3">
        {sortedMeals(p).map(m => (
          <div key={m.id} className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
            <div className="flex gap-2">
              <input type="time" value={m.time} onChange={e => setMeal(m.id, { time: e.target.value })} className="bg-white/10 rounded-lg px-2 py-2 text-sm [color-scheme:dark] w-28" aria-label="Time" />
              <input value={m.title} onChange={e => setMeal(m.id, { title: e.target.value })} placeholder="Meal name" className="flex-1 min-w-0 bg-white/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <button onClick={() => set({ meals: p.meals.filter(x => x.id !== m.id) })} className="p-2 text-gray-400" aria-label="Remove meal"><Trash2 size={16} /></button>
            </div>
            <textarea value={m.items} onChange={e => setMeal(m.id, { items: e.target.value })} rows={2} placeholder="What to eat" className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
            {!m.time && <p className="text-[11px] text-gray-500">No time set: shown as “Anytime”, no reminder.</p>}
          </div>
        ))}
      </div>
      <button onClick={() => set({ meals: [...p.meals, newMeal()] })} className="w-full rounded-xl py-2.5 bg-white/10 text-sm flex items-center justify-center gap-1.5 mb-6"><Plus size={16} /> Add meal</button>

      <label className="block text-sm font-semibold mb-1">Rules <span className="text-gray-500 font-normal">(one per line)</span></label>
      <textarea value={rules} onChange={e => setRules(e.target.value)} rows={5} className={field + ' text-sm mb-4'} placeholder="e.g. No sugar or bread" />
      <label className="block text-sm font-semibold mb-1">Notes / what to expect <span className="text-gray-500 font-normal">(one per line)</span></label>
      <textarea value={expect} onChange={e => setExpect(e.target.value)} rows={4} className={field + ' text-sm mb-6'} />

      <button onClick={save} className="w-full rounded-xl py-3.5 bg-green-600 font-bold mb-3">{isNew ? 'Start plan' : 'Save changes'}</button>
      {!isNew && (
        <button onClick={async () => { if (confirm('Stop this plan? Your meal history and weights are kept.')) { await savePlan(null); onClose() } }}
          className="w-full rounded-xl py-3 bg-red-500/10 text-red-300 text-sm">Stop this plan</button>
      )}
    </div>
  )
}
