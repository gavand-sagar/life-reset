// On-device AI via WebLLM. Lazy-loaded so the core app stays small.
import type { MLCEngineInterface, ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { useSyncExternalStore } from 'react'

export interface ModelOption {
  base: string            // id without the q4f16/q4f32 suffix
  label: string
  sizeMB: number          // approx download
  vramMB: number          // approx GPU memory (f16 variant)
  note: string
}

// Curated for a coaching use case, smallest first.
export const MODELS: ModelOption[] = [
  { base: 'SmolLM2-360M-Instruct', label: 'SmolLM2 360M', sizeMB: 270, vramMB: 380, note: 'Tiny and fast. Basic, short replies.' },
  { base: 'Qwen2.5-0.5B-Instruct', label: 'Qwen 2.5 0.5B', sizeMB: 300, vramMB: 950, note: 'Best for most phones. Good short coaching.' },
  { base: 'Llama-3.2-1B-Instruct', label: 'Llama 3.2 1B', sizeMB: 700, vramMB: 880, note: 'Warmer, more natural writing.' },
  { base: 'Qwen2.5-1.5B-Instruct', label: 'Qwen 2.5 1.5B', sizeMB: 1000, vramMB: 1630, note: 'Noticeably smarter. Flagship phones or laptops.' },
  { base: 'gemma-2-2b-it', label: 'Gemma 2 2B', sizeMB: 1400, vramMB: 1900, note: 'High-quality writing. Laptop / desktop.' },
  { base: 'Qwen2.5-3B-Instruct', label: 'Qwen 2.5 3B', sizeMB: 1700, vramMB: 2500, note: 'Strong reasoning. Desktop GPU recommended.' },
  { base: 'Llama-3.2-3B-Instruct', label: 'Llama 3.2 3B', sizeMB: 1800, vramMB: 2260, note: 'Best writing quality here. Desktop GPU.' },
]

export const modelId = (base: string, f16: boolean) =>
  base === 'gemma-2-2b-it'
    ? `gemma-2-2b-it-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`
    : `${base}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`

/* ---------- System check ---------- */
export interface SystemInfo {
  webgpu: boolean
  f16: boolean           // what we'll actually use
  f16Hw: boolean          // what the GPU advertises
  gpuName: string
  maxBufferMB: number
  ramGB: number | null    // navigator.deviceMemory (Chrome only, capped at 8)
  mobile: boolean
  freeStorageMB: number | null
  budgetMB: number        // estimated GPU memory we can safely use
  reason?: string
}

export async function checkSystem(): Promise<SystemInfo> {
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  const ramGB = (navigator as { deviceMemory?: number }).deviceMemory ?? null
  let freeStorageMB: number | null = null
  try {
    const e = await navigator.storage.estimate()
    if (e.quota != null) freeStorageMB = Math.round(((e.quota ?? 0) - (e.usage ?? 0)) / 1048576)
  } catch { /* ignore */ }

  const gpu = (navigator as { gpu?: { requestAdapter: (o?: object) => Promise<GPUAdapterLike | null> } }).gpu
  const base = { mobile, ramGB, freeStorageMB }
  if (!gpu) return { ...base, webgpu: false, f16: false, f16Hw: false, gpuName: '', maxBufferMB: 0, budgetMB: 0, reason: 'This browser has no WebGPU. Try Chrome (Android/desktop) or Safari on iOS 26+.' }
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null)
  if (!adapter) return { ...base, webgpu: false, f16: false, f16Hw: false, gpuName: '', maxBufferMB: 0, budgetMB: 0, reason: 'WebGPU is present but no GPU adapter is available on this device.' }

  const f16Hw = adapter.features.has('shader-f16')
  const maxBufferMB = Math.round(adapter.limits.maxBufferSize / 1048576)
  const info = adapter.info ?? {}
  // Intel iGPUs often advertise shader-f16 but hang during generation; default them to 32-bit.
  const forced = localStorage.getItem('ai-precision')
  const f16 = forced === 'f32' ? false : forced === 'f16' ? f16Hw : f16Hw && !/intel/i.test(info.vendor ?? '')
  const gpuName = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') || 'Unknown GPU'

  // Heuristic: phones share RAM with the OS and other apps; be conservative.
  const ram = ramGB ?? (mobile ? 4 : 8)
  let budgetMB = mobile ? ram * 1024 * 0.3 : ram * 1024 * 0.5
  if (!mobile && ramGB === 8) budgetMB = 4500 // deviceMemory caps at 8, desktops often have more
  if (maxBufferMB < 1000) budgetMB = Math.min(budgetMB, 1100)
  return { ...base, webgpu: true, f16, f16Hw, gpuName, maxBufferMB, budgetMB: Math.round(budgetMB) }
}
interface GPUAdapterLike {
  features: Set<string>
  limits: { maxBufferSize: number }
  info?: { vendor?: string; architecture?: string; device?: string; description?: string }
}

