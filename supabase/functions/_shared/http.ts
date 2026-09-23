const defaultOrigins = [
  'https://barretomen.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const allowed = configured.length > 0 ? configured : defaultOrigins
  const origin = req.headers.get('origin') ?? ''

  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export function errorResponse(req: Request, reason: unknown): Response {
  const status = reason instanceof HttpError ? reason.status : 500
  const message = reason instanceof HttpError ? reason.message : 'Internal server error.'
  if (!(reason instanceof HttpError)) console.error(reason)
  return jsonResponse(req, { error: message }, status)
}
