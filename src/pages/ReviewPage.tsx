import { useMemo, useState } from 'react'
import { BookOpenCheck, CalendarClock, Check, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { StatePanel } from '../components/StatePanel'
import { getReviewResources, submitGrammarClinicExercise } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { GrammarClinic, JsonValue, ReviewExercise } from '../types/domain'

function ClinicExercise({ exercise }: { exercise: ReviewExercise }) {
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  async function submit() {
    setSubmitting(true)
    try { setMessage(await submitGrammarClinicExercise(exercise.id, answer)) }
    catch { setMessage('Não foi possível enviar agora.') }
    finally { setSubmitting(false) }
  }
  return <div className="clinic-exercise"><h3>{exercise.prompt}</h3>{exercise.instruction ? <p>{exercise.instruction}</p> : null}<textarea className="answer-input answer-textarea" name={`clinic-${exercise.id}`} aria-label="Sua resposta" value={answer} onChange={(event) => { setAnswer(event.target.value); setMessage('') }} />{message ? <p className="clinic-message"><Check aria-hidden="true" />{message}</p> : null}<Button variant="secondary" disabled={!answer.trim() || submitting} onClick={() => void submit()}>{submitting ? 'Enviando…' : 'Registrar resposta'}</Button></div>
}

function readable(value: JsonValue): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === 'string' ? [item] : [JSON.stringify(item)])
  if (typeof value === 'string') return [value]
  return []
}

function Clinic({ clinic }: { clinic: GrammarClinic }) {
  const [open, setOpen] = useState(false)
  return <article className="clinic-card"><button className="clinic-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span><small>{clinic.levelCode} · CLÍNICA</small><strong>{clinic.title}</strong></span><ChevronDown aria-hidden="true" /></button>{open ? <div className="clinic-content">{clinic.why ? <p>{clinic.why}</p> : null}{readable(clinic.focus).length ? <ul>{readable(clinic.focus).map((item, index) => <li key={index}>{item}</li>)}</ul> : null}<div className="clinic-exercises">{clinic.exercises.map((exercise) => <ClinicExercise key={exercise.id} exercise={exercise} />)}</div></div> : null}</article>
}

export default function ReviewPage() {
  const { data, error, loading, reload } = useAsyncResource(getReviewResources, [])
  const [level, setLevel] = useState('Todos')
  const clinics = useMemo(() => data?.clinics.filter((clinic) => level === 'Todos' || clinic.levelCode === level) ?? [], [data, level])
  if (loading) return <LoadingState label="Organizando sua revisão…" />
  if (error || !data) return <StatePanel title="A revisão não carregou">{error ?? 'Tente novamente.'} <button type="button" className="text-button" onClick={() => void reload()}>Tentar novamente</button></StatePanel>
  return <div className="page review-page"><header className="page-heading"><span className="field-label"><i />REVISÃO ESPAÇADA</span><h1>Revisão</h1><p>Revisões aparecem em 1, 3, 7 e 21 dias. As clínicas de gramática são recursos extras e não bloqueiam a jornada.</p></header>
    <section className="due-review-section"><div className="section-title"><div><span className="section-kicker">AGENDA</span><h2>Próximas revisões</h2></div><CalendarClock aria-hidden="true" /></div>{data.dueReviews.length ? <div className="due-review-list">{data.dueReviews.map((review) => <Link key={review.id} to={`/lesson/${review.lessonId}`}><span>{review.levelCode} · +{review.offsetDays} dias</span><strong>{review.lessonTitle}</strong><small>{new Date(review.dueAt).toLocaleDateString('pt-PT')}</small></Link>)}</div> : <div className="review-empty"><BookOpenCheck aria-hidden="true" /><p>Conclua uma lição para iniciar o calendário de revisão.</p></div>}</section>
    <section className="clinic-section"><div className="clinic-heading"><div><span className="section-kicker">41 RECURSOS</span><h2>Clínicas de gramática</h2></div><label>Filtrar por nível<select name="clinic-level" value={level} onChange={(event) => setLevel(event.target.value)}><option>Todos</option>{['A2', 'B1', 'B2', 'C1', 'C2'].map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="clinic-list">{clinics.map((clinic) => <Clinic key={clinic.id} clinic={clinic} />)}</div></section>
  </div>
}
