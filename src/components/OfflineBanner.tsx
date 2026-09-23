import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return offline ? <div className="offline-banner" role="status"><WifiOff aria-hidden="true" />Você está offline. Aulas já abertas podem continuar disponíveis; o progresso sincroniza quando a conexão voltar.</div> : null
}
