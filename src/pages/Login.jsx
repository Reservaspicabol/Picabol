import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const err = await signIn(email, password)
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#111',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-cond)', fontSize: 48, fontWeight: 800,
            color: 'var(--g)', letterSpacing: 2
          }}>
            PICA<span style={{ color: 'var(--tx)' }}>BOL</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--mt)', marginTop: 4 }}>
            Sistema de administración
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--cd)', border: '1px solid var(--br)',
          borderRadius: 12, padding: 24
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label className="form-label">Correo electrónico</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@picabol.mx"
                required
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Contraseña</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div style={{
                background: '#2e0d0d', border: '1px solid #5a1a1a',
                color: 'var(--rd)', borderRadius: 6, padding: '8px 12px',
                fontSize: 13, marginBottom: 14
              }}>
                {error}
              </div>
            )}
            <button
              className="btn btn-green"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', fontSize: 15 }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--mt)' }}>
          Acceso restringido · Solo personal autorizado
        </div>
      </div>
    </div>
  )
}
