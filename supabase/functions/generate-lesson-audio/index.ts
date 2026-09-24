import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts'
import { createAuthenticatedClients, requireAdmin } from '../_shared/supabase.ts'
import { generateBlockAudio, type AudioBlockRow } from './audioGenerationService.ts'
import { generateSegmentAudio, type AudioSegmentRow } from './segmentAudioGenerationService.ts'

interface GenerationRequest {
  segmentId?: number
  blockId?: number
  lessonId?: number
  moduleId?: number
  levelCode?: string
}

const selection = 'id, lesson_id, block_type, content, transcript, audio_required, audio_role, tts_config, audio_path, slow_audio_path, audio_status, audio_text_hash, exercises(content), lessons!inner(module_id, modules!inner(level_code))'
const segmentSelection = 'id, speech_text, tts_config, audio_path, slow_audio_path, audio_status, audio_text_hash, lesson_blocks!inner(id, lesson_id, lessons!inner(module_id, modules!inner(level_code)))'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed.' }, 405)

  try {
    const clients = await createAuthenticatedClients(req)
    await requireAdmin(clients)
    const body = await req.json() as GenerationRequest
    const segmentId = Number(body.segmentId)
    const blockId = Number(body.blockId)
    const lessonId = Number(body.lessonId)
    const moduleId = Number(body.moduleId)
    const levelCode = body.levelCode?.trim().toUpperCase()
    const scopes = [Number.isInteger(segmentId), Number.isInteger(blockId), Number.isInteger(lessonId), Number.isInteger(moduleId), Boolean(levelCode)]
    if (scopes.filter(Boolean).length !== 1) {
      throw new HttpError(400, 'Send exactly one segmentId, blockId, lessonId, moduleId or levelCode.')
    }
    if (levelCode && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(levelCode)) {
      throw new HttpError(400, 'Invalid levelCode.')
    }

    let blockRows: AudioBlockRow[] = []
    if (!Number.isInteger(segmentId)) {
      let query = clients.adminClient.from('lesson_blocks').select(selection).eq('audio_required', true)
      if (Number.isInteger(blockId)) query = query.eq('id', blockId)
      else if (Number.isInteger(lessonId)) query = query.eq('lesson_id', lessonId)
      else if (Number.isInteger(moduleId)) query = query.eq('lessons.module_id', moduleId)
      else query = query.eq('lessons.modules.level_code', levelCode!)
      const { data, error } = await query.order('position')
      if (error) throw error
      blockRows = (data ?? []) as unknown as AudioBlockRow[]
    }

    let segmentQuery = clients.adminClient.from('lesson_audio_segments').select(segmentSelection)
    if (Number.isInteger(segmentId)) segmentQuery = segmentQuery.eq('id', segmentId)
    else if (Number.isInteger(blockId)) segmentQuery = segmentQuery.eq('lesson_block_id', blockId)
    else if (Number.isInteger(lessonId)) segmentQuery = segmentQuery.eq('lesson_blocks.lesson_id', lessonId)
    else if (Number.isInteger(moduleId)) segmentQuery = segmentQuery.eq('lesson_blocks.lessons.module_id', moduleId)
    else segmentQuery = segmentQuery.eq('lesson_blocks.lessons.modules.level_code', levelCode!)
    const { data: segmentData, error: segmentError } = await segmentQuery.order('position')
    if (segmentError) throw segmentError
    const segmentRows = (segmentData ?? []) as unknown as AudioSegmentRow[]
    if (!blockRows.length && !segmentRows.length) throw new HttpError(404, 'No audio content found.')

    const results = []
    for (const row of blockRows) {
      results.push(await generateBlockAudio(clients.adminClient, row))
    }
    for (const row of segmentRows) results.push(await generateSegmentAudio(clients.adminClient, row))
    return jsonResponse(req, {
      results,
      ready: results.filter((item) => item.status === 'ready').length,
      failed: results.filter((item) => item.status === 'failed').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
    })
  } catch (reason) {
    return errorResponse(req, reason)
  }
})
