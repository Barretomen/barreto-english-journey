import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Mic2, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { LessonAudioPlayer } from '../components/LessonAudioPlayer'
import { LoadingState } from '../components/LoadingState'
import { ProgressBar } from '../components/ProgressBar'
import { StatePanel } from '../components/StatePanel'
import { useAuth } from '../features/auth/AuthContext'
import { evaluateAnswer } from '../features/lessons/logic'
import { completeLesson, getJourney, getLesson, saveLessonPosition, submitExerciseAttempt } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { AudioStatus, JsonValue, LessonBlock } from '../types/domain'

function readText(content: Record<string, JsonValue>, key: string): string {
  const value = content[key]
  return typeof value === 'string' ? value : ''
}

function audioStatus(block: LessonBlock): AudioStatus {
  return block.audio?.status ?? 'missing'
}

function supportsAudio(block: LessonBlock): boolean {
  return ['vocabulary', 'example', 'listening', 'speaking'].includes(block.type)
}

function ContentBlock({ block }: { block: LessonBlock }) {
  const content = block.content
  const player = supportsAudio(block) ? <LessonAudioPlayer blockId={block.id} status={audioStatus(block)} /> : null
  if (block.type === 'vocabulary') {
    return <article className="lesson-block vocabulary-card"><span className="section-kicker">VOCABULÁRIO</span><h2>{readText(content, 'term')}</h2><strong>{readText(content, 'translation')}</strong><p>{readText(content, 'example')}</p>{readText(content, 'note') ? <small>{readText(content, 'note')}</small> : null}{player}</article>
  }
  if (block.type === 'speaking') {
    return <article className="lesson-block speaking-card"><Mic2 aria-hidden="true" /><div><span className="section-kicker">SPEAKING</span><h2>{readText(content, 'phrase')}</h2><p>{readText(content, 'translation')}</p><small>{readText(content, 'disclaimer')}</small>{player}</div></article>
  }
  return <article className={`lesson-block lesson-block--${block.type}`}><span className="section-kicker">{block.type === 'checkpoint' ? 'CONCLUÍDO' : 'APRENDA'}</span>{block.title ? <h2>{block.title}</h2> : null}<p>{readText(content, 'body')}</p>{player}</article>
}

function ExerciseBlock({ block, demo, onAnswered }: { block: LessonBlock; demo: boolean; onAnswered: (correct: boolean) => void }) {
  const exercise = block.exercise!
  const [answer, setAnswer] = useState<JsonValue>('')
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function checkAnswer() {
    setSubmitting(true)
    try {
      const result = demo && exercise.demoAnswer !== undefined
        ? { correct: evaluateAnswer(answer, exercise.demoAnswer), message: evaluateAnswer(answer, exercise.demoAnswer) ? exercise.feedbackCorrect : exercise.feedbackIncorrect }
        : await submitExerciseAttempt(exercise.id, answer)
      setFeedback({ correct: result.correct, message: result.message })
      onAnswered(result.correct)
    } catch (reason) {
      setFeedback({ correct: false, message: reason instanceof Error ? reason.message : 'Não foi possível verificar agora.' })
    } finally {
      setSubmitting(false)
    }
  }

  return <article className="lesson-block exercise-card"><span className="section-kicker">PRATIQUE</span><h2>{exercise.prompt}</h2>{exercise.instruction ? <p>{exercise.instruction}</p> : null}{exercise.type === 'listening' ? <LessonAudioPlayer blockId={block.id} status={audioStatus(block)} /> : null}{exercise.options.length > 0 ? <div className="option-list">{exercise.options.map((option) => <label key={option.id} className={answer === option.value ? 'option is-selected' : 'option'}><input type="radio" name={`exercise-${exercise.id}`} value={option.value} checked={answer === option.value} onChange={() => { setAnswer(option.value); setFeedback(null) }} /><span>{option.label}</span></label>)}</div> : <input className="answer-input" value={typeof answer === 'string' ? answer : ''} placeholder={readText(exercise.content, 'placeholder') || 'Digite sua resposta'} onChange={(event) => { setAnswer(event.target.value); setFeedback(null) }} />}{feedback ? <div className={feedback.correct ? 'feedback feedback--correct' : 'feedback feedback--incorrect'}>{feedback.correct ? <Check aria-hidden="true" /> : null}{feedback.message}</div> : null}<Button variant="signal" onClick={() => void checkAnswer()} disabled={submitting || answer === ''}>{submitting ? 'Verificando…' : 'Verificar resposta'}</Button></article>
}

export default function LessonPage() {
  const { lessonId = '' } = useParams()
  const navigate = useNavigate()
  const id = Number(lessonId)
  const { isDemo } = useAuth()
  const { data, error, loading } = useAsyncResource(async () => {
    const [lesson, journey] = await Promise.all([getLesson(id), getJourney()])
    return { lesson, journey }
  }, [id])
  const [answered, setAnswered] = useState<Record<number, boolean>>({})
  const [completion, setCompletion] = useState('')
  const [step, setStep] = useState(0)
  const lesson = data?.lesson
  const exercises = useMemo(() => lesson?.blocks.flatMap((block) => block.exercise ? [block.exercise] : []) ?? [], [lesson])
  const answeredCount = Object.keys(answered).length

  useEffect(() => {
    setStep(0)
    setAnswered({})
    setCompletion('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [id])

  if (loading) return <LoadingState label="Preparando a aula…" />
  if (error || !data || !lesson || !Number.isFinite(id)) return <StatePanel kind="locked" title="Aula indisponível">{error ?? 'Esta aula ainda não foi liberada.'}</StatePanel>
  const activeLesson = lesson

  const accessibleLessons = data.journey.filter((item) => item.state !== 'locked' && item.state !== 'checkpoint')
  const lessonIndex = accessibleLessons.findIndex((item) => item.id === id)
  const previousLesson = lessonIndex > 0 ? accessibleLessons[lessonIndex - 1] : null
  const nextLesson = lessonIndex >= 0 && lessonIndex < accessibleLessons.length - 1 ? accessibleLessons[lessonIndex + 1] : null
  const atFinish = lesson.blocks.length > 0 && step === lesson.blocks.length
  const currentBlock = !atFinish ? lesson.blocks[step] : null

  async function moveTo(nextStep: number) {
    const bounded = Math.max(0, Math.min(nextStep, activeLesson.blocks.length))
    setStep(bounded)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (bounded > 0) await saveLessonPosition(activeLesson.id, bounded)
  }

  async function finishLesson() {
    const result = await completeLesson(activeLesson.id)
    setCompletion(`Aula concluída: ${result.scorePercent}% e +${result.xpAwarded} XP.`)
  }

  return <div className="page lesson-page">
    <div className="lesson-topbar">
      <Link className="back-link" to="/journey"><ArrowLeft aria-hidden="true" />Voltar à jornada</Link>
      <nav className="lesson-switcher" aria-label="Navegar entre lições">
        <button type="button" disabled={!previousLesson} aria-label="Lição anterior" onClick={() => { if (previousLesson) void navigate(`/lesson/${previousLesson.id}`) }}><ChevronLeft aria-hidden="true" /></button>
        <span>Lição {lesson.lessonNumber}</span>
        <button type="button" disabled={!nextLesson} aria-label="Próxima lição" onClick={() => { if (nextLesson) void navigate(`/lesson/${nextLesson.id}`) }}><ChevronRight aria-hidden="true" /></button>
      </nav>
    </div>
    <header className="lesson-hero"><div><span className="field-label"><i />{lesson.levelCode} · LIÇÃO {String(lesson.lessonNumber).padStart(2, '0')}</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></div><span className="xp-badge"><Sparkles aria-hidden="true" />+{lesson.xpReward} XP</span></header>
    {lesson.blocks.length > 0 ? <ProgressBar value={Math.round((step / lesson.blocks.length) * 100)} label={`Etapa ${Math.min(step + 1, lesson.blocks.length)} de ${lesson.blocks.length}`} /> : null}
    {lesson.blocks.length === 0 ? <StatePanel title="Conteúdo em preparação">Esta lição está liberada, mas ainda não possui atividades publicadas. Use as setas acima para navegar para outra lição.</StatePanel> : null}
    {currentBlock ? <section className="lesson-stream lesson-stream--paged">{currentBlock.exercise ? <ExerciseBlock key={currentBlock.id} block={currentBlock} demo={isDemo} onAnswered={(correct) => setAnswered((current) => ({ ...current, [currentBlock.exercise!.id]: correct }))} /> : <ContentBlock key={currentBlock.id} block={currentBlock} />}</section> : null}
    {atFinish ? <section className="lesson-finish"><h2>Terminou por hoje?</h2><p>Conclua a aula para registrar seu progresso e XP.</p>{completion ? <div className="feedback feedback--correct"><Check aria-hidden="true" />{completion}</div> : <Button variant="signal" onClick={() => void finishLesson()} disabled={exercises.length > 0 && answeredCount < exercises.length}>Concluir aula</Button>}{exercises.length > 0 && answeredCount < exercises.length ? <small>Responda aos {exercises.length - answeredCount} exercícios antes de concluir.</small> : null}</section> : null}
    {lesson.blocks.length > 0 ? <nav className="lesson-stepper" aria-label="Navegar pelo conteúdo da lição">
      <button type="button" onClick={() => void moveTo(step - 1)} disabled={step === 0}><ChevronLeft aria-hidden="true" />Anterior</button>
      <span>{atFinish ? 'Final' : `${step + 1} / ${lesson.blocks.length}`}</span>
      <button type="button" onClick={() => void moveTo(step + 1)} disabled={atFinish}>Próximo<ChevronRight aria-hidden="true" /></button>
    </nav> : null}
  </div>
}