export type Fit = 'recommended' | 'good' | 'risky' | 'heavy'
export function rateModels(sys: SystemInfo) {
  const vram = (m: ModelOption) => sys.f16 ? m.vramMB : Math.round(m.vramMB * 1.25)
  const fits = MODELS.map(m => {
    const v = vram(m)
    let fit: Fit = v <= sys.budgetMB * 0.8 ? 'good' : v <= sys.budgetMB * 1.15 ? 'risky' : 'heavy'
    if (sys.freeStorageMB != null && m.sizeMB * 1.2 > sys.freeStorageMB) fit = 'heavy'
    return { m, fit: fit as Fit, vram: v }
  })
  // Recommend the largest "good" model, but prefer Qwen 0.5B over SmolLM on phones when it fits.
  // Recommend the largest model that runs well, capped at a quality/speed sweet spot for short coaching.
  const cap = sys.mobile ? 700 : 1000
  const good = fits.filter(f => f.fit === 'good' && f.m.sizeMB <= cap)
  const pick = good.length ? good[good.length - 1] : fits.find(f => f.fit === 'risky')
  if (pick) pick.fit = 'recommended'
  return fits
}

/* ---------- Engine store ---------- */
type Status = 'idle' | 'loading' | 'ready' | 'error'
interface State { status: Status; model: string | null; progress: number; text: string; error?: string }
let state: State = { status: 'idle', model: null, progress: 0, text: '' }
let engine: MLCEngineInterface | null = null
let worker: Worker | null = null
const subs = new Set<() => void>()
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach(f => f()) }
export const useAI = () => useSyncExternalStore(cb => (subs.add(cb), () => subs.delete(cb)), () => state)

const lib = () => import('@mlc-ai/web-llm')

export async function isCached(id: string) {
  try { return await (await lib()).hasModelInCache(id) } catch { return false }
}

export async function loadModel(id: string) {
  if (state.model === id && state.status === 'ready') return
  if (state.status === 'loading') return
  set({ status: 'loading', model: id, progress: 0, text: 'Starting…', error: undefined })
  try {
    navigator.storage?.persist?.().catch(() => {})
    const { CreateWebWorkerMLCEngine } = await lib()
    if (engine) { await engine.unload().catch(() => {}); }
    worker?.terminate()
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    engine = await CreateWebWorkerMLCEngine(worker, id, {
      initProgressCallback: r => set({ progress: r.progress, text: r.text }),
    })
    set({ status: 'ready', progress: 1, text: 'Ready' })
  } catch (e) {
    engine = null; worker?.terminate(); worker = null
    set({ status: 'error', error: (e as Error).message || String(e) })
  }
}

export async function deleteModel(id: string) {
  if (state.model === id) { await engine?.unload().catch(() => {}); engine = null; worker?.terminate(); worker = null; set({ status: 'idle', model: null, progress: 0 }) }
  await (await lib()).deleteModelAllInfoInCache(id)
}

export class StuckError extends Error {}

export async function* chat(messages: ChatCompletionMessageParam[], maxTokens = 220) {
  if (!engine) throw new Error('AI model is not loaded')
  const eng = engine
  const stream = await eng.chat.completions.create({ messages, stream: true, temperature: 0.7, max_tokens: maxTokens })
  const it = stream[Symbol.asyncIterator]()
  let first = true
  for (;;) {
    // Watchdog: some GPUs hang silently. Give up if no token arrives in time.
    const limit = first ? 60000 : 20000
    let timer: ReturnType<typeof setTimeout> | undefined
    const next = await Promise.race([
      it.next(),
      new Promise<'stuck'>(res => { timer = setTimeout(() => res('stuck'), limit) }),
    ])
    clearTimeout(timer)
    if (next === 'stuck') {
      eng.interruptGenerate()
      throw new StuckError('The model stopped responding on this GPU.')
    }
    if (next.done) return
    first = false
    yield next.value.choices[0]?.delta?.content ?? ''
  }
}

export const COACH_SYSTEM =
  'You are a warm, concise habit coach inside the "Life Reset" 66-day habit app. ' +
  'Be encouraging and specific, never preachy. Use plain language. Keep replies under 80 words. ' +
  'No medical advice. No lists unless asked.'
