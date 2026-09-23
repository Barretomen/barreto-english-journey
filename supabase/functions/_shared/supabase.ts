import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.57.4'
import { HttpError } from './http.ts'

function readNamedKey(variable: string, legacyVariable: string): string {
  const raw = Deno.env.get(variable)
  if (raw) {
    const keys = JSON.parse(raw) as Record<string, string>
    const key = keys.default ?? Object.values(keys)[0]
    if (key) return key
  }
  const legacy = Deno.env.get(legacyVariable)
  if (legacy) return legacy
  throw new Error(`Missing ${variable}.`)
}

export interface AuthenticatedClients {
  user: User
  userClient: SupabaseClient
  adminClient: SupabaseClient
}

export async function createAuthenticatedClients(req: Request): Promise<AuthenticatedClients> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required.')

  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('Missing SUPABASE_URL.')

  const publishableKey = readNamedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const secretKey = readNamedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const token = authorization.slice('Bearer '.length)
  const authOptions = { auth: { persistSession: false, autoRefreshToken: false } }
  const userClient = createClient(url, publishableKey, {
    ...authOptions,
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(url, secretKey, authOptions)
  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Invalid session.')

  return { user: data.user, userClient, adminClient }
}

export async function requireAdmin(clients: AuthenticatedClients): Promise<void> {
  const { data, error } = await clients.userClient
    .from('profiles')
    .select('role')
    .eq('id', clients.user.id)
    .single()
  if (error || data?.role !== 'admin') throw new HttpError(403, 'Admin access required.')
}
