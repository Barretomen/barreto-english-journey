import { Check, Flag, LockKeyhole, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { StatePanel } from '../components/StatePanel'
import { canOpenLesson } from '../features/lessons/logic'
import { getJourney } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { LessonCatalogItem } from '../types/domain'

function NodeIcon({ lesson }: { lesson: LessonCatalogItem }) {
  if (lesson.state === 'completed') return <Check aria-hidden="true" />
  if (lesson.state === 'locked') return <LockKeyhole aria-hidden="true" />
  if (lesson.isCheckpoint) return <Flag aria-hidden="true" />
  return <Play aria-hidden="true" />
}

export default function JourneyPage() {
  const { data, error, loading, reload } = useAsyncResource(getJourney, [])
  if (loading) return <LoadingState label="Traçando sua jornada…" />
  if (error || !data) return <StatePanel title="A jornada não carregou">{error ?? 'Tente novamente.'} <button className="text-button" onClick={() => void reload()}>Tentar novamente</button></StatePanel>
  return (
    <div className="page journey-page">
      <header className="page-heading"><span className="field-label"><i />Do primeiro hello às conversas reais</span><h1>Sua jornada</h1><p>O caminho completo fica visível. O conteúdo abre aos poucos, no ritmo definido com o professor.</p></header>
      <div className="journey-legend" aria-label="Legenda"><span><i className="legend-completed" />Concluída</span><span><i className="legend-current" />Atual</span><span><i className="legend-available" />Disponível</span><span><LockKeyhole aria-hidden="true" />Bloqueada</span></div>
      <ol className="learning-path">
        {data.map((lesson, index) => {
          const content = <><span className="path-node__icon"><NodeIcon lesson={lesson} /></span><span className="path-node__week">{lesson.isCheckpoint ? 'CHECKPOINT' : `SEMANA ${lesson.weekNumber}`}</span><strong>{lesson.title}</strong><small>{lesson.state === 'locked' ? 'Conteúdo liberado pelo professor' : lesson.summary}</small>{lesson.progressPercent > 0 ? <span className="path-node__progress">{lesson.progressPercent}%</span> : null}</>
          return <li key={lesson.id} className={`path-node path-node--${lesson.state}${lesson.isCheckpoint ? ' path-node--checkpoint' : ''}`} style={{ '--path-shift': index % 2 === 0 ? '-1' : '1' } as React.CSSProperties}>{canOpenLesson(lesson) ? <Link to={`/lesson/${lesson.id}`} aria-label={`${lesson.title}, ${lesson.state}`}>{content}</Link> : <div aria-label={`${lesson.title}, bloqueada`}>{content}</div>}</li>
        })}
      </ol>
    </div>
  )
}
