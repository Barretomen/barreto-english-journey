import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { getSpeechSettings, synthesizeSpeech } from './azureSpeechService.ts'
import { uploadAudio } from './storageService.ts'

interface ExerciseRow {
  content: Record<string, unknown> | null
}

export interface AudioBlockRow {
  id: number
  lesson_id: number
  block_type: string
  content: Record<string, unknown>
  transcript: string | null
  audio_required: boolean
  audio_role: string | null
  tts_config: Record<string, unknown>
  audio_path: string | null
  slow_audio_path: string | null
  audio_status: string
  audio_text_hash: string | null
  exercises: ExerciseRow | ExerciseRow[] | null
}

export interface GenerationResult {
  blockId: number
  status: 'ready' | 'generating' | 'failed' | 'skipped'
  cached?: boolean
  message?: string
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function extractSpeechText(block: AudioBlockRow): string | null {
  const transcript = stringValue(block.transcript)
  if (transcript) return transcript
  const exercise = Array.isArray(block.exercises) ? block.exercises[0] : block.exercises
  const exerciseContent = exercise?.content ?? {}
  if (block.block_type === 'listening') return stringValue(exerciseContent.speech) ?? stringValue(block.content.speech)
  if (block.block_type === 'speaking') return stringValue(block.content.phrase)
  if (block.block_type === 'vocabulary') return stringValue(block.content.term)
  if (block.block_type === 'example') return stringValue(block.content.body) ?? stringValue(block.content.example)
  return null
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function safeMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.startsWith('Azure Speech request failed')) return reason.message
  if (reason instanceof Error && reason.message === 'Azure Speech is not configured.') return reason.message
  return 'Audio generation failed.'
}

export async function generateBlockAudio(client: SupabaseClient, block: AudioBlockRow): Promise<GenerationResult> {
  const text = extractSpeechText(block)
  if (!text) return { blockId: block.id, status: 'skipped', message: 'No English audio text found.' }

  try {
    const settings = getSpeechSettings(block.tts_config ?? {})
    const textHash = await sha256(JSON.stringify({ text, ...settings }))

    if (block.audio_status === 'ready' && block.audio_text_hash === textHash && block.audio_path && block.slow_audio_path) {
      return { blockId: block.id, status: 'ready', cached: true }
    }

    const { data: cached } = await client
      .from('lesson_blocks')
      .select('audio_path, slow_audio_path, audio_voice, audio_locale, audio_generated_at')
      .eq('audio_text_hash', textHash)
      .eq('audio_status', 'ready')
      .not('audio_path', 'is', null)
      .not('slow_audio_path', 'is', null)
      .limit(1)
      .maybeSingle()

    if (cached?.audio_path && cached.slow_audio_path) {
      const { error } = await client.from('lesson_blocks').update({
        audio_path: cached.audio_path,
        slow_audio_path: cached.slow_audio_path,
        audio_status: 'ready',
        audio_voice: cached.audio_voice,
        audio_locale: cached.audio_locale,
        audio_generated_at: cached.audio_generated_at,
        audio_generation_started_at: null,
        audio_text_hash: textHash,
        audio_error: null,
      }).eq('id', block.id)
      if (error) throw error
      return { blockId: block.id, status: 'ready', cached: true }
    }

    const { data: claimed, error: claimError } = await client.rpc('claim_lesson_audio_generation', {
      p_block_id: block.id,
      p_text_hash: textHash,
    })
    if (claimError) throw claimError
    if (!claimed) return { blockId: block.id, status: 'generating' }

    const [normalAudio, slowAudio] = await Promise.all([
      synthesizeSpeech(text, settings.normalRate, settings),
      synthesizeSpeech(text, settings.slowRate, settings),
    ])
    const normalPath = `cache/${textHash}/normal.mp3`
    const slowPath = `cache/${textHash}/slow.mp3`
    await Promise.all([
      uploadAudio(client, normalPath, normalAudio),
      uploadAudio(client, slowPath, slowAudio),
    ])

    const { error: updateError } = await client.from('lesson_blocks').update({
      audio_path: normalPath,
      slow_audio_path: slowPath,
      audio_status: 'ready',
      audio_voice: settings.voice,
      audio_locale: settings.locale,
      audio_generated_at: new Date().toISOString(),
      audio_generation_started_at: null,
      audio_text_hash: textHash,
      audio_error: null,
    }).eq('id', block.id)
    if (updateError) throw updateError
    return { blockId: block.id, status: 'ready' }
  } catch (reason) {
    const message = safeMessage(reason)
    await client.from('lesson_blocks').update({
      audio_status: 'failed',
      audio_generation_started_at: null,
      audio_error: message,
    }).eq('id', block.id)
    console.error(`Audio generation failed for block ${block.id}:`, reason)
    return { blockId: block.id, status: 'failed', message }
  }
}
