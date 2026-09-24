import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Flag, LockKeyhole, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { StatePanel } from '../components/StatePanel'
import { canOpenLesson } from '../features/lessons/logic'
import { getJourney } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { LessonCatalogItem } from '../types/domain'

const LEVELS: LessonCatalogItem['levelCode'][] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function NodeIcon({ lesson }: { lesson: LessonCatalogItem }) {
  if (lesson.state === 'completed') return <Check aria-hidden="true" />
  if (lesson.state === 'locked') return <LockKeyhole aria-hidden="true" />
  if (lesson.isCheckpoint) return <Flag aria-hidden="true" />
  return <Play aria-hidden="true" />
}

export default function JourneyPage() {
  const { data, error, loading, reload } = useAsyncResource(getJourney, [])
  const [selectedLevel, setSelectedLevel] = useState<LessonCatalogItem['levelCode']>('A1')
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({})
  const activeLesson = data?.find((lesson) => lesson.state === 'current' || lesson.state === 'available')

  useEffect(() => {
    if (!activeLesson) return
    setSelectedLevel(activeLesson.levelCode)
    setOpenModules({ [activeLesson.moduleExternalId]: true })
  }, [activeLesson])

  const levelLessons = useMemo(() => data?.filter((lesson) => lesson.levelCode === selectedLevel) ?? [], [data, selectedLevel])
  const modules = useMemo(() => {
    const grouped = new Map<string, LessonCatalogItem[]>()
    for (const lesson of levelLessons) {
      const key = lesson.moduleExternalId
      grouped.set(key, [...(grouped.get(key) ?? []), lesson])
    }
    return [...grouped.entries()]
  }, [levelLessons])

  if (loading) return <LoadingState label="Traçando sua jornada…" />
  if (error || !data) return <StatePanel title="A jornada não carregou">{error ?? 'Tente novamente.'} <button className="text-button" type="button" onClick={() => void reload()}>Tentar novamente</button></StatePanel>
  return <div className="page journey-page">
    <header className="page-heading"><span className="field-label"><i />360 LIÇÕES · A1 AO C2</span><h1>Sua jornada</h1><p>Conclua uma lição para liberar automaticamente a próxima. Clínicas de gramática ficam disponíveis na área de revisão e não bloqueiam seu avanço.</p></header>
    <div className="level-tabs" role="tablist" aria-label="Níveis do curso">{LEVELS.map((level) => {
      const lessons = data.filter((lesson) => lesson.levelCode === level)
      const completed = lessons.filter((lesson) => lesson.state === 'completed').length
      return <button key={level} type="button" role="tab" aria-selected={selectedLevel === level} onClick={() => setSelectedLevel(level)}><strong>{level}</strong><span>{completed}/{lessons.length}</span></button>
    })}</div>
    <div className="journey-legend" aria-label="Legenda"><span><i className="legend-completed" />Concluída</span><span><i className="legend-current" />Atual</span><span><i className="legend-available" />Disponível</span><span><LockKeyhole aria-hidden="true" />Bloqueada</span></div>
    <section className="level-summary"><div><span className="section-kicker">NÍVEL {selectedLevel}</span><h2>{levelLessons.length} lições em {modules.length} módulos</h2></div><p>{levelLessons.filter((lesson) => lesson.state === 'completed').length} concluídas</p></section>
    <div className="module-list">{modules.map(([moduleKey, lessons], moduleIndex) => {
      const completed = lessons.filter((lesson) => lesson.state === 'completed').length
      const activeModuleKey = activeLesson?.moduleExternalId
      const isOpen = openModules[moduleKey] ?? (moduleKey === activeModuleKey || (!activeModuleKey && moduleIndex === 0))
      return <section className="journey-module" key={moduleKey}>
        <button className="module-toggle" type="button" aria-expanded={isOpen} onClick={() => setOpenModules((current) => ({ ...current, [moduleKey]: !isOpen }))}>
          <span><small>MÓDULO {lessons[0]?.moduleNumber}</small><strong>{lessons[0]?.moduleTitle}</strong></span><span>{completed}/{lessons.length}<ChevronDown aria-hidden="true" /></span>
        </button>
        {isOpen ? <ol className="module-lessons">{lessons.map((lesson) => {
          const progressLabel = lesson.state === 'completed' ? 'Concluída' : lesson.progressPercent >= 95 ? 'Pronta para concluir' : lesson.progressPercent > 0 ? 'Em andamento' : ''
          const content = <><span className="lesson-row__icon"><NodeIcon lesson={lesson} /></span><span className="lesson-row__number">{lesson.moduleLessonNumber}</span><span className="lesson-row__copy"><strong>{lesson.title}</strong><small>{lesson.state === 'locked' ? 'Conclua a aula anterior para liberar' : lesson.summary}</small></span>{progressLabel ? <span className="lesson-row__progress">{progressLabel}</span> : null}</>
          return <li key={lesson.id} className={`lesson-row lesson-row--${lesson.state}`}>{canOpenLesson(lesson) ? <Link to={`/lesson/${lesson.id}`} aria-label={`${lesson.title}, ${lesson.state}`}>{content}</Link> : <div aria-label={`${lesson.title}, bloqueada`}>{content}</div>}</li>
        })}</ol> : null}
      </section>
    })}</div>
  </div>
}
