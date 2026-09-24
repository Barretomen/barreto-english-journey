import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { requireTtsText } from '../_shared/ttsText.ts'
import { getSpeechSettings, synthesizeSpeech } from './azureSpeechService.ts'
import { uploadAudio } from './storageService.ts'

export interface AudioSegmentRow {
  id: number
  speech_text: string
  audio_path: string | null
  slow_audio_path: string | null
  audio_status: string
  audio_text_hash: string | null
  tts_config: Record<string, unknown>
}

export interface SegmentGenerationResult {
  segmentId: number
  status: 'ready' | 'generating' | 'failed'
  cached?: boolean
  message?: string
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function safeMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.startsWith('Azure Speech request failed')) return reason.message
  if (reason instanceof Error && reason.message === 'Azure Speech is not configured.') return reason.message
  if (reason instanceof Error && reason.message === 'TTS text is empty after normalization.') return reason.message
  return 'Audio generation failed.'
}

export async function generateSegmentAudio(client: SupabaseClient, segment: AudioSegmentRow): Promise<SegmentGenerationResult> {
  try {
    const text = requireTtsText(segment.speech_text)
    const settings = getSpeechSettings(segment.tts_config ?? {})
    const textHash = await sha256(JSON.stringify({ text, ...settings }))
    if (segment.audio_status === 'ready' && segment.audio_text_hash === textHash
      && segment.audio_path && segment.slow_audio_path) {
      return { segmentId: segment.id, status: 'ready', cached: true }
    }

    const { data: cached } = await client.from('lesson_audio_segments')
      .select('audio_path, slow_audio_path, audio_voice, audio_locale, audio_generated_at')
      .eq('audio_text_hash', textHash).eq('audio_status', 'ready')
      .not('audio_path', 'is', null).not('slow_audio_path', 'is', null).limit(1).maybeSingle()
    if (cached?.audio_path && cached.slow_audio_path) {
      const { error } = await client.from('lesson_audio_segments').update({
        audio_path: cached.audio_path, slow_audio_path: cached.slow_audio_path,
        audio_status: 'ready', audio_voice: cached.audio_voice, audio_locale: cached.audio_locale,
        audio_generated_at: cached.audio_generated_at, audio_generation_started_at: null,
        audio_text_hash: textHash, normalized_text: text, audio_error: null,
      }).eq('id', segment.id)
      if (error) throw error
      return { segmentId: segment.id, status: 'ready', cached: true }
    }

    const { data: claimed, error: claimError } = await client.rpc('claim_lesson_audio_segment_generation', {
      p_segment_id: segment.id, p_text_hash: textHash,
    })
    if (claimError) throw claimError
    if (!claimed) return { segmentId: segment.id, status: 'generating' }

    const [normalAudio, slowAudio] = await Promise.all([
      synthesizeSpeech(text, settings.normalRate, settings),
      synthesizeSpeech(text, settings.slowRate, settings),
    ])
    const normalPath = `cache/${textHash}/normal.mp3`
    const slowPath = `cache/${textHash}/slow.mp3`
    await Promise.all([uploadAudio(client, normalPath, normalAudio), uploadAudio(client, slowPath, slowAudio)])
    const { error: updateError } = await client.from('lesson_audio_segments').update({
      audio_path: normalPath, slow_audio_path: slowPath, audio_status: 'ready',
      audio_voice: settings.voice, audio_locale: settings.locale, normalized_text: text,
      audio_generated_at: new Date().toISOString(), audio_generation_started_at: null,
      audio_text_hash: textHash, audio_error: null,
    }).eq('id', segment.id)
    if (updateError) throw updateError
    return { segmentId: segment.id, status: 'ready' }
  } catch (reason) {
    const message = safeMessage(reason)
    await client.from('lesson_audio_segments').update({
      audio_status: 'failed', audio_generation_started_at: null, audio_error: message,
    }).eq('id', segment.id)
    console.error(`Audio generation failed for segment ${segment.id}:`, reason)
    return { segmentId: segment.id, status: 'failed', message }
  }
}
