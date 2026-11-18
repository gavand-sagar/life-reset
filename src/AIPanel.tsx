import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from './db'
import {
  checkSystem, rateModels, modelId, loadModel, deleteModel, isCached, chat, useAI,
  COACH_SYSTEM, StuckError, MODELS, type SystemInfo, type Fit,
} from './ai'

const FIT: Record<Fit, [string, string]> = {
  recommended: ['⭐ Recommended', 'bg-green-500/20 text-green-300'],
  good: ['Should run well', 'bg-white/10 text-gray-300'],
  risky: ['May be slow or crash', 'bg-yellow-500/20 text-yellow-300'],
  heavy: ['Too heavy for this device', 'bg-red-500/20 text-red-300'],
}
const fmt = (mb: number) => mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`

export const useAIModel = () => useLiveQuery(() => getMeta<string | null>('aiModel', null), [])

/* ---------- Settings: guided AI coach setup ---------- */
export const modelLabel = (id: string | null | undefined) =>
  id ? (MODELS.find(m => id.startsWith(m.base))?.label ?? id) : ''

export function AISettings({ onDone }: { onDone?: (where: 'today' | 'talk') => void }) {
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [cached, setCached] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const [showDevice, setShowDevice] = useState(false)
  const chosen = useAIModel()
  const ai = useAI()

  const refreshCache = async (s: SystemInfo) => {
    const out: Record<string, boolean> = {}
    for (const r of rateModels(s)) out[r.m.base] = await isCached(modelId(r.m.base, s.f16))
    setCached(out)
  }
  useEffect(() => { checkSystem().then(s => { setSys(s); if (s.webgpu) refreshCache(s) }) }, [])
  useEffect(() => { if (sys && ai.status === 'ready') refreshCache(sys) }, [ai.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sys || chosen === undefined) return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-sm text-gray-400">
      <div className="text-2xl mb-2 animate-pulse">🔍</div>Checking what your device can run…
    </div>
  )

  const rated = sys.webgpu ? rateModels(sys) : []
  const rec = rated.find(r => r.fit === 'recommended') ?? rated[0]
  const choose = async (base: string) => {
    const id = modelId(base, sys.f16)
    setShowAll(false)
    window.scrollTo(0, 0)
    await setMeta('aiModel', id)
    loadModel(id).catch(() => {}) // error shown via state
  }
  const remove = async (base: string) => {
    const id = modelId(base, sys.f16)
    if (!confirm('Delete this model from your device? You can download it again later.')) return
    await deleteModel(id)
    if (chosen === id) await setMeta('aiModel', null)
    refreshCache(sys)
  }

  const loading = ai.status === 'loading'
  const failed = ai.status === 'error'
  const ready = !!chosen && ai.model === chosen && ai.status === 'ready'
  const installed = !!chosen && (ready || Object.entries(cached).some(([b, c]) => c && chosen === modelId(b, sys.f16)))

  /* ----- Hero: what is this ----- */
  const Hero = (
    <div className="rounded-3xl p-[1.5px] bg-gradient-to-br from-purple-500 via-fuchsia-500 to-orange-400 mb-4">
      <div className="rounded-3xl bg-[#141827] p-5">
        <div className="text-3xl mb-2">🤖</div>
        <h2 className="text-xl font-extrabold mb-1">Your private AI coach</h2>
        <p className="text-sm text-gray-400 mb-4">A small AI that lives on your phone. No account, no internet needed after setup, and nothing you write ever leaves your device.</p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><span>☀️</span><span><b>Daily nudge</b> on your Today screen</span></li>
          <li className="flex gap-2"><span>💬</span><span><b>Talk it out</b> when you’re having a hard day</span></li>
          <li className="flex gap-2"><span>📓</span><span><b>Journal reflections</b> after you write</span></li>
        </ul>
      </div>
    </div>
  )

  /* ----- Device details (collapsible) ----- */
  const Device = (
    <div className="rounded-2xl bg-white/5 border border-white/10 mt-4">
      <button onClick={() => setShowDevice(!showDevice)} className="w-full flex justify-between items-center p-4 text-sm">
        <span>🔍 Device details</span><span className="text-gray-500">{showDevice ? '▲' : '▼'}</span>
      </button>
      {showDevice && (
        <div className="px-4 pb-4 text-sm space-y-1">
          <Row k="WebGPU" v={sys.webgpu ? '✅ Supported' : '❌ Not available'} />
          {sys.webgpu && <>
            <Row k="GPU" v={sys.gpuName} />
            <Row k="Model precision" v={sys.f16 ? '16-bit (faster)' : '32-bit (compatibility)'} />
            <Row k="Max GPU buffer" v={fmt(sys.maxBufferMB)} />
          </>}
          <Row k="Memory" v={sys.ramGB ? `~${sys.ramGB} GB${sys.ramGB === 8 ? '+' : ''}` : 'Unknown'} />
          <Row k="Free storage" v={sys.freeStorageMB != null ? fmt(sys.freeStorageMB) : 'Unknown'} />
          <Row k="Device" v={sys.mobile ? 'Phone / tablet' : 'Desktop / laptop'} />
          {sys.webgpu && sys.f16Hw && (
            <label className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-white/10">
              <span className="text-gray-300">Compatibility mode <span className="block text-[11px] text-gray-500">Turn on if the AI gets stuck while thinking.</span></span>
              <input type="checkbox" checked={!sys.f16} className="w-5 h-5 accent-orange-500"
                onChange={e => { try { localStorage.setItem('ai-precision', e.target.checked ? 'f32' : 'f16') } catch { /* ignore */ } location.reload() }} />
            </label>
          )}
        </div>
      )}
    </div>
  )

  /* ----- Not supported ----- */
  if (!sys.webgpu) return (
    <div>
      {Hero}
      <div className="rounded-2xl bg-yellow-500/10 border border-yellow-400/30 p-4 text-sm">
        <div className="font-semibold mb-1">This device can’t run the AI coach</div>
        <p className="text-gray-300">{sys.reason} Everything else in Life Reset works normally.</p>
      </div>
      {Device}
    </div>
  )

  /* ----- Model list (advanced) ----- */
  const ModelList = (
    <div className="space-y-2 mt-3">
      {rated.map(({ m, fit, vram }) => {
        const id = modelId(m.base, sys.f16)
        const active = chosen === id
        const loadingThis = ai.model === id && loading
        const [badge, cls] = FIT[fit]
        return (
          <div key={m.base} className={`rounded-2xl border p-3 ${active ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-white/5'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{m.label}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{badge}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">{m.note}</div>
                <div className="text-xs text-gray-500 mt-0.5">{cached[m.base] ? '✓ On this device' : `${fmt(m.sizeMB)} download`} · {fmt(vram)} memory</div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {active && (ready || cached[m.base])
                  ? <span className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 text-center">In use</span>
                  : <button disabled={loading} onClick={() => {
                      if (fit === 'heavy' && !confirm('This model is probably too big for this device and may crash the app. Try anyway?')) return
                      choose(m.base)
                    }} className="text-xs px-3 py-1.5 rounded-lg bg-white/15 disabled:opacity-40 font-semibold">
                      {loadingThis ? '…' : cached[m.base] ? 'Use' : 'Get'}
                    </button>}
                {cached[m.base] && !loadingThis && <button onClick={() => remove(m.base)} className="text-[11px] text-gray-500">Delete</button>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  /* ----- Downloading / loading ----- */
  if (loading) return (
    <div>
      <div className="rounded-3xl bg-white/5 border border-white/10 p-6 text-center">
        <div className="relative w-24 h-24 mx-auto mb-4">
          <svg viewBox="0 0 100 100" className="-rotate-90 w-24 h-24">
            <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.1)" strokeWidth="8" fill="none" />
            <circle cx="50" cy="50" r="44" stroke="url(#g)" strokeWidth="8" fill="none" strokeLinecap="round"
              strokeDasharray={276.5} strokeDashoffset={276.5 * (1 - ai.progress)} style={{ transition: 'stroke-dashoffset .4s' }} />
            <defs><linearGradient id="g"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#f97316" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xl font-extrabold">{Math.round(ai.progress * 100)}%</div>
        </div>
        <div className="font-bold text-lg">{installed ? 'Waking up your coach…' : 'Setting up your coach…'}</div>
        <p className="text-sm text-gray-400 mt-1">{modelLabel(ai.model)}{installed ? '' : ' · one-time download'}</p>
        <p className="text-xs text-gray-500 mt-4">{installed ? 'Loading from your device. No internet needed.' : 'Keep the app open. This only happens once; after that it works offline.'}</p>
      </div>
    </div>
  )

  /* ----- Ready / installed ----- */
  if (chosen && installed && !failed) return (
    <div>
      <div className="rounded-3xl bg-green-500/10 border border-green-400/30 p-5 text-center mb-4">
        <div className="text-4xl mb-2">✅</div>
        <div className="font-extrabold text-lg">Your coach is ready</div>
        <p className="text-sm text-gray-400 mt-1">{modelLabel(chosen)} · runs offline on this device</p>
        {onDone && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => onDone('today')} className="rounded-xl py-3 bg-gradient-to-r from-purple-500 to-fuchsia-500 font-semibold text-sm">☀️ Get today’s nudge</button>
            <button onClick={() => onDone('talk')} className="rounded-xl py-3 bg-white/10 font-semibold text-sm">💬 Talk</button>
          </div>
        )}
      </div>
      <button onClick={() => setShowAll(!showAll)} className="w-full flex justify-between items-center rounded-2xl bg-white/5 border border-white/10 p-4 text-sm">
        <span>🔄 Switch model</span><span className="text-gray-500">{showAll ? '▲' : '▼'}</span>
      </button>
      {showAll && ModelList}
      {Device}
      <button onClick={() => confirm('Turn off the AI coach? Downloaded models stay on the device until you delete them.') && setMeta('aiModel', null)}
        className="w-full mt-4 text-sm text-red-300 bg-red-500/10 rounded-xl py-3">Turn off AI coach</button>
    </div>
  )

  /* ----- Not set up yet: one clear action ----- */
  return (
    <div>
      {Hero}
      {failed && (
        <div className="rounded-2xl bg-red-500/10 border border-red-400/30 p-4 text-sm mb-4">
          <div className="font-semibold mb-1">Setup didn’t finish</div>
          <p className="text-gray-300 break-words">{ai.error}</p>
          <p className="text-gray-400 mt-2">Try again, or pick a smaller model below.</p>
        </div>
      )}
      {rec && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="text-xs text-green-300 font-semibold mb-1">⭐ BEST FOR THIS DEVICE</div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-bold text-lg">{rec.m.label}</div>
            <div className="text-sm text-gray-400">{cached[rec.m.base] ? 'Already downloaded' : fmt(rec.m.sizeMB)}</div>
          </div>
          <p className="text-sm text-gray-400 mb-4">{rec.m.note}</p>
          <button onClick={() => choose(rec.m.base)} className="w-full rounded-xl py-3.5 font-bold bg-gradient-to-r from-purple-500 to-fuchsia-500">
            {failed ? 'Try again' : cached[rec.m.base] ? 'Turn on AI coach' : `Download & set up · ${fmt(rec.m.sizeMB)}`}
          </button>
          {!cached[rec.m.base] && <p className="text-xs text-gray-500 text-center mt-2">📶 Use Wi-Fi. One-time download, then it works offline.</p>}
        </div>
      )}
      <button onClick={() => setShowAll(!showAll)} className="w-full mt-4 flex justify-between items-center rounded-2xl bg-white/5 border border-white/10 p-4 text-sm">
        <span>⚙️ Choose a different model</span><span className="text-gray-500">{showAll ? '▲' : '▼'}</span>
      </button>
      {showAll && <>
        <p className="text-xs text-gray-500 mt-3">Bigger models write better but download more and need more memory. Ratings are based on this device.</p>
        {ModelList}
      </>}
      {Device}
    </div>
  )
}
const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3"><span className="text-gray-400">{k}</span><span className="text-right truncate">{v}</span></div>
)

