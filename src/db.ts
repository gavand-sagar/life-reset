import Dexie, { type EntityTable } from 'dexie'

export interface Habit { id?: number; name: string; emoji: string; xp: number; active: number; order: number }
export interface Log { key: string; date: string; habitId: number; xp: number }
export interface Journal { date: string; mood: number; text: string; updatedAt: number }
export interface Meta { key: string; value: unknown }

export const db = new Dexie('life-reset') as Dexie & {
  habits: EntityTable<Habit, 'id'>
  logs: EntityTable<Log, 'key'>
  journal: EntityTable<Journal, 'date'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  habits: '++id, active, order',
  logs: 'key, date, habitId',
  journal: 'date',
  meta: 'key',
})

export const PROGRAM_DAYS = 66

export const dayKey = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return dayKey(d)
}
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key)
  return (m?.value as T) ?? fallback
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

export async function toggleHabit(date: string, habit: Habit) {
  const key = `${date}|${habit.id}`
  if (await db.logs.get(key)) await db.logs.delete(key)
  else await db.logs.put({ key, date, habitId: habit.id!, xp: habit.xp })
}

export const levelFor = (xp: number) => {
  // level n needs 50 * n * (n-1) total XP
  let lvl = 1
  while (50 * (lvl + 1) * lvl <= xp) lvl++
  const base = 50 * lvl * (lvl - 1)
  const next = 50 * (lvl + 1) * lvl
  return { lvl, progress: (xp - base) / (next - base), toNext: next - xp }
}

export async function exportAll() {
  const [habits, logs, journal, meta] = await Promise.all([
    db.habits.toArray(), db.logs.toArray(), db.journal.toArray(), db.meta.toArray(),
  ])
  return { app: 'life-reset', version: 1, exportedAt: new Date().toISOString(), habits, logs, journal, meta }
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== 'life-reset') throw new Error('Not a Life Reset backup file')
  await db.transaction('rw', [db.habits, db.logs, db.journal, db.meta], async () => {
    await Promise.all([db.habits.clear(), db.logs.clear(), db.journal.clear(), db.meta.clear()])
    await db.habits.bulkPut(data.habits)
    await db.logs.bulkPut(data.logs)
    await db.journal.bulkPut(data.journal)
    await db.meta.bulkPut(data.meta)
  })
}

export async function resetAll() {
  await db.delete()
  location.reload()
}
