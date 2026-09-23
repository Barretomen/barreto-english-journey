import { BookOpen, Home, LogOut, Map, ShieldCheck, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { BrandMark } from './BrandMark'
import { OfflineBanner } from './OfflineBanner'

const studentLinks = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/journey', label: 'Jornada', icon: Map, end: false },
  { to: '/review', label: 'Revisão', icon: BookOpen, end: false },
  { to: '/profile', label: 'Perfil', icon: UserRound, end: false }
]

export function AppShell() {
  const { profile, signOut, isDemo } = useAuth()
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="sidebar">
        <BrandMark />
        <nav aria-label="Navegação principal">
          {studentLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon aria-hidden="true" />{label}</NavLink>)}
          {profile?.role === 'admin' ? <NavLink to="/admin"><ShieldCheck aria-hidden="true" />Admin</NavLink> : null}
        </nav>
        <div className="sidebar__footer">
          {isDemo ? <span className="demo-chip">Demonstração local</span> : null}
          <button type="button" onClick={() => void signOut()}><LogOut aria-hidden="true" />Sair</button>
        </div>
      </aside>
      <div className="app-frame">
        <OfflineBanner />
        <header className="mobile-header"><BrandMark /><span className="level-stamp">{profile?.currentLevel ?? 'A1'}</span></header>
        <main id="main-content" tabIndex={-1}><Outlet /></main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {studentLinks.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  )
}
