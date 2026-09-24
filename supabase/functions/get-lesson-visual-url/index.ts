import { corsHeaders, errorResponse, HttpError, jsonResponse } from '../_shared/http.ts'
import { createAuthenticatedClients } from '../_shared/supabase.ts'

interface VisualUrlRequest {
  externalId?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed.' }, 405)

  try {
    const clients = await createAuthenticatedClients(req)
    const body = await req.json() as VisualUrlRequest
    const externalId = body.externalId?.trim()
    if (!externalId || externalId.length > 100) throw new HttpError(400, 'Invalid visual request.')

    const { data, error } = await clients.userClient
      .from('lesson_assets')
      .select('storage_path, alt_text')
      .eq('external_id', externalId)
      .single()
    if (error || !data) throw new HttpError(403, 'Visual is not available for this content.')

    const { data: signed, error: signedError } = await clients.adminClient.storage
      .from('lesson-visuals')
      .createSignedUrl(data.storage_path, 300)
    if (signedError || !signed?.signedUrl) throw new HttpError(404, 'Visual unavailable.')
    return jsonResponse(req, { url: signed.signedUrl, alt: data.alt_text, expiresIn: 300 })
  } catch (reason) {
    return errorResponse(req, reason)
  }
})
