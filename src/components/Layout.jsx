import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'

const NAV = [
  { to: '/',           label: 'Canchas',    icon: '⬡' },
  { to: '/calendario', label: 'Calendario', icon: '◫' },
  { to: '/ventas',     label: 'Ventas',     icon: '◈', adminOnly: true },
  { to: '/drills',     label: 'Drills',     icon: '🎯', adminOnly: true },
  { to: '/tours',      label: 'Tours',      icon: '🏓', adminOnly: true },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      const pad = x => String(x).padStart(2,'0')
      setTime(`${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bk)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 200, background: 'var(--sf)', borderRight: '1px solid var(--br)',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--br)' }}>
          <div style={{
            fontFamily: 'var(--font-cond)', fontSize: 26, fontWeight: 800,
            color: 'var(--g)', letterSpacing: 1
          }}>
            PICA<span style={{ color: 'var(--tx)' }}>BOL</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 2 }}>
            {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'host' ? 'Host' : '...'}
          </div>
        </div>
        {/* Clock */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--br)' }}>
          <div style={{
            fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 600,
            color: 'var(--mt)', letterSpacing: 1
          }}>{time}</div>
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV.filter(n => !n.adminOnly || profile?.role === 'admin').map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 7, marginBottom: 3,
                textDecoration: 'none', fontSize: 14, fontWeight: 500,
                background: isActive ? 'var(--glight)' : 'transparent',
                color: isActive ? 'var(--g)' : 'var(--mt)',
                borderLeft: isActive ? '3px solid var(--g)' : '3px solid transparent',
                transition: 'all .15s'
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {/* User / signout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--br)' }}>
          <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.email}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Outlet />
      </main>
    </div>
  )
}
