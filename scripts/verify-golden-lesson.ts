import { createClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  const url = requiredEnv('SUPABASE_URL')
  const publishableKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const suffix = crypto.randomUUID()
  const email = `golden-${suffix}@example.invalid`
  const password = `G-${crypto.randomUUID()}-aA1!`
  let userId: string | null = null

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username: `golden-${suffix.slice(0, 12)}`, display_name: 'Golden lesson test' },
    })
    if (createError || !created.user) throw createError ?? new Error('Test user was not created.')
    userId = created.user.id
    const student = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signInError } = await student.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError

    const { data: catalog, error: catalogError } = await student.rpc('get_lesson_catalog')
    if (catalogError) throw catalogError
    const lessons = catalog as Row[]
    const first = lessons.find((lesson) => lesson.external_id === 'A1-01')
    const second = lessons.find((lesson) => lesson.external_id === 'A1-02')
    assert(first && second, 'A1-01/A1-02 missing from catalog.')
    assert(first.state === 'available', 'Fresh student cannot access A1-01.')
    assert(second.state === 'locked', 'A1-02 should begin locked.')

    const { data: rawDetail, error: detailError } = await student.rpc('get_lesson_detail', { p_lesson_id: first.id })
    if (detailError) throw detailError
    const detail = rawDetail as Row
    assert(detail.level_code === 'A1' && detail.module_number === 1 && detail.module_lesson_number === 1, 'Learner-facing A1-01 numbering is invalid.')
    assert(detail.title === 'Hello and Goodbye', 'Golden title mismatch.')
    assert(detail.content_version === '1.0-curriculum-master', 'Content version mismatch.')
    const blocks = detail.blocks as Row[]
    const expectedOrder = ['overview', 'visual', 'vocabulary', 'multiple_choice', 'grammar', 'multiple_choice', 'pronunciation', 'fill_blank', 'listening', 'true_false', 'speaking', 'assessment']
    assert(JSON.stringify(blocks.map((block) => block.block_type)) === JSON.stringify(expectedOrder), 'A1-01 practice is not interleaved correctly.')
    const byType = (type: string) => blocks.find((block) => block.block_type === type)
    const overview = byType('overview')!
    const vocabulary = byType('vocabulary')!
    const grammar = byType('grammar')!
    const pronunciation = byType('pronunciation')!
    const listening = byType('listening')!
    const speaking = byType('speaking')!
    const assessment = byType('assessment')!
    assert(((overview.content as Row).can_do_pt as unknown[]).length === 3, 'Can-do preview translations missing.')
    const vocabularyItems = (vocabulary.content as Row).items as Row[]
    assert(vocabularyItems.length === 8 && vocabularyItems.every((item) => typeof item.example_translation === 'string'), 'Vocabulary translations incomplete.')
    const vocabularySegments = vocabulary.audio_segments as Row[]
    assert(vocabularySegments.length === 16 && vocabularySegments.every((segment) => segment.status === 'ready'), 'Vocabulary segment audio is not fully ready.')
    assert(typeof (grammar.content as Row).explanation === 'string', 'Grammar explanation missing.')
    assert(((pronunciation.content as Row).items_pt as unknown[]).length === 2, 'Pronunciation support missing.')
    assert((pronunciation.audio_segments as Row[]).every((segment) => segment.status === 'ready'), 'Pronunciation segment audio is not ready.')
    assert(typeof (listening.content as Row).script_translation === 'string', 'Listening translation missing.')
    assert(typeof (speaking.content as Row).prompt_translation === 'string', 'Speaking translation missing.')
    assert(((assessment.content as Row).can_do_pt as unknown[]).length === 3, 'Final can-do checklist missing.')
    const exercises = blocks.flatMap((block) => block.exercise ? [block.exercise as Row] : [])
    assert(exercises.length === 4 && exercises.every((exercise) => typeof (exercise.content as Row).prompt_translation === 'string'), 'Golden exercise translations incomplete.')

    const visual = byType('visual')!
    const { data: visualData, error: visualError } = await student.functions.invoke('get-lesson-visual-url', {
      body: { externalId: (visual.content as Row).visual_external_id },
    })
    if (visualError || typeof (visualData as Row | null)?.url !== 'string') throw visualError ?? new Error('Visual signed URL missing.')
    const visualResponse = await fetch(String((visualData as Row).url))
    assert(visualResponse.ok && visualResponse.headers.get('content-type')?.includes('svg'), 'Golden visual did not load.')

    const segmentId = Number(vocabularySegments[0]?.id)
    for (const variant of ['normal', 'slow']) {
      const { data: audioData, error: audioError } = await student.functions.invoke('get-lesson-audio-url', { body: { segmentId, variant } })
      if (audioError || typeof (audioData as Row | null)?.url !== 'string') throw audioError ?? new Error(`${variant} audio URL missing.`)
      const audioResponse = await fetch(String((audioData as Row).url))
      assert(audioResponse.ok && audioResponse.headers.get('content-type')?.startsWith('audio/'), `${variant} audio did not load.`)
    }

    const { error: privateError } = await student.schema('private').from('answer_keys').select('*').limit(1)
    assert(privateError, 'Student unexpectedly queried private answers.')
    const firstExercise = exercises[0]!
    const { error: earlyRevealError } = await student.rpc('reveal_exercise_answer', { p_exercise_id: firstExercise.id })
    assert(earlyRevealError, 'Answer was revealed before an attempt.')

    for (const exercise of exercises) {
      const { error: wrongError } = await student.rpc('submit_exercise_attempt', {
        p_exercise_id: exercise.id, p_answer: '__golden_test_wrong__',
      })
      if (wrongError) throw wrongError
      const { data: reveal, error: revealError } = await student.rpc('reveal_exercise_answer', { p_exercise_id: exercise.id })
      if (revealError) throw revealError
      const answer = (reveal as Row).answer
      assert(answer !== undefined && answer !== null, 'Reveal returned no safe answer.')
      const { error: correctError } = await student.rpc('submit_exercise_attempt', {
        p_exercise_id: exercise.id, p_answer: answer,
      })
      if (correctError) throw correctError
    }
    const { error: hintError } = await student.rpc('mark_exercise_hint_used', { p_exercise_id: firstExercise.id })
    if (hintError) throw hintError
    const assessmentBlockId = Number(assessment.id)
    const checklistKey = `${assessmentBlockId}-1`
    const { error: checklistError } = await student.rpc('set_lesson_can_do_check', {
      p_lesson_id: first.id, p_item_key: checklistKey, p_checked: true,
    })
    if (checklistError) throw checklistError
    const { data: refreshed } = await student.rpc('get_lesson_detail', { p_lesson_id: first.id })
    assert(Boolean(((refreshed as Row).can_do_checks as Row)[checklistKey]), 'Can-do self-check was not persisted.')

    const { data: completion, error: completionError } = await student.rpc('complete_lesson', { p_lesson_id: first.id })
    if (completionError) throw completionError
    const result = completion as Row
    assert(result.score_percent === 100, 'Corrected attempts did not produce a 100% score.')
    assert(result.assisted === true && result.xp_awarded === 50, 'Assisted completion incorrectly received a perfection bonus.')
    const { data: unlockedDetail, error: unlockError } = await student.rpc('get_lesson_detail', { p_lesson_id: second.id })
    if (unlockError) throw unlockError
    assert((unlockedDetail as Row).external_id === 'A1-02', 'A1-02 did not auto-unlock.')
    console.log(JSON.stringify({
      goldenLesson: 'PASS', numbering: 'PASS', translations: 'PASS',
      interleavedPractice: 'PASS', visual: 'PASS', audioNormalSlow: 'PASS',
      privateAnswersDenied: 'PASS', revealAfterAttempt: 'PASS',
      assistedBonusSuppressed: 'PASS', checklistPersistence: 'PASS', autoUnlock: 'PASS',
    }))
    await student.auth.signOut()
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) console.error('Test user cleanup failed.')
    }
  }
}

void main().catch((reason: unknown) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
