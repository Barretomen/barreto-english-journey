import { createClient } from '@supabase/supabase-js'

type JsonRecord = Record<string, unknown>

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function present(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function firstRelation(value: unknown): JsonRecord {
  return record(Array.isArray(value) ? value[0] : value)
}

function blockKey(block: JsonRecord): string {
  const externalId = String(block.external_id)
  const exerciseMatch = externalId.match(/-B-exercise-.*-(e0[1-4])$/)
  if (exerciseMatch) return exerciseMatch[1]
  return String(block.block_type)
}

async function main() {
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: modules, error: moduleError } = await client.from('modules').select('id').eq('level_code', 'A1')
  if (moduleError) throw moduleError
  const moduleIds = (modules ?? []).map((module) => Number(module.id))
  const { data: lessons, error: lessonError } = await client.from('lessons')
    .select('id,external_id,metadata').in('module_id', moduleIds).eq('is_legacy', false).order('global_order')
  if (lessonError) throw lessonError
  assert(lessons?.length === 48, `Expected 48 A1 lessons, received ${lessons?.length ?? 0}.`)
  const lessonIds = lessons.map((lesson) => Number(lesson.id))
  const { data: blocks, error: blockError } = await client.from('lesson_blocks')
    .select('lesson_id,external_id,block_type,position,content,exercises(external_id,prompt,content)')
    .in('lesson_id', lessonIds).order('position')
  if (blockError) throw blockError

  let translatedLessons = 0
  let checkpointLessons = 0
  for (const lesson of lessons) {
    const externalId = String(lesson.external_id)
    assert(record(lesson.metadata).translation_version === '1.0-curriculum-master.pt-A1-v1', `${externalId}: wrong translation version.`)
    const lessonBlocks = (blocks ?? []).filter((block) => Number(block.lesson_id) === Number(lesson.id)) as JsonRecord[]
    const hasVocabulary = lessonBlocks.some((block) => block.block_type === 'vocabulary')
    const expected = hasVocabulary
      ? ['overview', 'visual', 'vocabulary', 'e01', 'grammar', 'e02', 'pronunciation', 'e03', 'listening', 'e04', 'speaking', 'assessment']
      : ['overview', 'visual', 'grammar', 'e01', 'pronunciation', 'e02', 'listening', 'e03', 'e04', 'speaking', 'assessment']
    assert(JSON.stringify(lessonBlocks.map(blockKey)) === JSON.stringify(expected), `${externalId}: invalid interleaved order.`)
    assert(lessonBlocks.every((block, index) => Number(block.position) === index + 1), `${externalId}: positions are not contiguous.`)
    if (!hasVocabulary) checkpointLessons += 1

    const byType = new Map(lessonBlocks.map((block) => [String(block.block_type), record(block.content)]))
    const overview = byType.get('overview') ?? {}
    assert(array(overview.can_do_pt).length === array(overview.can_do).length && array(overview.can_do_pt).every(present), `${externalId}: incomplete can-do translations.`)
    const grammar = byType.get('grammar') ?? {}
    assert(array(grammar.items_pt).length === array(grammar.items).length && array(grammar.items_pt).every(present), `${externalId}: incomplete grammar translations.`)
    if (hasVocabulary) {
      assert(array((byType.get('vocabulary') ?? {}).items).every((item) => present(record(item).example_translation)), `${externalId}: missing vocabulary example translation.`)
    }
    const pronunciation = byType.get('pronunciation') ?? {}
    assert(array(pronunciation.items_pt).length === array(pronunciation.items).length && array(pronunciation.items_pt).every(present), `${externalId}: incomplete pronunciation translations.`)
    const listening = byType.get('listening') ?? {}
    assert(present(listening.task_translation) && present(listening.script_translation), `${externalId}: incomplete listening translations.`)
    assert(present((byType.get('speaking') ?? {}).prompt_translation), `${externalId}: missing speaking translation.`)
    for (const block of lessonBlocks.filter((item) => String(item.external_id).includes('-B-exercise-'))) {
      const exercise = firstRelation(block.exercises)
      assert(present(record(exercise.content).prompt_translation), `${externalId}: missing exercise prompt translation.`)
    }
    translatedLessons += 1
  }

  const { data: segments, error: segmentError } = await client.from('lesson_audio_segments')
    .select('normalized_text,audio_status,lesson_blocks!inner(lesson_id)').in('lesson_blocks.lesson_id', lessonIds)
  if (segmentError) throw segmentError
  assert(segments?.length === 716, `Expected 716 A1 audio segments, received ${segments?.length ?? 0}.`)
  assert(segments.every((segment) => present(segment.normalized_text) && !String(segment.normalized_text).includes('_')), 'Dirty A1 TTS segment found remotely.')

  const counts: Record<string, number> = {}
  for (const table of ['lesson_progress', 'exercise_attempts', 'xp_events'] as const) {
    const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
    if (error) throw error
    counts[table] = count ?? 0
  }
  console.log('Remote A1 Wave 1 verification passed.', {
    translatedLessons,
    interleavedLessons: translatedLessons,
    checkpointLessons,
    audioSegments: segments.length,
    history: counts,
  })
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
