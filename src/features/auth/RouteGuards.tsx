import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/LoadingState'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { session, profile, isDemo, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="Abrindo sua jornada…" fullPage />
  if ((!session && !isDemo) || !profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Navigate to="/app" replace />
  return <Outlet />
}
