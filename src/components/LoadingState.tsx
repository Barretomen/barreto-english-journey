export function LoadingState({ label = 'Carregando…', fullPage = false }: { label?: string; fullPage?: boolean }) {
  return <div className={fullPage ? 'state state--page' : 'state'} role="status"><span className="loader" aria-hidden="true" />{label}</div>
}
