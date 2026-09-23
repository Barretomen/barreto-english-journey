import { useState } from 'react'
import { ArrowRight, BarChart3, Clock3, GraduationCap, Target } from 'lucide-react'
import { LoadingState } from '../components/LoadingState'
import { StatePanel } from '../components/StatePanel'
import { getAdminStudents } from '../features/lessons/repository'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { formatRelativeActivity } from '../lib/format'
import type { AdminStudent } from '../types/domain'

export default function AdminPage() {
  const { data, error, loading, reload } = useAsyncResource(getAdminStudents, [])
  const [selected, setSelected] = useState<AdminStudent | null>(null)
  if (loading) return <LoadingState label="Carregando alunos…" />
  if (error || !data) return <StatePanel title="O painel administrativo não carregou">{error ?? 'Tente novamente.'} <button className="text-button" onClick={() => void reload()}>Tentar novamente</button></StatePanel>
  return <div className="page admin-page"><header className="page-heading"><span className="field-label"><i />VISÃO DO PROFESSOR</span><h1>Alunos</h1><p>Acompanhe o essencial e libere o próximo passo com intenção.</p></header><div className="admin-layout"><section className="student-list" aria-label="Lista de alunos">{data.map((student) => <button key={student.id} type="button" className={selected?.id === student.id ? 'student-row is-selected' : 'student-row'} onClick={() => setSelected(student)}><span className="student-row__avatar">{student.displayName[0]}</span><span><strong>{student.displayName}</strong><small>{student.level} · {student.completedLessons} aulas concluídas</small></span><span className="student-row__progress">{student.progressPercent}%</span><ArrowRight aria-hidden="true" /></button>)}</section><aside className="student-detail">{selected ? <><div className="student-detail__head"><span className="student-row__avatar">{selected.displayName[0]}</span><div><h2>{selected.displayName}</h2><p>@{selected.username} · {selected.level}</p></div></div><div className="metric-grid"><span><BarChart3 aria-hidden="true" /><small>Progresso</small><strong>{selected.progressPercent}%</strong></span><span><Target aria-hidden="true" /><small>Precisão</small><strong>{selected.accuracyPercent}%</strong></span><span><GraduationCap aria-hidden="true" /><small>XP</small><strong>{selected.xp}</strong></span><span><Clock3 aria-hidden="true" /><small>Atividade</small><strong>{formatRelativeActivity(selected.lastActivity)}</strong></span></div><div className="admin-note"><strong>Controles de conteúdo</strong><p>Abra o perfil no Supabase ou conecte esta tela à função <code>admin_unlock_lesson</code>. A autoridade permanece no banco.</p></div></> : <div className="empty-selection"><GraduationCap aria-hidden="true" /><p>Selecione uma aluna para ver o acompanhamento.</p></div>}</aside></div></div>
}
