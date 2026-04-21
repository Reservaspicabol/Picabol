import { useState } from 'react'
import { useBookings } from '../hooks/useBookings'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import CourtCard from '../components/CourtCard'
import BookingModal from '../components/BookingModal'
import { todayStr, fmtMXN } from '../lib/utils'

export default function Courts() {
  const today = todayStr()
  const { profile } = useAuth()
  const {
    bookings, createBooking, updateBooking,
    startPlay, finishPlay, cancelBooking, expireBooking, addTime
  } = useBookings(today)

  const [modal, setModal]   = useState(null)   // { court, mode }
  const [notifs, setNotifs] = useState([])

  function pushNotif(msg, type = 'ok') {
    const id = Date.now()
    setNotifs(prev => [{ id, msg, type }, ...prev].slice(0, 3))
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 6000)
  }

  async function handleAction(bookingId, action, court) {
    if (action === 'walkin' || action === 'reserva' || action === 'openplay') {
      setModal({ court, mode: action })
      return
    }
    if (action === 'play')       { await startPlay(bookingId);    pushNotif(`Cancha ${court} — juego iniciado`) }
    if (action === 'cancel')     { await cancelBooking(bookingId);pushNotif(`Cancha liberada`, 'warn') }
    if (action === 'end')        { await finishPlay(bookingId);   pushNotif(`Sesión finalizada`) }
    if (action === 'expire')     { await expireBooking(bookingId) }
    if (action === 'reactivate') {
      await updateBooking(bookingId, { status: 'reserved', scheduled_at: new Date().toISOString() })
      pushNotif(`Reactivada con nueva tolerancia de 10 min`, 'warn')
    }
    if (action === 'add30') { await addTime(bookingId, 30); pushNotif(`+30 min agregados`) }
    if (action === 'add60') { await addTime(bookingId, 60); pushNotif(`+1 hora agregada`) }
  }

  async function handleSave(payload) {
    const { error } = await createBooking({ ...payload, created_by: profile?.id })
    if (!error) {
      pushNotif(`${payload.name} registrado en Cancha ${payload.court}`)
      setModal(null)
    }
    return error
  }

  // Stats
  const active   = bookings.filter(b => ['playing','waiting','reserved'].includes(b.status)).length
  const revenue  = bookings.filter(b => ['playing','finished'].includes(b.status))
                           .reduce((a, b) => a + Number(b.revenue || 0), 0)
  const people   = bookings.reduce((a, b) => a + (b.people || 0), 0)
  const gH       = bookings.reduce((a, b) => a + (b.gender_m || 0), 0)
  const gF       = bookings.reduce((a, b) => a + (b.gender_f || 0), 0)
  const gK       = bookings.reduce((a, b) => a + (b.gender_k || 0), 0)

  return (
    <div>
      {/* Notifications */}
      <div style={{ marginBottom: 10 }}>
        {notifs.map(n => (
          <div key={n.id} onClick={() => setNotifs(p => p.filter(x => x.id !== n.id))}
            style={{
              background: n.type === 'danger' ? '#2e0d0d' : n.type === 'warn' ? '#2e1f00' : 'var(--glight)',
              border: `1px solid ${n.type === 'danger' ? '#5a1a1a' : n.type === 'warn' ? '#5a3c00' : 'var(--gd)'}`,
              color: n.type === 'danger' ? 'var(--rd)' : n.type === 'warn' ? 'var(--am)' : 'var(--g)',
              borderRadius: 7, padding: '9px 12px', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 9,
              fontSize: 13, cursor: 'pointer'
            }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: n.type === 'danger' ? 'var(--rd)' : n.type === 'warn' ? 'var(--am)' : 'var(--g)' }} />
            {n.msg}
          </div>
        ))}
      </div>

      {/* Courts grid */}
      {!modal ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[1, 2, 3, 4].map(court => {
              const booking = bookings.find(b =>
                b.court === court && ['reserved','waiting','playing','open-play','expired'].includes(b.status)
              ) || null
              return (
                <CourtCard
                  key={court}
                  court={court}
                  booking={booking}
                  onAction={(id, action) => handleAction(id, action, court)}
                  onNotif={pushNotif}
                />
              )
            })}
          </div>

          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Personas hoy',    val: people,          sub: `H:${gH} · M:${gF} · N:${gK}` },
              { label: 'Ingresos hoy',    val: fmtMXN(revenue), sub: 'MXN acumulado' },
              { label: 'Canchas activas', val: `${active} / 4`, sub: '' },
            ].map(s => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 11, color: 'var(--mt)', letterSpacing: '.06em', marginBottom: 4 }}>
                  {s.label.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 28, fontWeight: 700 }}>{s.val}</div>
                {s.sub && <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <BookingModal
          court={modal.court}
          date={today}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
