import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from './db'
import {
  checkSystem, rateModels, modelId, loadModel, deleteModel, isCached, chat, useAI,
  COACH_SYSTEM, StuckError, type SystemInfo, type Fit,
} from './ai'

const FIT: Record<Fit, [string, string]> = {
  recommended: ['⭐ Recommended', 'bg-green-500/20 text-green-300'],
  good: ['Should run well', 'bg-white/10 text-gray-300'],
  risky: ['May be slow or crash', 'bg-yellow-500/20 text-yellow-300'],
  heavy: ['Too heavy for this device', 'bg-red-500/20 text-red-300'],
}
const fmt = (mb: number) => mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`

export const useAIModel = () => useLiveQuery(() => getMeta<string | null>('aiModel', null), [])

/* ---------- Settings: system check + model picker ---------- */
export function AISettings() {
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [cached, setCached] = useState<Record<string, boolean>>({})
  const chosen = useAIModel()
  const ai = useAI()

  const refreshCache = async (s: SystemInfo) => {
    const out: Record<string, boolean> = {}
    for (const r of rateModels(s)) out[r.m.base] = await isCached(modelId(r.m.base, s.f16))
    setCached(out)
  }
  useEffect(() => { checkSystem().then(s => { setSys(s); if (s.webgpu) refreshCache(s) }) }, [])
  useEffect(() => { if (sys && ai.status === 'ready') refreshCache(sys) }, [ai.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sys) return <p className="text-sm text-gray-400">Checking your device…</p>

  const rated = sys.webgpu ? rateModels(sys) : []
  const choose = async (base: string) => {
    const id = modelId(base, sys.f16)
    await setMeta('aiModel', id)
    loadModel(id).catch(() => {}) // error shown on the card via state
  }
  const remove = async (base: string) => {
    const id = modelId(base, sys.f16)
    if (!confirm('Delete this model from the device? You can download it again later.')) return
    await deleteModel(id)
    if (chosen === id) await setMeta('aiModel', null)
    refreshCache(sys)
  }

  return (
    <div>
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-3 text-sm space-y-1">
        <div className="font-semibold mb-1">🔍 Device check</div>
        <Row k="WebGPU" v={sys.webgpu ? '✅ Supported' : '❌ Not available'} />
        {sys.webgpu && <>
          <Row k="GPU" v={sys.gpuName} />
          <Row k="16-bit shaders" v={sys.f16Hw ? 'Supported' : 'Not supported'} />
          <Row k="Model precision" v={sys.f16 ? '16-bit (smaller, faster)' : '32-bit (compatibility)'} />
          <Row k="Max GPU buffer" v={fmt(sys.maxBufferMB)} />
        </>}
        <Row k="Memory" v={sys.ramGB ? `~${sys.ramGB} GB${sys.ramGB === 8 ? '+' : ''}` : 'Unknown'} />
        <Row k="Free storage" v={sys.freeStorageMB != null ? fmt(sys.freeStorageMB) : 'Unknown'} />
        <Row k="Device" v={sys.mobile ? 'Phone / tablet' : 'Desktop / laptop'} />
        {sys.webgpu && sys.f16Hw && (
          <label className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-white/10">
            <span className="text-gray-300">Compatibility mode <span className="block text-[11px] text-gray-500">Use 32-bit models. Turn on if the AI gets stuck.</span></span>
            <input type="checkbox" checked={!sys.f16} className="w-5 h-5 accent-orange-500"
              onChange={e => { try { localStorage.setItem('ai-precision', e.target.checked ? 'f32' : 'f16') } catch { /* ignore */ } location.reload() }} />
          </label>
        )}
        {sys.reason && <p className="text-yellow-300 pt-1">{sys.reason} The rest of the app works normally.</p>}
      </div>

      {sys.webgpu && <>
        <p className="text-sm text-gray-400 mb-3">Pick any model. It downloads once, then runs fully offline on this device. Your journal never leaves your phone. Use Wi-Fi for the download.</p>
        <div className="space-y-2">
          {rated.map(({ m, fit, vram }) => {
            const id = modelId(m.base, sys.f16)
            const active = chosen === id
            const loadingThis = ai.model === id && ai.status === 'loading'
            const [badge, cls] = FIT[fit]
            return (
              <div key={m.base} className={`rounded-2xl border p-3 ${active ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{m.label}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>{badge}</span>
                  {cached[m.base] && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">Downloaded</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">{m.note}</div>
                <div className="text-xs text-gray-500 mt-1">Download ~{fmt(m.sizeMB)} · needs ~{fmt(vram)} GPU memory</div>
                {loadingThis && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-orange-500 transition-all" style={{ width: `${Math.round(ai.progress * 100)}%` }} /></div>
                    <div className="text-[11px] text-gray-400 mt-1 truncate">{ai.text}</div>
                  </div>
                )}
                {ai.model === id && ai.status === 'error' && <div className="text-xs text-red-300 mt-2">Failed: {ai.error}</div>}
                <div className="flex gap-2 mt-2">
                  {!active || ai.model !== id || ai.status !== 'ready'
                    ? <button disabled={ai.status === 'loading'} onClick={() => {
                        if (fit === 'heavy' && !confirm('This model is likely too heavy for this device and may crash the tab. Try anyway?')) return
                        choose(m.base)
                      }} className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 disabled:opacity-40 font-semibold">
                        {loadingThis ? 'Loading…' : cached[m.base] ? (active ? 'Load' : 'Use this') : `Download & use`}
                      </button>
                    : <span className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300">✓ Active</span>}
                  {cached[m.base] && !loadingThis && <button onClick={() => remove(m.base)} className="text-xs px-3 py-1.5 rounded-lg bg-white/10">Delete</button>}
                </div>
              </div>
            )
          })}
        </div>
        {chosen && <button onClick={() => setMeta('aiModel', null)} className="w-full mt-3 text-sm bg-white/10 rounded-xl py-2">Turn off AI coach</button>}
      </>}
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
  const run = async (prompt: string) => {
    if (!chosen) return
    setBusy(true); setOut(''); setErr('')
    try {
      await loadModel(chosen)
      let acc = ''
      for await (const t of chat([{ role: 'system', content: COACH_SYSTEM }, { role: 'user', content: prompt }])) { acc += t; setOut(acc) }
    } catch (e) {
      setErr(e instanceof StuckError
        ? 'The model got stuck on this GPU. Go to Settings → turn on Compatibility mode, then pick the model again.'
        : (e as Error).message)
    }
    setBusy(false)
  }
  return { chosen, ai, out, busy, err, run }
}

/* ---------- Today: coach nudge ---------- */
export function CoachCard({ context }: { context: string }) {
  const g = useGenerate()
  if (!g.chosen) return null
  return (
    <div className="mt-5 rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold">🤖 AI coach</span>
        <button disabled={g.busy} onClick={() => g.run(`${context}\n\nGive me one short, specific nudge for today.`)} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/40 disabled:opacity-40">
          {g.busy ? (g.ai.status === 'loading' ? `Loading ${Math.round(g.ai.progress * 100)}%` : 'Thinking…') : g.out ? 'Another' : 'Get nudge'}
        </button>
      </div>
      {g.out ? <p className="text-sm whitespace-pre-wrap">{g.out}</p> : <p className="text-xs text-gray-400">Runs on your device, offline.</p>}
      {g.err && <p className="text-xs text-red-300 mt-1">{g.err}</p>}
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
