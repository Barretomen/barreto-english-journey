import type { Session } from '@supabase/supabase-js'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usernameToInternalEmail } from '../../lib/auth'
import { isSupabaseConfigured, supabase } from '../../lib/supabase/client'
import { getProfile } from '../lessons/repository'
import type { Profile } from '../../types/domain'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isDemo: boolean
  signIn: (username: string, password: string) => Promise<void>
  enterDemo: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) setProfile(await getProfile(data.session.user.id))
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setProfile(null)
      else void getProfile(nextSession.user.id).then(setProfile)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    if (!supabase) throw new Error('Configure o Supabase para entrar com usuário e senha.')
    const email = usernameToInternalEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Usuário ou senha incorretos.')
    const nextProfile = await getProfile(data.user.id)
    setSession(data.session)
    setProfile(nextProfile)
    setIsDemo(false)
  }, [])

  const enterDemo = useCallback(async () => {
    const nextProfile = await getProfile('demo-student')
    setProfile(nextProfile)
    setIsDemo(true)
  }, [])

  const signOut = useCallback(async () => {
    if (supabase && session) await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setIsDemo(false)
  }, [session])

  const value = useMemo<AuthState>(() => ({ session, profile, loading, isDemo, signIn, enterDemo, signOut }), [session, profile, loading, isDemo, signIn, enterDemo, signOut])
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return context
}
