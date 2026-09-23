import type { ReactNode } from 'react'
import { AlertTriangle, LockKeyhole, WifiOff } from 'lucide-react'

export function StatePanel({ kind = 'error', title, children }: { kind?: 'error' | 'locked' | 'offline'; title: string; children: ReactNode }) {
  const Icon = kind === 'locked' ? LockKeyhole : kind === 'offline' ? WifiOff : AlertTriangle
  return <section className={`state-panel state-panel--${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon aria-hidden="true" /><div><h2>{title}</h2><p>{children}</p></div></section>
}
