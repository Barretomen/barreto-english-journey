import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts'
import { createAuthenticatedClients } from '../_shared/supabase.ts'

interface AudioUrlRequest {
  segmentId?: number
  blockId?: number
  variant?: 'normal' | 'slow'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed.' }, 405)

  try {
    const clients = await createAuthenticatedClients(req)
    const body = await req.json() as AudioUrlRequest
    const segmentId = Number(body.segmentId)
    const blockId = Number(body.blockId)
    if ([Number.isInteger(segmentId), Number.isInteger(blockId)].filter(Boolean).length !== 1
      || !['normal', 'slow'].includes(body.variant ?? '')) {
      throw new HttpError(400, 'Invalid audio request.')
    }

    const table = Number.isInteger(segmentId) ? 'lesson_audio_segments' : 'lesson_blocks'
    const targetId = Number.isInteger(segmentId) ? segmentId : blockId
    const { data, error } = await clients.userClient
      .from(table)
      .select('audio_path, slow_audio_path, audio_status')
      .eq('id', targetId)
      .single()
    if (error || !data) throw new HttpError(403, 'Audio is not available for this lesson.')
    if (data.audio_status !== 'ready') throw new HttpError(404, 'Audio unavailable.')

    const path = body.variant === 'slow' ? data.slow_audio_path : data.audio_path
    if (!path) throw new HttpError(404, 'Audio unavailable.')
    const { data: signed, error: signedError } = await clients.adminClient.storage
      .from('lesson-audio')
      .createSignedUrl(path, 300)
    if (signedError || !signed?.signedUrl) throw new HttpError(404, 'Audio unavailable.')
    return jsonResponse(req, { url: signed.signedUrl, expiresIn: 300 })
  } catch (reason) {
    return errorResponse(req, reason)
  }
})
