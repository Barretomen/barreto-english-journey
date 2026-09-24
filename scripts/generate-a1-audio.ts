import { createClient } from '@supabase/supabase-js'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function main() {
  const url = requiredEnv('SUPABASE_URL')
  const publishableKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const adminEmail = requiredEnv('ADMIN_EMAIL')
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const user = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminEmail })
  if (linkError || !link.properties.hashed_token) throw linkError ?? new Error('Could not create admin audio session.')
  const { error: verifyError } = await user.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (verifyError) throw verifyError

  const { data: modules, error: moduleError } = await admin.from('modules').select('id').eq('level_code', 'A1')
  if (moduleError) throw moduleError
  const { data: lessons, error: lessonError } = await admin.from('lessons').select('id,external_id,global_order')
    .in('module_id', (modules ?? []).map((module) => module.id)).eq('is_legacy', false).order('global_order')
  if (lessonError) throw lessonError
  if (lessons?.length !== 48) throw new Error(`Expected 48 A1 lessons, received ${lessons?.length ?? 0}.`)

  const failures: string[] = []
  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index]
    const { data, error } = await user.functions.invoke('generate-lesson-audio', {
      body: { lessonId: Number(lesson.id) },
    })
    if (error) {
      failures.push(`${lesson.external_id}: ${error.message}`)
      console.log(`[${index + 1}/48] ${lesson.external_id}: invocation failed`)
      continue
    }
    const summary = data as { ready?: unknown; failed?: unknown; skipped?: unknown }
    const failed = Number(summary.failed ?? 0)
    if (failed > 0) failures.push(`${lesson.external_id}: ${failed} target(s) failed`)
    console.log(`[${index + 1}/48] ${lesson.external_id}: ready=${Number(summary.ready ?? 0)} failed=${failed} skipped=${Number(summary.skipped ?? 0)}`)
  }

  const { data: blocks, error: blockError } = await admin.from('lesson_blocks').select('id,audio_required,audio_status')
    .in('lesson_id', lessons.map((lesson) => lesson.id))
  if (blockError) throw blockError
  const blockIds = (blocks ?? []).map((block) => Number(block.id))
  const { data: segments, error: segmentError } = await admin.from('lesson_audio_segments')
    .select('audio_status').in('lesson_block_id', blockIds)
  if (segmentError) throw segmentError
  const count = (rows: Array<{ audio_status: string }>, status: string) => rows.filter((row) => row.audio_status === status).length
  const requiredBlocks = (blocks ?? []).filter((block) => block.audio_required)
  const summary = {
    blockReady: count(requiredBlocks, 'ready'),
    blockFailed: count(requiredBlocks, 'failed'),
    segmentReady: count(segments ?? [], 'ready'),
    segmentFailed: count(segments ?? [], 'failed'),
    segmentMissing: count(segments ?? [], 'missing'),
  }
  console.log('A1 audio generation summary.', summary)
  await user.auth.signOut()
  if (failures.length || summary.segmentReady !== 716 || summary.segmentFailed || summary.segmentMissing) {
    throw new Error(`A1 audio rollout incomplete: ${failures.join('; ') || JSON.stringify(summary)}`)
  }
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
