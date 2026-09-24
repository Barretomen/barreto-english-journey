import { useState } from 'react'
import { ArrowRight, BarChart3, Clock3, GraduationCap, LoaderCircle, Target, Volume2 } from 'lucide-react'
import { Button } from '../components/Button'
import { LoadingState } from '../components/LoadingState'
import { StatePanel } from '../components/StatePanel'
import { generateLessonAudio, getAdminAudioOverview, getAdminStudents } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { formatRelativeActivity } from '../lib/format'
import type { AdminStudent, AudioGenerationScope } from '../types/domain'

export default function AdminPage() {
  const students = useAsyncResource(getAdminStudents, [])
  const audio = useAsyncResource(getAdminAudioOverview, [])
  const [selected, setSelected] = useState<AdminStudent | null>(null)
  const [generatingScope, setGeneratingScope] = useState('')
  const [audioMessage, setAudioMessage] = useState('')
  const [audioLevel, setAudioLevel] = useState('A1')
  const [audioModule, setAudioModule] = useState('')

  async function generate(scope: AudioGenerationScope, key: string) {
    setGeneratingScope(key)
    setAudioMessage('')
    try {
      const result = await generateLessonAudio(scope)
      setAudioMessage(result.failed > 0
        ? `${result.ready} áudios prontos; ${result.failed} falharam. Tente novamente após verificar o Azure.`
        : `${result.ready} áudios estão prontos.`)
      await audio.reload()
    } catch (reason) {
      setAudioMessage(reason instanceof Error ? reason.message : 'Não foi possível gerar o áudio.')
      await audio.reload()
    } finally {
      setGeneratingScope('')
    }
  }

  if (students.loading || audio.loading) return <LoadingState label="Preparando o painel…" />
  if (students.error || !students.data) return <StatePanel title="O painel administrativo não carregou">{students.error ?? 'Tente novamente.'} <button className="text-button" onClick={() => void students.reload()}>Tentar novamente</button></StatePanel>

  return <div className="page admin-page">
    <header className="page-heading"><span className="field-label"><i />VISÃO DO PROFESSOR</span><h1>Alunos</h1><p>Acompanhe o progresso. A sequência normal de lições é liberada automaticamente após cada conclusão.</p></header>
    <div className="admin-layout">
      <section className="student-list" aria-label="Lista de alunos">{students.data.map((student) => <button key={student.id} type="button" className={selected?.id === student.id ? 'student-row is-selected' : 'student-row'} onClick={() => setSelected(student)}><span className="student-row__avatar">{student.displayName[0]}</span><span><strong>{student.displayName}</strong><small>{student.level} · {student.completedLessons} aulas concluídas</small></span><span className="student-row__progress">{student.progressPercent}%</span><ArrowRight aria-hidden="true" /></button>)}</section>
      <aside className="student-detail">{selected ? <><div className="student-detail__head"><span className="student-row__avatar">{selected.displayName[0]}</span><div><h2>{selected.displayName}</h2><p>@{selected.username} · {selected.level}</p></div></div><div className="metric-grid"><span><BarChart3 aria-hidden="true" /><small>Progresso</small><strong>{selected.progressPercent}%</strong></span><span><Target aria-hidden="true" /><small>Precisão</small><strong>{selected.accuracyPercent}%</strong></span><span><GraduationCap aria-hidden="true" /><small>XP</small><strong>{selected.xp}</strong></span><span><Clock3 aria-hidden="true" /><small>Atividade</small><strong>{formatRelativeActivity(selected.lastActivity)}</strong></span></div></> : <div className="empty-selection"><GraduationCap aria-hidden="true" /><p>Selecione uma aluna para ver o acompanhamento.</p></div>}</aside>
    </div>

    <section className="admin-audio" aria-labelledby="admin-audio-title">
      <div className="admin-audio__heading"><div><span className="field-label"><i />PRONÚNCIA</span><h2 id="admin-audio-title">Áudio das lições</h2><p>Gere somente os arquivos ausentes. Os áudios prontos são reutilizados.</p></div><Volume2 aria-hidden="true" /></div>
      {audio.error ? <div className="feedback feedback--incorrect">{audio.error}</div> : null}
      <div className="audio-batch-controls">
        <label>Nível<select name="audio-level" value={audioLevel} onChange={(event) => { setAudioLevel(event.target.value); setAudioModule('') }}>{['A1','A2','B1','B2','C1','C2'].map((level) => <option key={level}>{level}</option>)}</select></label>
        <Button variant="secondary" disabled={Boolean(generatingScope)} onClick={() => void generate({ levelCode: audioLevel }, `level-${audioLevel}`)}>{generatingScope === `level-${audioLevel}` ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Volume2 aria-hidden="true" />}Gerar nível</Button>
        <label>Módulo<select name="audio-module" value={audioModule} onChange={(event) => setAudioModule(event.target.value)}><option value="">Selecione</option>{[...new Map(audio.data?.filter((lesson) => lesson.levelCode === audioLevel).map((lesson) => [lesson.moduleId, lesson.moduleTitle]) ?? [])].map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        <Button variant="secondary" disabled={!audioModule || Boolean(generatingScope)} onClick={() => void generate({ moduleId: Number(audioModule) }, `module-${audioModule}`)}>{generatingScope === `module-${audioModule}` ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Volume2 aria-hidden="true" />}Gerar módulo</Button>
      </div>
      <div className="audio-lesson-list">{audio.data?.filter((lesson) => lesson.totalCount > 0).map((lesson) => {
        const busy = generatingScope === `lesson-${lesson.lessonId}`
        return <article className="audio-lesson-row" key={lesson.lessonId}>
          <div><strong>Lição {lesson.lessonNumber} — {lesson.title}</strong><small><span>✓ {lesson.readyCount} prontos</span><span>○ {lesson.missingCount} ausentes</span>{lesson.failedCount > 0 ? <span>✕ {lesson.failedCount} falharam</span> : null}{lesson.generatingCount > 0 ? <span>… {lesson.generatingCount} gerando</span> : null}</small></div>
          <Button variant="secondary" disabled={Boolean(generatingScope) || (lesson.readyCount === lesson.totalCount && lesson.failedCount === 0)} onClick={() => void generate({ lessonId: lesson.lessonId }, `lesson-${lesson.lessonId}`)}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Volume2 aria-hidden="true" />}{busy ? 'Gerando…' : lesson.failedCount > 0 ? 'Tentar novamente' : 'Gerar ausentes'}</Button>
        </article>
      })}</div>
      {audioMessage ? <p className="admin-audio__message" role="status">{audioMessage}</p> : null}
    </section>
  </div>
}
