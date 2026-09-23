export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="Barreto English">
      <span className="brand-mark" aria-hidden="true">BE</span>
      {compact ? null : <span>barreto<span className="brand-accent">english</span></span>}
    </span>
  )
}
