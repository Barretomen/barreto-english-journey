import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Headphones, Mic2, Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { ProgressBar } from '../components/ProgressBar'
import { StatePanel } from '../components/StatePanel'
import { useAuth } from '../features/auth/AuthContext'
import { evaluateAnswer } from '../features/lessons/logic'
import { completeLesson, getLesson, submitExerciseAttempt } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import type { Exercise, JsonValue, LessonBlock } from '../types/domain'

function readText(content: Record<string, JsonValue>, key: string): string {
  const value = content[key]
  return typeof value === 'string' ? value : ''
}

function ContentBlock({ block }: { block: LessonBlock }) {
  const content = block.content
  if (block.type === 'vocabulary') {
    return <article className="lesson-block vocabulary-card"><span className="section-kicker">VOCABULÁRIO</span><h2>{readText(content, 'term')}</h2><strong>{readText(content, 'translation')}</strong><p>{readText(content, 'example')}</p>{readText(content, 'note') ? <small>{readText(content, 'note')}</small> : null}</article>
  }
  if (block.type === 'speaking') {
    return <article className="lesson-block speaking-card"><Mic2 aria-hidden="true" /><div><span className="section-kicker">SPEAKING</span><h2>{readText(content, 'phrase')}</h2><p>{readText(content, 'translation')}</p><small>{readText(content, 'disclaimer')}</small></div></article>
  }
  return <article className={`lesson-block lesson-block--${block.type}`}><span className="section-kicker">{block.type === 'checkpoint' ? 'CONCLUÍDO' : 'APRENDA'}</span>{block.title ? <h2>{block.title}</h2> : null}<p>{readText(content, 'body')}</p></article>
}

function ExerciseBlock({ exercise, demo, onAnswered }: { exercise: Exercise; demo: boolean; onAnswered: (correct: boolean) => void }) {
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

  function speak() {
    const speech = readText(exercise.content, 'speech')
    if (!speech || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(speech)
    utterance.lang = 'en-US'
    window.speechSynthesis.speak(utterance)
  }

  return <article className="lesson-block exercise-card"><span className="section-kicker">PRATIQUE</span><h2>{exercise.prompt}</h2>{exercise.instruction ? <p>{exercise.instruction}</p> : null}{exercise.type === 'listening' ? <Button variant="secondary" onClick={speak}><Headphones aria-hidden="true" />Ouvir frase</Button> : null}{exercise.options.length > 0 ? <div className="option-list">{exercise.options.map((option) => <label key={option.id} className={answer === option.value ? 'option is-selected' : 'option'}><input type="radio" name={`exercise-${exercise.id}`} value={option.value} checked={answer === option.value} onChange={() => { setAnswer(option.value); setFeedback(null) }} /><span>{option.label}</span></label>)}</div> : <input className="answer-input" value={typeof answer === 'string' ? answer : ''} placeholder={readText(exercise.content, 'placeholder') || 'Digite sua resposta'} onChange={(event) => { setAnswer(event.target.value); setFeedback(null) }} />}{feedback ? <div className={feedback.correct ? 'feedback feedback--correct' : 'feedback feedback--incorrect'}>{feedback.correct ? <Check aria-hidden="true" /> : null}{feedback.message}</div> : null}<Button variant="signal" onClick={() => void checkAnswer()} disabled={submitting || answer === ''}>{submitting ? 'Verificando…' : 'Verificar resposta'}</Button></article>
}

export default function LessonPage() {
  const { lessonId = '' } = useParams()
  const id = Number(lessonId)
  const { isDemo } = useAuth()
  const { data, error, loading } = useAsyncResource(() => getLesson(id), [id])
  const [answered, setAnswered] = useState<Record<number, boolean>>({})
  const [completion, setCompletion] = useState<string>('')
  const exercises = useMemo(() => data?.blocks.flatMap((block) => block.exercise ? [block.exercise] : []) ?? [], [data])
  const answeredCount = Object.keys(answered).length

  if (loading) return <LoadingState label="Preparando a aula…" />
  if (error || !data || !Number.isFinite(id)) return <StatePanel kind="locked" title="Aula indisponível">{error ?? 'Esta aula ainda não foi liberada.'}</StatePanel>
  const lesson = data

  async function finishLesson() {
    const result = await completeLesson(lesson.id)
    setCompletion(`Aula concluída: ${result.scorePercent}% e +${result.xpAwarded} XP.`)
  }

  return <div className="page lesson-page"><Link className="back-link" to="/journey"><ArrowLeft aria-hidden="true" />Voltar à jornada</Link><header className="lesson-hero"><div><span className="field-label"><i />{lesson.levelCode} · LIÇÃO {String(lesson.lessonNumber).padStart(2, '0')}</span><h1>{lesson.title}</h1><p>{lesson.summary}</p></div><span className="xp-badge"><Sparkles aria-hidden="true" />+{lesson.xpReward} XP</span></header><ProgressBar value={exercises.length === 0 ? 100 : Math.round((answeredCount / exercises.length) * 100)} label="Progresso nesta aula" /><section className="lesson-stream">{lesson.blocks.map((block) => block.exercise ? <ExerciseBlock key={block.id} exercise={block.exercise} demo={isDemo} onAnswered={(correct) => setAnswered((current) => ({ ...current, [block.exercise!.id]: correct }))} /> : <ContentBlock key={block.id} block={block} />)}</section><section className="lesson-finish"><h2>Terminou por hoje?</h2><p>Conclua a aula para registrar seu progresso e XP.</p>{completion ? <div className="feedback feedback--correct"><Check aria-hidden="true" />{completion}</div> : <Button variant="signal" onClick={() => void finishLesson()} disabled={exercises.length > 0 && answeredCount < exercises.length}>Concluir aula</Button>}</section></div>
}
