import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Courts from './pages/Courts'
import Calendar from './pages/Calendar'
import Ventas from './pages/Ventas'
import Drills from './pages/Drills'
import Tours from './pages/Tours'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 28, fontWeight: 700, color: 'var(--g)', letterSpacing: 2 }}>
        PICA<span style={{ color: 'var(--tx)' }}>BOL</span>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGuard />} />
          <Route path="/" element={
            <ProtectedRoute><Layout /></ProtectedRoute>
          }>
            <Route index element={<Courts />} />
            <Route path="calendario" element={<Calendar />} />
            <Route path="ventas" element={
              <ProtectedRoute adminOnly><Ventas /></ProtectedRoute>
            } />
            <Route path="drills" element={
              <ProtectedRoute adminOnly><Drills /></ProtectedRoute>
            } />
            <Route path="tours" element={
              <ProtectedRoute adminOnly><Tours /></ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function LoginGuard() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <Login />
}
