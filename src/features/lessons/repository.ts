import { createDemoDashboard, demoLesson, demoStudents, getDemoJourney } from '../../lib/demo'
import { supabase } from '../../lib/supabase/client'
import type {
  AdminCurriculumDiagnostics,
  AdminStudent,
  AdminAudioLesson,
  AudioGenerationScope,
  AudioGenerationSummary,
  AudioStatus,
  AudioVariant,
  DashboardData,
  ExerciseFeedback,
  ExerciseAnswerReveal,
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

function finiteInteger(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Dados do curso incompatíveis: ${field}.`)
  }
  return parsed
}

function mapCatalogRow(row: Record<string, unknown>): LessonCatalogItem {
  return {
    id: finiteInteger(row.id, 'id'),
    externalId: String(row.external_id),
    levelCode: String(row.level_code) as LessonCatalogItem['levelCode'],
    levelPosition: finiteInteger(row.level_position, 'level_position'),
    moduleId: finiteInteger(row.module_id, 'module_id'),
    moduleExternalId: String(row.module_external_id),
    moduleTitle: String(row.module_title),
    moduleNumber: finiteInteger(row.module_number, 'module_number'),
    levelLessonNumber: finiteInteger(row.level_lesson_number, 'level_lesson_number'),
    moduleLessonNumber: finiteInteger(row.module_lesson_number, 'module_lesson_number'),
    globalOrder: finiteInteger(row.global_order, 'global_order'),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    state: String(row.state) as LessonCatalogItem['state'],
    isCheckpoint: Boolean(row.is_checkpoint),
    progressPercent: finiteInteger(row.progress_percent ?? 0, 'progress_percent'),
  }
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
  return (data as Array<Record<string, unknown>>).map(mapCatalogRow)
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
  const journey = (catalogResult.data as Array<Record<string, unknown>>).map(mapCatalogRow)
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
    id: finiteInteger(row.id, 'lesson.id'),
    externalId: String(row.external_id),
    levelCode: String(row.level_code) as LessonDetail['levelCode'],
    levelLessonNumber: finiteInteger(row.level_lesson_number, 'lesson.level_lesson_number'),
    moduleId: finiteInteger(row.module_id, 'lesson.module_id'),
    moduleExternalId: String(row.module_external_id),
    moduleTitle: String(row.module_title),
    moduleNumber: finiteInteger(row.module_number, 'lesson.module_number'),
    moduleLessonNumber: finiteInteger(row.module_lesson_number, 'lesson.module_lesson_number'),
    globalOrder: finiteInteger(row.global_order, 'lesson.global_order'),
    title: String(row.title),
    summary: String(row.summary),
    xpReward: Number(row.xp_reward),
    isCheckpoint: Boolean(row.is_checkpoint),
    canDo: (row.can_do as JsonValue[]) ?? [],
    metadata: (row.metadata as Record<string, JsonValue>) ?? {},
    contentVersion: row.content_version ? String(row.content_version) : null,
    canDoChecks: (row.can_do_checks as Record<string, boolean>) ?? {},
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
        audioSegments: ((block.audio_segments as Array<Record<string, unknown>>) ?? []).map((segment) => ({
          id: Number(segment.id), externalId: String(segment.external_id), itemKey: String(segment.item_key),
          kind: String(segment.segment_kind) as 'term' | 'example' | 'pronunciation' | 'listening' | 'speaking',
          position: Number(segment.position), speechText: String(segment.speech_text),
          status: ['missing', 'generating', 'ready', 'failed'].includes(String(segment.status))
            ? String(segment.status) as AudioStatus : 'missing',
        })),
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

export async function markExerciseHintUsed(exerciseId: number): Promise<void> {
  const { error } = await requireClient().rpc('mark_exercise_hint_used', { p_exercise_id: exerciseId })
  if (error) throw error
}

export async function revealExerciseAnswer(exerciseId: number): Promise<ExerciseAnswerReveal> {
  const { data, error } = await requireClient().rpc('reveal_exercise_answer', { p_exercise_id: exerciseId })
  if (error) throw error
  const result = data as Record<string, unknown>
  return {
    answer: result.answer as JsonValue,
    explanation: String(result.explanation ?? ''),
    assisted: Boolean(result.assisted),
  }
}

export async function setLessonCanDoCheck(lessonId: number, itemKey: string, checked: boolean): Promise<void> {
  const { error } = await requireClient().rpc('set_lesson_can_do_check', {
    p_lesson_id: lessonId, p_item_key: itemKey, p_checked: checked,
  })
  if (error) throw error
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

export async function getLessonAudioUrl(targetId: number, variant: AudioVariant, target: 'block' | 'segment' = 'block'): Promise<string> {
  const { data, error } = await requireClient().functions.invoke('get-lesson-audio-url', {
    body: target === 'segment' ? { segmentId: targetId, variant } : { blockId: targetId, variant }
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
    levelLessonNumber: finiteInteger(row.level_lesson_number, 'audio.level_lesson_number'),
    moduleLessonNumber: finiteInteger(row.module_lesson_number, 'audio.module_lesson_number'),
    title: String(row.title),
    readyCount: Number(row.ready_count),
    missingCount: Number(row.missing_count),
    generatingCount: Number(row.generating_count),
    failedCount: Number(row.failed_count),
    totalCount: Number(row.total_count)
  }))
}

const EXPECTED_CONTENT_SCHEMA_VERSION = '2.0-specialized-sections'

export async function getAdminCurriculumDiagnostics(): Promise<AdminCurriculumDiagnostics> {
  if (!supabase) return {
    curriculumVersion: 'demo', contentSchemaVersion: EXPECTED_CONTENT_SCHEMA_VERSION,
    lessonsExpected: 360, lessonsActual: 360, goldenBlocks: 12,
    visualAssetsExpected: 401, visualAssetsActual: 401,
    requiredAudio: { ready: 0, missing: 0, generating: 0, failed: 0 },
    vocabularySegments: { ready: 0, missing: 0, generating: 0, failed: 0 },
    problems: { emptyLessonBlocks: 0, missingTranslations: 0, missingVisuals: 0, dirtyTtsText: 0, missingRequiredAudio: 0, schemaMismatch: 0 },
  }
  const { data, error } = await supabase.rpc('get_admin_curriculum_diagnostics')
  if (error) throw error
  const row = data as Record<string, unknown>
  const requiredAudio = (row.required_audio ?? {}) as Record<string, unknown>
  const vocabularySegments = (row.vocabulary_segments ?? {}) as Record<string, unknown>
  const problems = (row.problems ?? {}) as Record<string, unknown>
  const contentSchemaVersion = String(row.content_schema_version ?? 'unknown')
  const audioCounts = (counts: Record<string, unknown>) => ({
    ready: Number(counts.ready ?? 0), missing: Number(counts.missing ?? 0),
    generating: Number(counts.generating ?? 0), failed: Number(counts.failed ?? 0),
  })
  return {
    curriculumVersion: String(row.curriculum_version ?? 'unknown'), contentSchemaVersion,
    lessonsExpected: Number(row.lessons_expected ?? 360), lessonsActual: Number(row.lessons_actual ?? 0),
    goldenBlocks: Number(row.golden_blocks ?? 0),
    visualAssetsExpected: Number(row.visual_assets_expected ?? 401), visualAssetsActual: Number(row.visual_assets_actual ?? 0),
    requiredAudio: audioCounts(requiredAudio), vocabularySegments: audioCounts(vocabularySegments),
    problems: {
      emptyLessonBlocks: Number(problems.empty_lesson_blocks ?? 0),
      missingTranslations: Number(problems.missing_translations ?? 0),
      missingVisuals: Number(problems.missing_visuals ?? 0), dirtyTtsText: Number(problems.dirty_tts_text ?? 0),
      missingRequiredAudio: Number(problems.missing_required_audio ?? 0),
      schemaMismatch: contentSchemaVersion === EXPECTED_CONTENT_SCHEMA_VERSION ? 0 : 1,
    },
  }
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
