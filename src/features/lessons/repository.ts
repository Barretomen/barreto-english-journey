import { createDemoDashboard, demoLesson, demoStudents, getDemoJourney } from '../../lib/demo'
import { supabase } from '../../lib/supabase/client'
import type {
  AdminStudent,
  DashboardData,
  ExerciseFeedback,
  JsonValue,
  LessonCatalogItem,
  LessonCompletion,
  LessonDetail,
  Profile
} from '../../types/domain'

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role === 'admin' ? 'admin' : 'student',
    currentLevel: String(row.current_level_code ?? 'A1')
  }
}

export async function getProfile(userId: string): Promise<Profile> {
  if (!supabase) return createDemoDashboard().profile
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, role, current_level_code').eq('id', userId).single()
  if (error) throw error
  return mapProfile(data as Record<string, unknown>)
}

export async function getJourney(): Promise<LessonCatalogItem[]> {
  if (!supabase) return getDemoJourney()
  const { data, error } = await supabase.rpc('get_lesson_catalog')
  if (error) throw error
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    levelCode: row.level_code === 'A2' ? 'A2' : 'A1',
    moduleTitle: String(row.module_title),
    weekNumber: row.week_number === null ? null : Number(row.week_number),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    state: String(row.state) as LessonCatalogItem['state'],
    isCheckpoint: Boolean(row.is_checkpoint),
    progressPercent: Number(row.progress_percent ?? 0)
  }))
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  if (!supabase) return createDemoDashboard()
  const client = requireClient()
  const [profile, catalogResult, progressResult, xpResult] = await Promise.all([
    getProfile(userId),
    client.rpc('get_lesson_catalog'),
    client.from('lesson_progress').select('lesson_id, status, score_percent'),
    client.from('xp_events').select('points')
  ])
  if (catalogResult.error) throw catalogResult.error
  if (progressResult.error) throw progressResult.error
  if (xpResult.error) throw xpResult.error
  const journey = await getJourney()
  const completedLessons = progressResult.data.filter((item) => item.status === 'completed').length
  const xp = xpResult.data.reduce((sum, event) => sum + Number(event.points), 0)
  const currentLesson = journey.find((item) => item.state === 'current' || item.state === 'available') ?? null
  const totalPublishedLessons = journey.length
  return {
    profile,
    level: profile.currentLevel,
    progressPercent: totalPublishedLessons === 0 ? 0 : Math.round((completedLessons / totalPublishedLessons) * 100),
    xp,
    streak: Number((profile as Profile & { streak?: number }).streak ?? 0),
    completedLessons,
    totalPublishedLessons,
    currentLesson,
    journey
  }
}

export async function getLesson(lessonId: number): Promise<LessonDetail> {
  if (!supabase) {
    if (lessonId !== demoLesson.id) throw new Error('Esta aula está bloqueada.')
    return demoLesson
  }
  const { data, error } = await requireClient()
    .from('lessons')
    .select(`id, lesson_number, title, summary, xp_reward, is_checkpoint, modules!inner(levels!inner(code)), lesson_blocks(id, block_type, position, title, content, exercises(id, exercise_type, prompt, instruction, content, feedback_correct, feedback_incorrect, exercise_options(id, label, value, position)))`)
    .eq('id', lessonId)
    .order('position', { referencedTable: 'lesson_blocks', ascending: true })
    .single()
  if (error) throw error
  const row = data as unknown as Record<string, unknown>
  const modules = row.modules as { levels: { code: string } }
  const rawBlocks = row.lesson_blocks as Array<Record<string, unknown>>
  return {
    id: Number(row.id),
    levelCode: modules.levels.code,
    lessonNumber: Number(row.lesson_number),
    title: String(row.title),
    summary: String(row.summary),
    xpReward: Number(row.xp_reward),
    isCheckpoint: Boolean(row.is_checkpoint),
    blocks: rawBlocks.map((block) => {
      const relatedExercise = block.exercises
      const exercise = Array.isArray(relatedExercise)
        ? relatedExercise[0] as Record<string, unknown> | undefined
        : relatedExercise && typeof relatedExercise === 'object'
          ? relatedExercise as Record<string, unknown>
          : undefined
      return {
        id: Number(block.id),
        type: String(block.block_type) as LessonDetail['blocks'][number]['type'],
        position: Number(block.position),
        title: block.title ? String(block.title) : null,
        content: block.content as Record<string, JsonValue>,
        exercise: exercise
          ? {
              id: Number(exercise.id),
              type: String(exercise.exercise_type) as LessonDetail['blocks'][number]['type'],
              prompt: String(exercise.prompt),
              instruction: exercise.instruction ? String(exercise.instruction) : null,
              content: exercise.content as Record<string, JsonValue>,
              options: [...((exercise.exercise_options as Array<Record<string, unknown>>) ?? [])]
                .sort((a, b) => Number(a.position) - Number(b.position))
                .map((option) => ({ id: Number(option.id), label: String(option.label), value: String(option.value) })),
              feedbackCorrect: String(exercise.feedback_correct),
              feedbackIncorrect: String(exercise.feedback_incorrect)
            }
          : null
      }
    })
  }
}

export async function submitExerciseAttempt(exerciseId: number, answer: JsonValue): Promise<ExerciseFeedback> {
  const { data, error } = await requireClient().rpc('submit_exercise_attempt', { p_exercise_id: exerciseId, p_answer: answer })
  if (error) throw error
  const result = data as Record<string, unknown>
  return { correct: Boolean(result.correct), message: String(result.message), explanation: String(result.explanation) }
}

export async function saveLessonPosition(lessonId: number, position: number): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('save_lesson_position', { p_lesson_id: lessonId, p_position: position })
  if (error) throw error
}

export async function completeLesson(lessonId: number): Promise<LessonCompletion> {
  if (!supabase) return { correctAnswers: 2, totalExercises: 3, scorePercent: 67, xpAwarded: 50 }
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId })
  if (error) throw error
  const result = data as Record<string, unknown>
  return {
    correctAnswers: Number(result.correct_answers),
    totalExercises: Number(result.total_exercises),
    scorePercent: Number(result.score_percent),
    xpAwarded: Number(result.xp_awarded)
  }
}

export async function getAdminStudents(): Promise<AdminStudent[]> {
  if (!supabase) return demoStudents
  const { data, error } = await supabase.rpc('get_admin_student_overview')
  if (error) throw error
  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id), displayName: String(row.display_name), username: String(row.username), level: String(row.level_code),
    progressPercent: Number(row.progress_percent), accuracyPercent: Number(row.accuracy_percent), xp: Number(row.xp),
    lastActivity: row.last_activity ? String(row.last_activity) : null, completedLessons: Number(row.completed_lessons)
  }))
}

export async function setLessonUnlock(studentId: string, lessonId: number, unlocked: boolean): Promise<void> {
  const client = requireClient()
  const { error } = unlocked
    ? await client.rpc('admin_unlock_lesson', { p_student_id: studentId, p_lesson_id: lessonId })
    : await client.rpc('admin_lock_lesson', { p_student_id: studentId, p_lesson_id: lessonId })
  if (error) throw error
}
