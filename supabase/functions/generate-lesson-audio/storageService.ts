import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

export const audioBucket = 'lesson-audio'

export async function uploadAudio(client: SupabaseClient, path: string, audio: ArrayBuffer): Promise<void> {
  const { error } = await client.storage.from(audioBucket).upload(path, audio, {
    contentType: 'audio/mpeg',
    cacheControl: '300',
    upsert: true,
  })
  if (error) throw error
}
