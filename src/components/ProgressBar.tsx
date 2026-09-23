interface ProgressBarProps {
  value: number
  label?: string
  compact?: boolean
}

export function ProgressBar({ value, label = 'Progresso', compact = false }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value))
  return (
    <div className={compact ? 'progress progress--compact' : 'progress'}>
      <div className="progress__meta"><span>{label}</span><strong>{safeValue}%</strong></div>
      <div className="progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue}>
        <span style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}
