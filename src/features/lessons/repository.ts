import { createDemoDashboard, demoLesson, demoStudents, getDemoJourney } from '../../lib/demo'
import { supabase } from '../../lib/supabase/client'
import type {
  AdminStudent,
  AdminAudioLesson,
  AudioGenerationScope,
  AudioGenerationSummary,
  AudioStatus,
  AudioVariant,
  DashboardData,
  ExerciseFeedback,
  JsonValue,
  LessonCatalogItem,
  LessonCompletion,
  LessonDetail,
  Profile
  , ReviewResources
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
    externalId: String(row.external_id),
    levelCode: String(row.level_code) as LessonCatalogItem['levelCode'],
    levelPosition: Number(row.level_position),
    moduleId: Number(row.module_id),
    moduleExternalId: String(row.module_external_id),
    moduleTitle: String(row.module_title),
    modulePosition: Number(row.module_position),
    weekNumber: row.lesson_number === null ? null : Number(row.lesson_number),
    moduleLessonNumber: Number(row.module_lesson_number),
    globalOrder: Number(row.global_order),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    state: String(row.state) as LessonCatalogItem['state'],
    isCheckpoint: Boolean(row.is_checkpoint),
    savedPosition: Number(row.saved_position ?? 0),
    progressPercent: Number(row.progress_percent ?? 0)
  }))
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  if (!supabase) return createDemoDashboard()
  const client = requireClient()
  const [profile, catalogResult, metricsResult] = await Promise.all([
    getProfile(userId),
    client.rpc('get_lesson_catalog'),
    client.rpc('get_dashboard_metrics')
  ])
  if (catalogResult.error) throw catalogResult.error
  if (metricsResult.error) throw metricsResult.error
  const journey = (catalogResult.data as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id), externalId: String(row.external_id), levelCode: String(row.level_code) as LessonCatalogItem['levelCode'],
    levelPosition: Number(row.level_position), moduleId: Number(row.module_id), moduleExternalId: String(row.module_external_id),
    moduleTitle: String(row.module_title), modulePosition: Number(row.module_position),
    weekNumber: Number(row.lesson_number), moduleLessonNumber: Number(row.module_lesson_number), globalOrder: Number(row.global_order),
    title: String(row.title), summary: String(row.summary ?? ''), state: String(row.state) as LessonCatalogItem['state'],
    isCheckpoint: Boolean(row.is_checkpoint), progressPercent: Number(row.progress_percent ?? 0)
  }))
  const metrics = metricsResult.data as Record<string, unknown>
  const completedLessons = Number(metrics.completed_lessons ?? 0)
  const xp = Number(metrics.xp ?? 0)
  const currentLesson = journey.find((item) => item.state === 'current' || item.state === 'available') ?? null
  const totalPublishedLessons = journey.length
  return {
    profile,
    level: profile.currentLevel,
    progressPercent: totalPublishedLessons === 0 ? 0 : Math.round((completedLessons / totalPublishedLessons) * 100),
    xp,
    streak: Number(metrics.streak ?? 0),
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
  const { data, error } = await requireClient().rpc('get_lesson_detail', { p_lesson_id: lessonId })
  if (error) throw error
  const row = data as unknown as Record<string, unknown>
  const rawBlocks = row.blocks as Array<Record<string, unknown>>
  return {
    id: Number(row.id),
    levelCode: String(row.level_code),
    lessonNumber: Number(row.lesson_number),
    title: String(row.title),
    summary: String(row.summary),
    xpReward: Number(row.xp_reward),
    isCheckpoint: Boolean(row.is_checkpoint),
    canDo: (row.can_do as JsonValue[]) ?? [],
    metadata: (row.metadata as Record<string, JsonValue>) ?? {},
    blocks: rawBlocks.map((block) => {
      const relatedExercise = block.exercise
      const exercise = relatedExercise && typeof relatedExercise === 'object'
        ? relatedExercise as Record<string, unknown> : undefined
      return {
        id: Number(block.id),
        type: String(block.block_type) as LessonDetail['blocks'][number]['type'],
        position: Number(block.position),
        title: block.title ? String(block.title) : null,
        content: block.content as Record<string, JsonValue>,
        audio: {
          normalPath: block.audio_path ? String(block.audio_path) : null,
          slowPath: block.slow_audio_path ? String(block.slow_audio_path) : null,
          status: ['missing', 'generating', 'ready', 'failed'].includes(String(block.audio_status))
            ? String(block.audio_status) as AudioStatus
            : 'missing',
          required: Boolean(block.audio_required),
          role: block.audio_role ? String(block.audio_role) : null,
          transcript: block.transcript ? String(block.transcript) : null
        },
        exercise: exercise
          ? {
              id: Number(exercise.id),
              type: String(exercise.exercise_type) as LessonDetail['blocks'][number]['type'],
              prompt: String(exercise.prompt),
              instruction: exercise.instruction ? String(exercise.instruction) : null,
              content: exercise.content as Record<string, JsonValue>,
              options: [...((exercise.options as Array<Record<string, unknown>>) ?? [])]
                .sort((a, b) => Number(a.position) - Number(b.position))
                .map((option) => ({ id: Number(option.id), label: String(option.label), value: String(option.value) })),
              feedbackCorrect: String(exercise.feedback_correct),
              feedbackIncorrect: String(exercise.feedback_incorrect)
              , gradingMode: exercise.grading_mode === 'subjective' ? 'subjective' : 'automatic'
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
  return { correct: result.correct === null ? null : Boolean(result.correct), submitted: Boolean(result.submitted), message: String(result.message), explanation: String(result.explanation) }
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
    , nextLessonId: result.next_lesson_id === null ? null : Number(result.next_lesson_id)
    , courseCompleted: Boolean(result.course_completed)
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

export async function getLessonAudioUrl(blockId: number, variant: AudioVariant): Promise<string> {
  const { data, error } = await requireClient().functions.invoke('get-lesson-audio-url', {
    body: { blockId, variant }
  })
  if (error) throw new Error('Não foi possível carregar o áudio.')
  const url = (data as { url?: unknown } | null)?.url
  if (typeof url !== 'string') throw new Error('Áudio indisponível.')
  return url
}

export async function getAdminAudioOverview(): Promise<AdminAudioLesson[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_admin_audio_overview')
  if (error) throw error
  return (data as Array<Record<string, unknown>>).map((row) => ({
    lessonId: Number(row.lesson_id),
    levelCode: String(row.level_code),
    moduleId: Number(row.module_id),
    moduleTitle: String(row.module_title),
    lessonNumber: Number(row.lesson_number),
    title: String(row.title),
    readyCount: Number(row.ready_count),
    missingCount: Number(row.missing_count),
    generatingCount: Number(row.generating_count),
    failedCount: Number(row.failed_count),
    totalCount: Number(row.total_count)
  }))
}

export async function generateLessonAudio(scope: AudioGenerationScope): Promise<AudioGenerationSummary> {
  const { data, error } = await requireClient().functions.invoke('generate-lesson-audio', {
    body: scope
  })
  if (error) throw new Error('Não foi possível gerar o áudio. Verifique a configuração do Azure.')
  const result = data as { ready?: unknown; failed?: unknown; skipped?: unknown }
  return { ready: Number(result.ready ?? 0), failed: Number(result.failed ?? 0), skipped: Number(result.skipped ?? 0) }
}

export async function getLessonVisualUrl(externalId: string): Promise<{ url: string; alt: string }> {
  const { data, error } = await requireClient().functions.invoke('get-lesson-visual-url', { body: { externalId } })
  if (error) throw new Error('Não foi possível carregar o apoio visual.')
  const result = data as { url?: unknown; alt?: unknown }
  if (typeof result.url !== 'string') throw new Error('Apoio visual indisponível.')
  return { url: result.url, alt: typeof result.alt === 'string' ? result.alt : 'Apoio visual da lição' }
}

export async function getReviewResources(): Promise<ReviewResources> {
  if (!supabase) return { dueReviews: [], clinics: [] }
  const { data, error } = await supabase.rpc('get_review_resources')
  if (error) throw error
  const result = data as Record<string, unknown>
  return {
    dueReviews: ((result.due_reviews as Array<Record<string, unknown>>) ?? []).map((row) => ({
      id: Number(row.id), lessonId: Number(row.lesson_id), lessonTitle: String(row.lesson_title),
      levelCode: String(row.level_code), dueAt: String(row.due_at), offsetDays: Number(row.offset_days),
    })),
    clinics: ((result.clinics as Array<Record<string, unknown>>) ?? []).map((row) => ({
      id: Number(row.id), externalId: String(row.external_id), levelCode: String(row.level_code), title: String(row.title),
      focus: row.focus as JsonValue, why: String(row.why ?? ''), examples: row.examples as JsonValue,
      recycleIn: row.recycle_in as JsonValue, visualExternalId: row.visual_external_id ? String(row.visual_external_id) : null,
      exercises: ((row.exercises as Array<Record<string, unknown>>) ?? []).map((exercise) => ({
        id: Number(exercise.id), externalId: String(exercise.external_id), type: String(exercise.type),
        position: Number(exercise.position), prompt: String(exercise.prompt), instruction: exercise.instruction ? String(exercise.instruction) : null,
        content: (exercise.content as Record<string, JsonValue>) ?? {}, gradingMode: exercise.grading_mode === 'automatic' ? 'automatic' : 'subjective',
      })),
    })),
  }
}

export async function submitGrammarClinicExercise(exerciseId: number, answer: JsonValue): Promise<string> {
  const { data, error } = await requireClient().rpc('submit_grammar_clinic_exercise', { p_exercise_id: exerciseId, p_answer: answer })
  if (error) throw error
  return String((data as Record<string, unknown>).message)
}
