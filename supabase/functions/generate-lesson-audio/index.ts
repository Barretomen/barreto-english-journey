import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts'
import { createAuthenticatedClients, requireAdmin } from '../_shared/supabase.ts'
import { generateBlockAudio, type AudioBlockRow } from './audioGenerationService.ts'

interface GenerationRequest {
  blockId?: number
  lessonId?: number
}

const selection = 'id, lesson_id, block_type, content, tts_config, audio_path, slow_audio_path, audio_status, audio_text_hash, exercises(content)'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed.' }, 405)

  try {
    const clients = await createAuthenticatedClients(req)
    await requireAdmin(clients)
    const body = await req.json() as GenerationRequest
    const blockId = Number(body.blockId)
    const lessonId = Number(body.lessonId)
    if (Number.isInteger(blockId) === Number.isInteger(lessonId)) {
      throw new HttpError(400, 'Send exactly one blockId or lessonId.')
    }

    let query = clients.adminClient.from('lesson_blocks').select(selection)
    if (Number.isInteger(blockId)) query = query.eq('id', blockId)
    else query = query.eq('lesson_id', lessonId).in('block_type', ['vocabulary', 'example', 'listening', 'speaking'])
    const { data, error } = await query.order('position')
    if (error) throw error
    if (!data?.length) throw new HttpError(404, 'No audio content found.')

    const results = []
    for (const row of data as unknown as AudioBlockRow[]) {
      results.push(await generateBlockAudio(clients.adminClient, row))
    }
    return jsonResponse(req, {
      results,
      ready: results.filter((item) => item.status === 'ready').length,
      failed: results.filter((item) => item.status === 'failed').length,
    })
  } catch (reason) {
    return errorResponse(req, reason)
  }
})
