import { createClient } from '@supabase/supabase-js'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

async function main() {
  const externalId = process.argv[2]
  if (!externalId) throw new Error('Usage: tsx scripts/verify-audio-pipeline.ts <lesson-external-id>')
  const url = requiredEnv('SUPABASE_URL')
  const publishableKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const adminEmail = requiredEnv('ADMIN_EMAIL')
  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const user = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: adminEmail })
  if (linkError || !link.properties.hashed_token) throw linkError ?? new Error('Could not create test session.')
  const { error: verifyError } = await user.auth.verifyOtp({
    token_hash: link.properties.hashed_token, type: 'magiclink',
  })
  if (verifyError) throw verifyError

  const { data: lesson, error: lessonError } = await admin.from('lessons')
    .select('id').eq('external_id', externalId).single()
  if (lessonError) throw lessonError
  const { data: generation, error: generationError } = await user.functions.invoke('generate-lesson-audio', {
    body: { lessonId: Number(lesson.id) },
  })
  if (generationError) throw generationError

  const { data: blocks, error: blockError } = await admin.from('lesson_blocks')
    .select('id').eq('lesson_id', lesson.id)
  if (blockError) throw blockError
  const blockIds = (blocks ?? []).map((block) => Number(block.id))
  const { data: segments, error: segmentError } = await admin.from('lesson_audio_segments')
    .select('id, audio_status, normalized_text').in('lesson_block_id', blockIds)
  if (segmentError) throw segmentError
  const statusCounts = (segments ?? []).reduce<Record<string, number>>((counts, segment) => {
    counts[segment.audio_status] = (counts[segment.audio_status] ?? 0) + 1
    return counts
  }, {})
  if ((segments ?? []).some((segment) => String(segment.normalized_text).includes('_'))) {
    throw new Error('Dirty underscore remains in normalized segment text.')
  }
  const ready = (segments ?? []).find((segment) => segment.audio_status === 'ready')
  if (!ready) throw new Error('No ready segment was generated.')
  const { data: signed, error: signedError } = await user.functions.invoke('get-lesson-audio-url', {
    body: { segmentId: Number(ready.id), variant: 'normal' },
  })
  const signedUrl = typeof (signed as { url?: unknown } | null)?.url === 'string'
    ? (signed as { url: string }).url : null
  if (signedError || !signedUrl) throw signedError ?? new Error('Signed URL missing.')
  const media = await fetch(signedUrl)
  if (!media.ok || !media.headers.get('content-type')?.startsWith('audio/')) {
    throw new Error(`Signed audio fetch failed (${media.status}).`)
  }
  const summary = generation as { ready?: unknown; failed?: unknown; skipped?: unknown }
  console.log(JSON.stringify({
    externalId,
    generation: { ready: Number(summary.ready ?? 0), failed: Number(summary.failed ?? 0), skipped: Number(summary.skipped ?? 0) },
    segments: { total: segments?.length ?? 0, ...statusCounts },
    signedAudioBytes: (await media.arrayBuffer()).byteLength,
  }))
  await user.auth.signOut()
}

void main().catch((reason: unknown) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
