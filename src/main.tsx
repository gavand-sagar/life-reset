import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// Check for a new version on launch, whenever the app comes back to the
// foreground (iOS often resumes a suspended PWA without reloading), and hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    let last = 0
    const check = () => {
      if (!navigator.onLine || Date.now() - last < 60_000) return
      last = Date.now()
      reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    window.addEventListener('focus', check)
    setInterval(check, 60 * 60 * 1000)
  },
})
