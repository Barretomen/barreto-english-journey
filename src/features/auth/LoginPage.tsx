import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BrandMark } from '../../components/BrandMark'
import { Button } from '../../components/Button'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  const { session, profile, isDemo, signIn, enterDemo } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if ((session || isDemo) && profile) return <Navigate to="/app" replace />

  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(username, password)
      await navigate(from, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemo() {
    await enterDemo()
    await navigate('/app', { replace: true })
  }

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <BrandMark />
        <div className="login-intro__copy">
          <span className="field-label"><i />Uma jornada, no seu ritmo</span>
          <h1 id="login-title">English<br /><strong>Journey.</strong></h1>
          <p>Comece do zero. Avance com clareza. Cada aula aparece quando for a hora certa.</p>
        </div>
        <div className="login-route" aria-hidden="true"><span>START</span><i /><b>A1</b><i /><span>A2</span></div>
      </section>
      <section className="login-panel" aria-label="Entrar na plataforma">
        <div className="login-card">
          <div className="login-card__head"><span>ACESSO DA ALUNA</span><small>PT / EN</small></div>
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            <h2>Continue de onde parou.</h2>
            <label htmlFor="username">Usuário</label>
            <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} placeholder="seu.usuario" aria-invalid={Boolean(error)} />
            <label htmlFor="password">Senha</label>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required aria-invalid={Boolean(error)} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
            </div>
            <div className="form-message" role="alert" aria-live="assertive">{error}</div>
            <Button type="submit" variant="signal" full disabled={submitting}>{submitting ? 'Entrando…' : <>Entrar <ArrowRight aria-hidden="true" /></>}</Button>
          </form>
          {!isSupabaseConfigured ? <div className="demo-entry"><p>Supabase ainda não está configurado neste ambiente.</p><Button type="button" variant="secondary" full onClick={() => void handleDemo()}>Explorar demonstração</Button></div> : null}
          <p className="login-help">Seu acesso é criado pelo professor. Não compartilhe sua senha.</p>
        </div>
      </section>
    </main>
  )
}
