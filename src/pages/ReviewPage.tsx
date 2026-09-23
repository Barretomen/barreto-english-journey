import { BookOpenCheck } from 'lucide-react'

export default function ReviewPage() {
  return <div className="page"><header className="page-heading"><span className="field-label"><i />REVISÃO INTELIGENTE</span><h1>Revisão</h1><p>Seus erros e palavras marcadas aparecerão aqui conforme você avançar.</p></header><section className="empty-state"><BookOpenCheck aria-hidden="true" /><h2>Nada para revisar ainda</h2><p>Complete a primeira aula. Depois, esta área organiza os pontos que merecem uma nova tentativa.</p></section></div>
}
