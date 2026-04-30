import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { fmtMs, remainingMs, toleranceMs, WARN_BEFORE_MS, TOLERANCE_MS } from '../lib/utils'

export default function CourtCard({ court, booking, onAction, onNotif }) {
  const { profile } = useAuth()
  const [, setTick] = useState(0)
  const isHost = profile?.role === 'host'

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (booking?.status !== 'reserved') return
    // Only start tolerance countdown if scheduled_at is set (walkin arrived, not future reserva)
    if (!booking?.scheduled_at) return
    const tol = toleranceMs(booking)
    if (tol <= 0) {
      onAction(booking.id, 'expire')
      onNotif(`Cancha ${court} — ${booking.name} cancelado automáticamente (no llegó)`, 'danger')
    } else if (tol <= 2 * 60 * 1000 && !booking._notif2m) {
      booking._notif2m = true
      onNotif(`Cancha ${court} — ${booking.name}: quedan ${Math.ceil(tol/60000)} min de tolerancia`, 'warn')
    }
  })

  useEffect(() => {
    if (booking?.status !== 'playing' && booking?.status !== 'open-play') return
    const rem = remainingMs(booking)
    if (rem > 0 && rem <= WARN_BEFORE_MS && !booking._warn10) {
      booking._warn10 = true
      onNotif(`Cancha ${court} — quedan 10 min de ${booking.name}. ¿Agregan tiempo?`, 'warn')
    }
    if (rem <= 0 && !booking._timeup) {
      booking._timeup = true
      onNotif(`Cancha ${court} — tiempo cumplido de ${booking.name}`, 'warn')
    }
  })

  const status = booking?.status

  const statusConfig = {
    available: { label: 'Disponible',         cls: 'badge-green', border: 'var(--br)' },
    reserved:  { label: 'Reservada',           cls: 'badge-gray',  border: 'var(--mt)' },
    waiting:   { label: 'Esperando llegada',   cls: 'badge-amber', border: 'var(--am)' },
    playing:   { label: 'Jugando',             cls: 'badge-green', border: 'var(--g)'  },
    expired:   { label: 'Cancelada (no llegó)',cls: 'badge-red',   border: 'var(--rd)' },
    finished:  { label: 'Finalizada',          cls: 'badge-gray',  border: 'var(--br)' },
  }
  const cfg = statusConfig[status || 'available']

  function renderTimer() {
    if (!booking) return null
    if (status === 'playing') {
      const rem = remainingMs(booking)
      const total = (booking.modality === 'openplay' ? 3 : 1) * 3600000
        + (booking.extra_minutes || 0) * 60000
      const pct = Math.max(0, rem / total * 100)
      const color = rem < WARN_BEFORE_MS ? 'var(--am)' : 'var(--g)'
      return (
        <>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 46, fontWeight: 800, color, lineHeight: 1, margin: '8px 0' }}>
            {rem > 0 ? fmtMs(rem) : 'TIEMPO'}
          </div>
          <div style={{ background: '#2a2a2a', borderRadius: 4, height: 4, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .5s linear', borderRadius: 4 }} />
          </div>
        </>
      )
    }
    if (status === 'reserved' || status === 'waiting') {
      // No scheduled_at = future reservation, don't show tolerance timer
      if (!booking?.scheduled_at) {
        return (
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, color: 'var(--mt)', margin: '8px 0' }}>
            ⏰ Reserva agendada · {booking.hour}:00
          </div>
        )
      }
      const tol = toleranceMs(booking)
      const pct = Math.max(0, tol / TOLERANCE_MS * 100)
      const color = tol < 2 * 60 * 1000 ? 'var(--rd)' : 'var(--am)'
      if (tol > TOLERANCE_MS) return (
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 36, fontWeight: 700, color: 'var(--br)', margin: '8px 0' }}>--:--</div>
      )
      return (
        <>
          <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 4 }}>Tolerancia restante</div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 40, fontWeight: 800, color, lineHeight: 1, margin: '4px 0 8px' }}>
            {tol > 0 ? fmtMs(tol) : '00:00'}
          </div>
          <div style={{ background: '#2a2a2a', borderRadius: 4, height: 4, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .5s linear', borderRadius: 4 }} />
          </div>
        </>
      )
    }
    return null
  }

  function renderActions() {
    if (!booking) return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-teal btn-sm" onClick={() => onAction(null, 'walkin', court)}>Walkin</button>
      </div>
    )
    if (status === 'reserved' || status === 'waiting') return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-green btn-sm" onClick={() => onAction(booking.id, 'play')}>Llegó / Play</button>
        {!isHost && (
          <button className="btn btn-red btn-sm" onClick={() => onAction(booking.id, 'cancel')}>Cancelar</button>
        )}
      </div>
    )
    if (status === 'playing') return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-amber btn-sm" onClick={() => onAction(booking.id, 'add30')}>+30 min</button>
        <button className="btn btn-amber btn-sm" onClick={() => onAction(booking.id, 'add60')}>+1 hora</button>
        <button className="btn btn-red btn-sm"   onClick={() => onAction(booking.id, 'end')}>Finalizar</button>
      </div>
    )
    if (status === 'expired') return (
      !isHost ? (
        <button className="btn btn-red btn-sm" onClick={() => onAction(booking.id, 'reactivate')}>
          Reactivar manualmente
        </button>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--rd)', textAlign: 'center' }}>Contacta al administrador</div>
      )
    )
    return null
  }

  return (
    <div style={{
      background: 'var(--cd)',
      border: `1.5px solid ${cfg.border}`,
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color .2s'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--br)'
      }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--mt)' }}>
          Cancha {court}
        </div>
        <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {!booking ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, color: 'var(--mt)', marginBottom: 12 }}>
              Sin actividad
            </div>
            {renderActions()}
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {booking.modality === 'openplay' ? `Sala: ${booking.name}` : booking.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 8 }}>
              {booking.modality === 'openplay' ? 'Open Play' : 'Cancha privada'} · {booking.people}p
              {booking.city ? ` · ${booking.city}` : ''}
            </div>
            {status === 'expired' && (
              <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', borderRadius: 7, padding: '8px 12px', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--rd)', marginBottom: 4 }}>
                  Cancelado automáticamente
                </div>
                <div style={{ fontSize: 11, color: '#c07070' }}>No llegó en los 10 min de tolerancia</div>
              </div>
            )}
            {renderTimer()}
            {renderActions()}
          </>
        )}
      </div>
    </div>
  )
}
