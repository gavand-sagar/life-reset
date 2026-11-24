import { db, getMeta, setMeta, dayKey, addDays } from './db'

export interface Meal { id: string; time: string; title: string; items: string } // time '' = anytime
export interface DietPlan {
  name: string
  startDate: string
  weeks: number
  waterMl: number
  targets: { kcal: number; protein: number; netCarbs: number }
  meals: Meal[]
  rules: string[]
  expect: string[]
}
export type MealStatus = 'done' | 'off' | 'skipped'
export interface DietDay { date: string; meals: Record<string, MealStatus>; waterMl: number }
export interface Weight { date: string; kg: number }

export interface DietReminders {
  meals: boolean
  water: boolean
  waterEveryH: number
  waterFrom: string
  waterTo: string
  weighIn: boolean
  weighDay: number // 0 = Sunday
  weighTime: string
}
export const DEFAULT_DIET_REMINDERS: DietReminders = {
  meals: false, water: false, waterEveryH: 2, waterFrom: '08:00', waterTo: '20:00',
  weighIn: false, weighDay: 0, weighTime: '08:00',
}

const uid = () => Math.random().toString(36).slice(2, 9)

/** Generic template (single person). Users edit it to fit themselves. */
export function ketoTemplate(): DietPlan {
  return {
    name: 'Keto 1,400 kcal: high protein, low carb',
    startDate: dayKey(),
    weeks: 4,
    waterMl: 3000,
    targets: { kcal: 1400, protein: 90, netCarbs: 20 },
    meals: [
      { id: uid(), time: '07:00', title: 'Wake up', items: 'Lemon water with a pinch of salt + 6 almonds' },
      { id: uid(), time: '09:00', title: 'Breakfast', items: '3 boiled eggs or 100 g paneer bhurji + 1 cucumber' },
      { id: uid(), time: '13:00', title: 'Lunch', items: '150 g chicken / fish / paneer / tofu + 100–150 g green veg or low-carb salad' },
      { id: uid(), time: '16:00', title: 'Snack', items: '80 g plain, unsweetened Greek yogurt' },
      { id: uid(), time: '19:00', title: 'Dinner', items: 'Same as lunch' },
      { id: uid(), time: '', title: 'Anytime', items: '1 tsp white til (sesame) + a few pumpkin seeds' },
    ],
    rules: [
      'Cooking fat per day: about 20 g ghee + 20 g olive oil. Use a little less on paneer days.',
      'Low-carb salad: cucumber, cabbage, capsicum, lettuce, a little tomato. Skip carrot and beetroot, or just a few slices.',
      'Soya chunks at most 2–3 times a week (about 50 g dry). Prefer tofu or paneer.',
      'Greek yogurt must be plain and unsweetened.',
      'No rice, roti, potato, sugar, sweets, bread or fruit juice.',
    ],
    expect: [
      'Week 1: possible tiredness or headache ("keto flu"). More water and salt helps.',
      'Weeks 2–4: less hunger, more energy; early weight loss is mostly water.',
      'If you feel very tired or weak, add more ghee or nuts first.',
      'Check with a doctor first if you are pregnant or planning to be, diabetic, or on medication.',
    ],
  }
}

export function blankPlan(): DietPlan {
  return {
    name: 'My diet plan', startDate: dayKey(), weeks: 4, waterMl: 2500,
    targets: { kcal: 0, protein: 0, netCarbs: 0 },
    meals: [
      { id: uid(), time: '08:00', title: 'Breakfast', items: '' },
      { id: uid(), time: '13:00', title: 'Lunch', items: '' },
      { id: uid(), time: '19:00', title: 'Dinner', items: '' },
    ],
    rules: [], expect: [],
  }
}
export const newMeal = (): Meal => ({ id: uid(), time: '12:00', title: 'Meal', items: '' })

export const getPlan = () => getMeta<DietPlan | null>('dietPlan', null)
export const savePlan = (p: DietPlan | null) => setMeta('dietPlan', p)
export const sortedMeals = (p: DietPlan) =>
  [...p.meals].sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1)

export async function getDay(date: string): Promise<DietDay> {
  return (await db.dietDays.get(date)) ?? { date, meals: {}, waterMl: 0 }
}
export async function setMealStatus(date: string, mealId: string, status: MealStatus | null) {
  const d = await getDay(date)
  if (status) d.meals[mealId] = status; else delete d.meals[mealId]
  await db.dietDays.put(d)
}
export async function addWater(date: string, ml: number) {
  const d = await getDay(date)
  d.waterMl = Math.max(0, d.waterMl + ml)
  await db.dietDays.put(d)
}
export async function logWeight(kg: number, date = dayKey()) {
  await db.weights.put({ date, kg: Math.round(kg * 10) / 10 })
}

/** Days in a row (ending today or yesterday) where every timed meal was eaten on plan. */
export function dietStreak(plan: DietPlan, days: DietDay[], today: string) {
  const ids = plan.meals.filter(m => m.time).map(m => m.id)
  if (!ids.length) return 0
  const byDate = new Map(days.map(d => [d.date, d]))
  const ok = (date: string) => { const d = byDate.get(date); return !!d && ids.every(i => d.meals[i] === 'done') }
  let n = 0
  let d = ok(today) ? today : addDays(today, -1)
  while (ok(d) && d >= plan.startDate) { n++; d = addDays(d, -1) }
  return n
}

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }
