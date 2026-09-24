import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { ProgressBar } from '../components/ProgressBar'
import { StatePanel } from '../components/StatePanel'
import { useAuth } from '../features/auth/AuthContext'
import { evaluateAnswer } from '../features/lessons/logic'
import { LessonContentBlock } from '../features/lessons/LessonSections'
import { completeLesson, getJourney, getLesson, markExerciseHintUsed, revealExerciseAnswer, saveLessonPosition, submitExerciseAttempt } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { JsonValue, LessonBlock } from '../types/domain'

function readText(content: Record<string, JsonValue>, key: string): string {
  const value = content[key]
  return typeof value === 'string' ? value : ''
}

function jsonList(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : []
}

function ExerciseBlock({ block, demo, onAnswered }: { block: LessonBlock; demo: boolean; onAnswered: (result: boolean | null) => void }) {
  const exercise = block.exercise!
  const [answer, setAnswer] = useState<JsonValue>('')
  const [feedback, setFeedback] = useState<{ correct: boolean | null; message: string; explanation?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const [revealedAnswer, setRevealedAnswer] = useState<{ answer: JsonValue; explanation: string } | null>(null)
  const subjective = exercise.gradingMode === 'subjective'
  const tokens = jsonList(exercise.content.tokens)
  const promptTranslation = readText(exercise.content, 'prompt_translation')
  const optionTranslations = exercise.content.option_translations && typeof exercise.content.option_translations === 'object' && !Array.isArray(exercise.content.option_translations)
    ? exercise.content.option_translations : {}

  async function checkAnswer() {
    setSubmitting(true)
    try {
      const result = demo && exercise.demoAnswer !== undefined
        ? { correct: evaluateAnswer(answer, exercise.demoAnswer), submitted: true, message: evaluateAnswer(answer, exercise.demoAnswer) ? exercise.feedbackCorrect : exercise.feedbackIncorrect, explanation: '' }
        : await submitExerciseAttempt(exercise.id, answer)
      setFeedback({ correct: result.correct, message: result.message, explanation: result.explanation })
      onAnswered(result.correct)
    } catch (reason) {
      setFeedback({ correct: false, message: reason instanceof Error ? reason.message : 'Não foi possível enviar agora.' })
    } finally {
      setSubmitting(false)
    }
  }

  const setValue = (value: JsonValue) => { setAnswer(value); setFeedback(null) }
  async function showExerciseHint() {
    try { await markExerciseHintUsed(exercise.id); setShowHint(true) }
    catch { setFeedback({ correct: false, message: 'Não foi possível abrir a dica agora.' }) }
  }
  async function revealAnswer() {
    try {
      const result = await revealExerciseAnswer(exercise.id)
      setRevealedAnswer({ answer: result.answer, explanation: result.explanation })
      onAnswered(false)
    } catch { setFeedback({ correct: false, message: 'Envie uma tentativa antes de revelar a resposta.' }) }
  }
  return <article className="lesson-block exercise-card">
    <span className="section-kicker">{subjective ? 'PRODUZA' : 'PRATIQUE'}</span>
    <h2>{exercise.prompt}</h2>
    {promptTranslation ? <><button className="text-toggle" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button>{showTranslation ? <p className="exercise-translation" lang="pt-BR">{promptTranslation}</p> : null}</> : null}
    {exercise.instruction ? <p>{exercise.instruction}</p> : null}
    {tokens.length ? <div className="token-bank" aria-label="Palavras disponíveis">{tokens.map((token, index) => <span key={index}>{typeof token === 'object' ? JSON.stringify(token) : String(token)}</span>)}</div> : null}
    {exercise.options.length > 0 ? <div className="option-list">{exercise.options.map((option) => {
      const translatedOption = optionTranslations[option.value]
      return <label key={option.id} className={answer === option.value ? 'option is-selected' : 'option'}><input type="radio" name={`exercise-${exercise.id}`} value={option.value} checked={answer === option.value} onChange={() => setValue(option.value)} /><span>{option.label}{showTranslation && typeof translatedOption === 'string' ? <small>{translatedOption}</small> : null}</span></label>
    })}</div>
      : exercise.type === 'true_false' ? <div className="option-list"><label className={answer === true ? 'option is-selected' : 'option'}><input type="radio" name={`exercise-${exercise.id}`} checked={answer === true} onChange={() => setValue(true)} /><span>Verdadeiro</span></label><label className={answer === false ? 'option is-selected' : 'option'}><input type="radio" name={`exercise-${exercise.id}`} checked={answer === false} onChange={() => setValue(false)} /><span>Falso</span></label></div>
      : subjective ? <textarea className="answer-input answer-textarea" name={`exercise-${exercise.id}`} aria-label="Sua resposta" value={typeof answer === 'string' ? answer : ''} placeholder="Escreva sua resposta" onChange={(event) => setValue(event.target.value)} />
      : <input className="answer-input" name={`exercise-${exercise.id}`} aria-label="Sua resposta" value={typeof answer === 'string' ? answer : ''} placeholder={readText(exercise.content, 'placeholder') || 'Digite sua resposta'} onChange={(event) => setValue(event.target.value)} />}
    {feedback ? <div className={feedback.correct === false ? 'feedback feedback--incorrect' : 'feedback feedback--correct'}>{feedback.correct === true ? <Check aria-hidden="true" /> : null}<span>{feedback.message}{feedback.explanation ? <small>{feedback.explanation}</small> : null}</span></div> : null}
    {showHint ? <div className="exercise-help"><strong>Dica:</strong> {readText(exercise.content, 'hint_translation') || readText(exercise.content, 'hint') || 'Volte ao exemplo anterior e observe a expressão usada.'}</div> : null}
    {revealedAnswer ? <div className="exercise-help exercise-help--answer"><strong>Resposta de referência:</strong> {typeof revealedAnswer.answer === 'string' || typeof revealedAnswer.answer === 'number' || typeof revealedAnswer.answer === 'boolean' ? String(revealedAnswer.answer) : JSON.stringify(revealedAnswer.answer)}<small>{revealedAnswer.explanation}</small></div> : null}
    <Button variant="signal" onClick={() => void checkAnswer()} disabled={submitting || answer === ''}>{submitting ? 'Enviando…' : subjective ? 'Enviar resposta' : 'Verificar resposta'}</Button>
    {feedback ? <div className="exercise-actions"><button type="button" onClick={() => void showExerciseHint()} disabled={showHint}>Ver dica</button><button type="button" onClick={() => void revealAnswer()} disabled={Boolean(revealedAnswer)}>Revelar resposta</button></div> : null}
  </article>
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
  const [answered, setAnswered] = useState<Record<number, boolean | null>>({})
  const [completion, setCompletion] = useState<{ message: string; nextLessonId?: number | null } | null>(null)
  const [completionError, setCompletionError] = useState('')
  const [step, setStep] = useState(0)
  const lesson = data?.lesson
  const exercises = useMemo(() => lesson?.blocks.flatMap((block) => block.exercise ? [block.exercise] : []) ?? [], [lesson])

  useEffect(() => {
    setStep(Math.max(0, Math.min(lesson?.savedPosition ?? 0, lesson?.blocks.length ?? 0)))
    setAnswered({})
    setCompletion(null)
    setCompletionError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [id, lesson?.savedPosition, lesson?.blocks.length])

  if (loading) return <LoadingState label="Preparando a aula…" />
  if (error || !data || !lesson || !Number.isFinite(id)) return <StatePanel kind="locked" title="Aula indisponível">{error ?? 'Esta aula ainda não foi liberada.'}</StatePanel>
  const activeLesson = lesson
  const accessibleLessons = data.journey.filter((item) => item.state !== 'locked')
  const lessonIndex = accessibleLessons.findIndex((item) => item.id === id)
  const previousLesson = lessonIndex > 0 ? accessibleLessons[lessonIndex - 1] : null
  const nextLesson = lessonIndex >= 0 && lessonIndex < accessibleLessons.length - 1 ? accessibleLessons[lessonIndex + 1] : null
  const atFinish = activeLesson.blocks.length > 0 && step === activeLesson.blocks.length
  const currentBlock = !atFinish ? activeLesson.blocks[step] : null

  async function moveTo(nextStep: number) {
    const bounded = Math.max(0, Math.min(nextStep, activeLesson.blocks.length))
    setStep(bounded)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (bounded > 0) await saveLessonPosition(activeLesson.id, bounded)
  }

  async function finishLesson() {
    setCompletionError('')
    try {
      const result = await completeLesson(activeLesson.id)
      setCompletion({
        message: result.courseCompleted ? `Curso concluído com ${result.scorePercent}% nesta lição. Parabéns por completar a jornada.` : `Aula concluída: ${result.scorePercent}% e +${result.xpAwarded} XP.`,
        ...(result.nextLessonId !== undefined ? { nextLessonId: result.nextLessonId } : {}),
      })
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : ''
      setCompletionError(raw.includes('lesson_exercises_incomplete') ? 'Envie todas as atividades desta lição antes de concluir.' : 'Não foi possível concluir a lição agora.')
    }
  }

  return <div className="page lesson-page">
    <div className="lesson-topbar">
      <Link className="back-link" to="/journey"><ArrowLeft aria-hidden="true" />Voltar à jornada</Link>
      <nav className="lesson-switcher" aria-label="Navegar entre lições">
        <button type="button" disabled={!previousLesson} aria-label="Lição anterior" onClick={() => { if (previousLesson) void navigate(`/lesson/${previousLesson.id}`) }}><ChevronLeft aria-hidden="true" /></button>
        <span>{lesson.levelCode} · M{lesson.moduleNumber} · Aula {lesson.moduleLessonNumber}</span>
        <button type="button" disabled={!nextLesson} aria-label="Próxima lição" onClick={() => { if (nextLesson) void navigate(`/lesson/${nextLesson.id}`) }}><ChevronRight aria-hidden="true" /></button>
      </nav>
    </div>
    <header className="lesson-hero"><div><span className="field-label"><i />{lesson.levelCode} · MÓDULO {lesson.moduleNumber} · AULA {lesson.moduleLessonNumber}</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></div><span className="xp-badge"><Sparkles aria-hidden="true" />+{lesson.xpReward} XP</span></header>
    {lesson.blocks.length > 0 ? <ProgressBar value={Math.round((step / lesson.blocks.length) * 100)} label={atFinish ? 'Pronta para concluir' : `Etapa ${step + 1} de ${lesson.blocks.length}`} /> : null}
    {lesson.blocks.length === 0 ? <StatePanel title="Conteúdo indisponível">Esta lição ainda não possui etapas publicadas.</StatePanel> : null}
    {currentBlock ? <section className="lesson-stream lesson-stream--paged" aria-live="polite">{currentBlock.exercise ? <ExerciseBlock key={currentBlock.id} block={currentBlock} demo={isDemo} onAnswered={(result) => setAnswered((current) => ({ ...current, [currentBlock.exercise!.id]: result }))} /> : <LessonContentBlock key={currentBlock.id} block={currentBlock} lessonId={lesson.id} canDoChecks={lesson.canDoChecks} />}</section> : null}
    {atFinish ? <section className="lesson-finish"><h2>Pronta para concluir?</h2><p>Seu progresso, XP e próximas revisões serão registrados.</p>{completion ? <><div className="feedback feedback--correct"><Check aria-hidden="true" />{completion.message}</div>{completion.nextLessonId ? <Link className="button button--signal" to={`/lesson/${completion.nextLessonId}`}>Ir para a próxima lição <ChevronRight aria-hidden="true" /></Link> : <Link className="button button--secondary" to="/journey">Ver jornada</Link>}</> : <Button variant="signal" onClick={() => void finishLesson()}>Concluir aula</Button>}{completionError ? <div className="feedback feedback--incorrect">{completionError}</div> : null}<small>{Object.keys(answered).length} de {exercises.length} atividades enviadas nesta sessão.</small></section> : null}
    {lesson.blocks.length > 0 ? <nav className="lesson-stepper" aria-label="Navegar pelo conteúdo da lição">
      <button type="button" onClick={() => void moveTo(step - 1)} disabled={step === 0}><ChevronLeft aria-hidden="true" />Anterior</button>
      <span>{atFinish ? 'Final' : `${step + 1} / ${lesson.blocks.length}`}</span>
      <button type="button" onClick={() => void moveTo(step + 1)} disabled={atFinish}>Próximo<ChevronRight aria-hidden="true" /></button>
    </nav> : null}
  </div>
}
