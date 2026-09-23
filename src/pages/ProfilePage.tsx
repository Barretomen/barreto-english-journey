import { LogOut, ShieldCheck } from 'lucide-react'
import { Button } from '../components/Button'
import { useAuth } from '../features/auth/AuthContext'

export default function ProfilePage() {
  const { profile, signOut, isDemo } = useAuth()
  return <div className="page"><header className="page-heading"><span className="field-label"><i />SUA CONTA</span><h1>Perfil</h1><p>As informações essenciais do seu acesso.</p></header><section className="profile-card"><div className="profile-monogram" aria-hidden="true">{profile?.displayName.slice(0, 1)}</div><div><h2>{profile?.displayName}</h2><p>@{profile?.username}</p></div><dl><div><dt>Nível</dt><dd>{profile?.currentLevel}</dd></div><div><dt>Tipo de conta</dt><dd><ShieldCheck aria-hidden="true" />{profile?.role === 'admin' ? 'Professor / admin' : 'Aluna'}</dd></div><div><dt>Ambiente</dt><dd>{isDemo ? 'Demonstração local' : 'Conectado ao Supabase'}</dd></div></dl><Button variant="secondary" onClick={() => void signOut()}><LogOut aria-hidden="true" />Sair da conta</Button></section></div>
}