/* ---------- Shared: generate with the chosen model ---------- */
function useGenerate() {
  const chosen = useAIModel()
  const ai = useAI()
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (prompt: string, onDone?: (text: string) => void) => {
    if (!chosen) return
    setBusy(true); setOut(''); setErr('')
    try {
      await loadModel(chosen)
      let acc = ''
      for await (const t of chat([{ role: 'system', content: COACH_SYSTEM }, { role: 'user', content: prompt }])) { acc += t; setOut(acc) }
      if (acc.trim()) onDone?.(acc.trim())
    } catch (e) {
      setErr(e instanceof StuckError
        ? 'The model got stuck. Close and reopen the app; if it keeps happening, turn on Compatibility mode in Settings or pick a smaller model.'
        : (e as Error).message)
    }
    setBusy(false)
  }
  return { chosen, ai, out, busy, err, run }
}

/* ---------- Today: coach nudge (hero card) ---------- */
export function CoachCard({ context, today, goSettings }: { context: string; today: string; goSettings: () => void }) {
  const g = useGenerate()
  const key = `nudge:${today}`
  const stored = useLiveQuery(() => getMeta<string>(key, ''), [key])
  const hidden = useLiveQuery(() => getMeta('coachTeaserHidden', false), [])

  if (g.chosen === undefined || stored === undefined) return null
  // No model yet: a teaser that explains the feature.
  if (!g.chosen) {
    if (hidden) return null
    return (
      <div className="relative mb-5 rounded-3xl p-[1.5px] bg-gradient-to-br from-purple-500 via-fuchsia-500 to-orange-400">
        <div className="rounded-3xl bg-[#141827] p-4">
          <button onClick={() => setMeta('coachTeaserHidden', true)} className="absolute top-3 right-4 text-gray-500 text-sm" aria-label="Hide">✕</button>
          <div className="text-xs font-semibold text-fuchsia-300 mb-1">✨ NEW · AI COACH</div>
          <p className="text-sm text-gray-200 mb-3">Get a personal nudge every day and a friend to talk to on hard days. Runs privately on your phone, even offline.</p>
          <button onClick={goSettings} className="text-sm px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 font-semibold">Set up AI coach</button>
        </div>
      </div>
    )
  }

  const text = g.busy || g.out ? g.out : stored
  const run = () => g.run(`${context}

Give me one short, specific nudge for today. One or two sentences, address me directly.`, t => setMeta(key, t))
  return (
    <div className="mb-5 rounded-3xl p-[1.5px] bg-gradient-to-br from-purple-500 via-fuchsia-500 to-orange-400 shadow-[0_0_30px_-8px_rgba(217,70,239,.6)]">
      <div className="rounded-3xl bg-[#141827] p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-orange-400 flex items-center justify-center text-lg">🤖</div>
          <div className="flex-1">
            <div className="font-bold leading-tight">Your coach</div>
            <div className="text-[11px] text-gray-400">On-device · private</div>
          </div>
          <button disabled={g.busy} onClick={run} className="text-xs px-3 py-1.5 rounded-full bg-white/10 disabled:opacity-50">
            {g.busy ? (g.ai.status === 'loading' ? `Waking ${Math.round(g.ai.progress * 100)}%` : 'Thinking…') : text ? '↻ New' : 'Get nudge'}
          </button>
        </div>
        {text
          ? <p className="text-[15px] leading-relaxed text-gray-100 whitespace-pre-wrap">{text}{g.busy && <span className="inline-block w-1.5 h-4 align-middle ml-0.5 bg-white/60 animate-pulse" />}</p>
          : g.busy
            ? <div className="space-y-2 py-1"><div className="h-3 rounded bg-white/10 animate-pulse w-11/12" /><div className="h-3 rounded bg-white/10 animate-pulse w-2/3" /></div>
            : <button onClick={run} className="w-full text-left text-sm text-gray-300">Tap for today’s personal nudge →</button>}
        {g.err && <p className="text-xs text-red-300 mt-2">{g.err}</p>}
      </div>
    </div>
  )
}

/* ---------- Journal: reflection ---------- */
export function Reflect({ text, mood }: { text: string; mood: string }) {
  const g = useGenerate()
  if (!g.chosen) return null
  return (
    <div className="mt-3">
      <button disabled={g.busy || !text.trim()} onClick={() => g.run(`My journal entry today (mood: ${mood || 'not set'}):\n"""${text.slice(0, 2000)}"""\n\nReflect back what you notice in 2-3 sentences, then ask me one thoughtful question.`)}
        className="w-full rounded-xl py-3 bg-purple-500/30 border border-purple-400/30 disabled:opacity-40 font-semibold">
        {g.busy ? (g.ai.status === 'loading' ? `Loading model ${Math.round(g.ai.progress * 100)}%` : 'Reflecting…') : '🤖 Reflect on this entry'}
      </button>
      {g.out && <div className="mt-2 rounded-2xl bg-purple-500/10 border border-purple-400/30 p-4 text-sm whitespace-pre-wrap">{g.out}</div>}
      {g.err && <p className="text-xs text-red-300 mt-1">{g.err}</p>}
    </div>
  )
}
