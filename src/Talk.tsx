import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { chat, loadModel, useAI, StuckError } from './ai'
import { useAIModel } from './AIPanel'

const SYSTEM =
  'You are "Buddy", a warm, gentle companion inside the Life Reset habit app. The user may be feeling low. ' +
  'Listen first. Reflect their feelings back in simple words, validate them, and ask one gentle open question at a time. ' +
  'Keep replies short (2-4 sentences). Do not lecture, do not list tips unless asked, never judge. ' +
  'Offer one small, doable step only when they seem ready (a glass of water, a short walk, breathing, texting a friend). ' +
  'You are not a therapist and do not diagnose or give medical advice. ' +
  'If they mention self-harm, suicide or being unsafe, respond with care and urge them to contact a crisis line or someone they trust right now.'

const CRISIS = /suicid|kill myself|end (it|my life)|self[- ]?harm|hurt myself|don'?t want to (live|be here)|no reason to live|want to die/i

const STARTERS = ['I’m feeling low today', 'I’m stressed and can’t focus', 'I broke my streak and feel bad', 'I just need to vent']

export function Talk({ goSettings }: { goSettings: () => void }) {
  const chosen = useAIModel()
  const ai = useAI()
  const msgs = useLiveQuery(() => db.chat.orderBy('createdAt').toArray(), []) ?? []
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [crisis, setCrisis] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, streaming])
  useEffect(() => { if (msgs.some(m => m.role === 'user' && CRISIS.test(m.content))) setCrisis(true) }, [msgs])

  const busy = streaming !== null
  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy || !chosen) return
    setInput(''); setErr('')
    if (CRISIS.test(t)) setCrisis(true)
    await db.chat.add({ role: 'user', content: t, createdAt: Date.now() })
    setStreaming('')
    try {
      await loadModel(chosen)
      // Small models have short context: send only the recent conversation.
      const history = (await db.chat.orderBy('createdAt').toArray()).slice(-12)
      let acc = ''
      for await (const tok of chat([{ role: 'system', content: SYSTEM }, ...history.map(m => ({ role: m.role, content: m.content }))], 260)) {
        acc += tok; setStreaming(acc)
      }
      if (acc.trim()) await db.chat.add({ role: 'assistant', content: acc.trim(), createdAt: Date.now() })
    } catch (e) {
      setErr(e instanceof StuckError ? 'The model got stuck. Turn on Compatibility mode in Settings and try again.' : (e as Error).message)
    }
    setStreaming(null)
  }

  if (chosen === undefined) return null
  if (!chosen) return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-extrabold mb-3">Talk it out</h1>
      <p className="text-gray-400 mb-5">A private companion to talk to when you’re having a hard day. It runs entirely on your device: nothing you say leaves your phone.</p>
      <button onClick={goSettings} className="w-full bg-orange-500 rounded-xl py-3 font-bold">Set up the on-device AI</button>
      <Helplines />
    </div>
  )

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 90px)' }}>
      <div className="px-5 pt-6 pb-3 flex items-center justify-between sticky top-0 bg-[#0b0f19]/95 backdrop-blur z-10">
        <div>
          <h1 className="text-2xl font-extrabold">Talk it out</h1>
          <div className="text-xs text-gray-500">🔒 Private · on-device · offline</div>
        </div>
        {msgs.length > 0 && !busy && <button onClick={() => confirm('Clear this conversation?') && db.chat.clear()} className="text-xs px-3 py-1.5 rounded-lg bg-white/10">New chat</button>}
      </div>

      <div className="flex-1 px-5 space-y-3 pb-4">
        {msgs.length === 0 && !busy && (
          <div className="rounded-2xl bg-purple-500/10 border border-purple-400/30 p-4">
            <p className="text-sm mb-3">Hey. I’m here to listen, no judgement. How are you feeling right now?</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(s => <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full bg-white/10">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map(m => <Bubble key={m.id} role={m.role} text={m.content} />)}
        {busy && <Bubble role="assistant" text={streaming || (ai.status === 'loading' ? `Waking up… ${Math.round(ai.progress * 100)}%` : '…')} typing />}
        {crisis && <Helplines urgent />}
        {err && <p className="text-xs text-red-300">{err}</p>}
        <div ref={end} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send(input) }}
        className="sticky px-3 py-2 bg-[#0b0f19]/95 backdrop-blur border-t border-white/10 flex gap-2" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={1} placeholder="Type how you feel…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          className="flex-1 resize-none bg-white/5 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-purple-400 max-h-32" />
        <button disabled={busy || !input.trim()} className="rounded-2xl px-4 bg-purple-500 disabled:opacity-40 font-bold">Send</button>
      </form>
    </div>
  )
}

function Bubble({ role, text, typing }: { role: 'user' | 'assistant'; text: string; typing?: boolean }) {
  const me = role === 'user'
  return (
    <div className={`flex ${me ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${me ? 'bg-orange-500 text-white rounded-br-md' : 'bg-white/10 rounded-bl-md'} ${typing ? 'opacity-90' : ''}`}>
        {text}{typing && <span className="inline-block w-1.5 h-4 align-middle ml-0.5 bg-white/60 animate-pulse" />}
      </div>
    </div>
  )
}

function Helplines({ urgent }: { urgent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 text-sm mt-4 ${urgent ? 'bg-red-500/15 border border-red-400/40' : 'bg-white/5 border border-white/10'}`}>
      <div className="font-semibold mb-1">{urgent ? '💛 You don’t have to go through this alone' : 'Need to talk to a person?'}</div>
      <p className="text-gray-300 mb-2">{urgent ? 'If you might act on these thoughts, please reach out to someone right now.' : 'Free, confidential support:'}</p>
      <ul className="space-y-1">
        <li>🇮🇳 Tele-MANAS: <a className="text-orange-300 underline" href="tel:14416">14416</a></li>
        <li>🇮🇳 KIRAN: <a className="text-orange-300 underline" href="tel:18005990019">1800-599-0019</a></li>
        <li>🇺🇸 988 Lifeline: <a className="text-orange-300 underline" href="tel:988">988</a></li>
        <li>🌍 Others: <a className="text-orange-300 underline" href="https://findahelpline.com" target="_blank" rel="noreferrer">findahelpline.com</a></li>
      </ul>
    </div>
  )
}
