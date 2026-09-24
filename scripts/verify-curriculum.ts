import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type JsonRecord = Record<string, unknown>

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function answerFor(entry: JsonRecord | undefined): unknown {
  if (!entry) return 'Test response'
  if (entry.answer !== undefined) return entry.answer
  if (Array.isArray(entry.accepted) && entry.accepted.length) return entry.accepted[0]
  if (typeof entry.model_answer === 'string') return entry.model_answer
  return 'Test response submitted for rubric review.'
}

async function catalog(client: SupabaseClient): Promise<JsonRecord[]> {
  const { data, error } = await client.rpc('get_lesson_catalog')
  if (error) throw error
  return data as JsonRecord[]
}

async function detail(client: SupabaseClient, lessonId: number): Promise<JsonRecord> {
  const { data, error } = await client.rpc('get_lesson_detail', { p_lesson_id: lessonId })
  if (error) throw error
  return data as JsonRecord
}

async function submitLesson(client: SupabaseClient, lesson: JsonRecord, keys: Record<string, JsonRecord>) {
  const blocks = lesson.blocks as JsonRecord[]
  for (const block of blocks) {
    const exercise = block.exercise as JsonRecord | null
    if (!exercise) continue
    const externalId = String(exercise.external_id)
    const { error } = await client.rpc('submit_exercise_attempt', {
      p_exercise_id: Number(exercise.id), p_answer: answerFor(keys[externalId]),
    })
    if (error) throw new Error(`Submission failed for ${externalId}: ${error.message}`)
  }
}

