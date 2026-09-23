import { ArrowRight, BookOpen, Flame, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadingState } from '../components/LoadingState'
import { ProgressBar } from '../components/ProgressBar'
import { StatePanel } from '../components/StatePanel'
import { useAuth } from '../features/auth/AuthContext'
import { getDashboard } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { greetingFor } from '../lib/format'

export default function DashboardPage() {
  const { profile } = useAuth()
  const { data, error, loading, reload } = useAsyncResource(() => getDashboard(profile?.id ?? ''), [profile?.id])
  if (loading) return <LoadingState label="Organizando sua próxima aula…" />
  if (error || !data) return <StatePanel title="Não foi possível abrir seu painel">{error ?? 'Tente novamente.'} <button className="text-button" onClick={() => void reload()}>Tentar novamente</button></StatePanel>
  const firstStart = data.completedLessons === 0
  return (
    <div className="page dashboard-page">
      <header className="page-heading dashboard-heading"><div><span className="field-label"><i />{data.level} · sua jornada atual</span><h1>{greetingFor()}, {data.profile.displayName}.</h1><p>{firstStart ? 'Você está começando do início. É exatamente daqui que devemos partir.' : 'Um passo claro por vez. Sua próxima aula está pronta.'}</p></div><span className="level-poster" aria-label={`Nível atual ${data.level}`}>{data.level}<small>CEFR</small></span></header>

      <section className="journey-card" aria-labelledby="journey-overview-title">
        <div className="journey-card__main"><span className="section-kicker">YOUR ENGLISH JOURNEY</span><h2 id="journey-overview-title">{firstStart ? 'First Steps' : 'Continue sua rota'}</h2><ProgressBar value={data.progressPercent} label="Progresso no curso" /><div className="journey-card__stats"><span><Sparkles aria-hidden="true" /><b>{data.xp}</b> XP</span><span><Flame aria-hidden="true" /><b>{data.streak}</b> {data.streak === 1 ? 'dia' : 'dias'} de sequência</span></div></div>
        <div className="journey-card__action">{data.currentLesson ? <><span className="lesson-index">LIÇÃO {String(data.currentLesson.weekNumber ?? 1).padStart(2, '0')}</span><h3>{data.currentLesson.title}</h3><p>{data.currentLesson.summary}</p><Link className="button button--signal" to={`/lesson/${data.currentLesson.id}`}>{firstStart ? 'Começar minha primeira aula' : 'Continuar aprendendo'} <ArrowRight aria-hidden="true" /></Link></> : <p>Aguarde o professor liberar a próxima aula.</p>}</div>
      </section>

      <div className="dashboard-grid">
        <section className="current-module"><div className="section-title"><div><span className="section-kicker">MÓDULO ATUAL</span><h2>{data.currentLesson?.moduleTitle ?? 'Primeiros passos'}</h2></div><BookOpen aria-hidden="true" /></div>{data.currentLesson ? <Link to={`/lesson/${data.currentLesson.id}`} className="module-lesson"><span>{data.currentLesson.weekNumber ? `SEMANA ${data.currentLesson.weekNumber}` : 'CHECKPOINT'}</span><strong>{data.currentLesson.title}</strong><small>{data.currentLesson.progressPercent}% concluído</small><ArrowRight aria-hidden="true" /></Link> : <p>Nenhuma aula liberada no momento.</p>}</section>
        <section className="route-preview"><div className="section-title"><div><span className="section-kicker">SUA ROTA</span><h2>A1 para A2</h2></div><Link to="/journey">Ver jornada</Link></div><div className="route-line" aria-label="Resumo da jornada">{data.journey.slice(0, 8).map((lesson, index) => <span key={lesson.id} className={`route-dot route-dot--${lesson.state}`} aria-label={`${lesson.title}: ${lesson.state}`}><b>{index + 1}</b></span>)}</div><p>{data.completedLessons} de {data.totalPublishedLessons} aulas concluídas</p></section>
      </div>
    </div>
  )
}