async function main() {
  const packageRoot = path.resolve(process.argv[2] ?? '')
  if (!process.argv[2]) throw new Error('Usage: npm run curriculum:verify -- <extracted-package-path>')
  const url = requiredEnv('SUPABASE_URL')
  const anon = requiredEnv('SUPABASE_ANON_KEY')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const answerKeys = JSON.parse(await readFile(path.join(packageRoot, 'private_answers', 'answer_key.json'), 'utf8')) as Record<string, JsonRecord>
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `curriculum-test-${suffix}@login.barretoenglish.app`
  const password = `T3st-${suffix}!`
  let userId = ''

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username: `test-${suffix}`.slice(0, 38), display_name: 'Curriculum Test' },
    })
    if (createError || !created.user) throw createError ?? new Error('Test user was not created.')
    userId = created.user.id
    const student = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signInError } = await student.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError

    let lessons = await catalog(student)
    assert(lessons.length === 360, `Expected 360 catalog lessons, received ${lessons.length}.`)
    assert(lessons[0]?.state === 'available', 'First lesson is not available to a new student.')
    assert(lessons[1]?.state === 'locked', 'Second lesson should be locked before completion.')
    const first = lessons[0]!
    const second = lessons[1]!
    await detail(student, Number(first.id))
    const { error: lockedDetailError } = await student.rpc('get_lesson_detail', { p_lesson_id: Number(second.id) })
    assert(Boolean(lockedDetailError), 'A locked lesson was readable through the detail RPC.')
    const { data: lockedRows, error: lockedRowsError } = await student.from('lesson_blocks').select('id').eq('lesson_id', Number(second.id))
    assert(!lockedRowsError && lockedRows?.length === 0, 'RLS exposed blocks from a locked lesson.')
    const { error: privateImportError } = await student.rpc('import_private_answer_keys', { p_entries: {} })
    assert(Boolean(privateImportError), 'Authenticated student could call the private answer import.')
    const { error: audioAdminError } = await student.functions.invoke('generate-lesson-audio', { body: { lessonId: Number(first.id) } })
    assert(Boolean(audioAdminError), 'Student could invoke admin audio generation.')

    const firstDetail = await detail(student, Number(first.id))
    const visualBlock = (firstDetail.blocks as JsonRecord[]).find((block) => block.block_type === 'visual')
    const visualExternalId = String((visualBlock?.content as JsonRecord | undefined)?.visual_external_id ?? '')
    assert(Boolean(visualExternalId), 'First lesson has no visual reference.')
    const { data: visualData, error: visualError } = await student.functions.invoke('get-lesson-visual-url', { body: { externalId: visualExternalId } })
    assert(!visualError && typeof (visualData as JsonRecord | null)?.url === 'string', 'Accessible lesson visual did not receive a signed URL.')
    const { error: lockedVisualError } = await student.functions.invoke('get-lesson-visual-url', { body: { externalId: 'A1-02' } })
    assert(Boolean(lockedVisualError), 'Locked lesson visual received a signed URL.')

    for (let index = 0; index < 48; index += 1) {
      lessons = await catalog(student)
      const lesson = lessons[index]!
      assert(lesson.state !== 'locked', `Lesson ${index + 1} was not unlocked in sequence.`)
      const lessonDetail = await detail(student, Number(lesson.id))
      await submitLesson(student, lessonDetail, answerKeys)
      const { data: completion, error: completionError } = await student.rpc('complete_lesson', { p_lesson_id: Number(lesson.id) })
      if (completionError) throw completionError
      if (index === 0) {
        const { data: secondCompletion, error: secondCompletionError } = await student.rpc('complete_lesson', { p_lesson_id: Number(lesson.id) })
        if (secondCompletionError) throw secondCompletionError
        assert(Number((secondCompletion as JsonRecord).xp_awarded) === 0, 'Repeated completion awarded XP twice.')
      }
      if ([5, 47].includes(index)) {
        const nextCatalog = await catalog(student)
        assert(nextCatalog[index + 1]?.state !== 'locked', `Boundary after lesson ${index + 1} did not unlock.`)
      }
      assert(Number((completion as JsonRecord).next_lesson_id) === Number(lessons[index + 1]?.id), `Lesson ${index + 1} unlocked the wrong successor.`)
    }
    lessons = await catalog(student)
    assert(lessons[48]?.level_code === 'A2' && lessons[48]?.state !== 'locked', 'A1 → A2 transition failed.')

    const last = lessons[359]!
    const { error: lastAccessError } = await admin.from('student_lesson_access').upsert({
      student_id: userId, lesson_id: Number(last.id), unlocked: true,
    }, { onConflict: 'student_id,lesson_id' })
    if (lastAccessError) throw lastAccessError
    const lastDetail = await detail(student, Number(last.id))
    await submitLesson(student, lastDetail, answerKeys)
    const { data: finalCompletion, error: finalError } = await student.rpc('complete_lesson', { p_lesson_id: Number(last.id) })
    if (finalError) throw finalError
    assert(Boolean((finalCompletion as JsonRecord).course_completed), 'Final C2 lesson did not mark the course complete.')
    const { data: profile, error: profileError } = await admin.from('profiles').select('course_completed_at').eq('id', userId).single()
    assert(!profileError && Boolean(profile.course_completed_at), 'Course completion timestamp was not stored.')
    const { data: reviews, error: reviewError } = await student.rpc('get_review_resources')
    if (reviewError) throw reviewError
    assert(((reviews as JsonRecord).clinics as unknown[]).length === 41, 'Review RPC did not return 41 grammar clinics.')
    assert(((reviews as JsonRecord).due_reviews as unknown[]).length === 196, 'Review schedule is not +1/+3/+7/+21 for each completed lesson.')

    const { error: promoteError } = await admin.from('profiles').update({ role: 'admin' }).eq('id', userId)
    if (promoteError) throw promoteError
    const adminCatalog = await catalog(student)
    assert(adminCatalog.every((lesson) => lesson.state !== 'locked'), 'Admin does not have access to all curriculum lessons.')
    await detail(student, Number(adminCatalog[359]!.id))

    console.log('Remote curriculum verification passed.', {
      catalogLessons: lessons.length,
      sequentialA1Completions: 48,
      moduleBoundary: 'passed',
      levelBoundary: 'A1→A2 passed',
      finalC2: 'passed',
      idempotentXP: 'passed',
      reviewSchedules: 196,
      grammarClinics: 41,
      lockedContentRLS: 'passed',
      lockedVisualRLS: 'passed',
      studentAudioDenial: 'passed',
      privateAnswerDenial: 'passed',
      adminAccess: 'passed',
    })
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) console.error('Temporary verification user cleanup failed:', error.message)
    }
  }
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
