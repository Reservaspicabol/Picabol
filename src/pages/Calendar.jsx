import { useState, useEffect } from 'react'
import { fetchBookingsRange } from '../hooks/useBookings'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import {
  HOURS, COURTS, DAYS_ES, MONTHS_ES, OPENPLAY_HOURS,
  getWeekDays, ymd, todayStr, isSlotBlocked, fmtMXN
} from '../lib/utils'

const TOUR_HOURS = 3

export default function Calendar() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(todayStr())
  const [courtFilter, setCourtFilter] = useState(0)
  const [bookings, setBookings] = useState([])
  const [tourBookings, setTourBookings] = useState([])
  const [drillBookings, setDrillBookings] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ name:'', city:'', modality:'privada', people:2, notes:'', duration:1 })
  const [extendModal, setExtendModal] = useState(null) // booking to extend
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notif, setNotif] = useState('')

  const days = getWeekDays(weekOffset)

  useEffect(() => {
    const from = ymd(days[0])
    const to   = ymd(days[6])

    function loadAll() {
      fetchBookingsRange(from, to).then(({ data }) => setBookings(data || []))
      supabase.from('tour_bookings')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .neq('status', 'cancelled')
        .then(({ data }) => setTourBookings(data || []))
    }

    loadAll()

    const channel = supabase.channel('cal-week-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_bookings' }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [weekOffset])

  // Normalize tour bookings to look like regular bookings for slot blocking
  const tourBookingsNormalized = tourBookings.map(tb => ({
    ...tb,
    modality: 'tour',
    name: `🏓 Tour: ${tb.client_name}`,
    people: 1,
  }))

  // All bookings combined for slot blocking
  const allBookings = [...bookings, ...tourBookingsNormalized]

  const weekLabel = (() => {
    const f = days[0], l = days[6]
    return `${f.getDate()} ${MONTHS_ES[f.getMonth()]} — ${l.getDate()} ${MONTHS_ES[l.getMonth()]} ${l.getFullYear()}`
  })()

  const visibleCourts = courtFilter === 0 ? COURTS : [courtFilter]
  const today = todayStr()

  function isSlotBlockedAll(date, court, hour) {
    for (const b of bookings) {
      if (b.date !== date || b.court !== court) continue
      const slots = b.modality === 'openplay' ? OPENPLAY_HOURS : (b.duration || 1)
      if (hour >= b.hour && hour < b.hour + slots) return { ...b, type: 'booking' }
    }
    for (const b of tourBookings) {
      if (b.date !== date || b.court !== court) continue
      if (hour >= b.hour && hour < b.hour + TOUR_HOURS) return { ...b, type: 'tour', name: b.client_name, modality: 'tour' }
    }
    for (const b of drillBookings) {
      if (b.date !== date || b.court !== court) continue
      if (hour >= b.hour && hour < b.hour + 1) return { ...b, type: 'drill', name: b.client_name, modality: 'drill' }
    }
    return null
  }

  async function saveBooking() {
    if (!form.name.trim()) return setError('Ingresa el nombre')
    const { hour, court } = modal
    const slots = form.modality === 'openplay' ? OPENPLAY_HOURS : 1
    for (let i = 0; i < slots; i++) {
      if (isSlotBlockedAll(selectedDay, court, hour + i)) {
        return setError(`Conflicto en Cancha ${court} a las ${hour + i}:00`)
      }
    }
    if (hour + slots - 1 > HOURS[HOURS.length - 1]) {
      return setError('Open Play excede el horario de cierre (21:00)')
    }
    setSaving(true)
    const duration = form.modality === 'privada' ? (form.duration || 1) : OPENPLAY_HOURS
    const revenue = form.modality === 'privada'
      ? (duration === 2 ? 750 : 400 * duration)
      : 200 * form.people
    const { data, error } = await supabase.from('bookings').insert({
      date: selectedDay, hour, court,
      modality: form.modality,
      duration: form.modality === 'privada' ? (form.duration || 1) : OPENPLAY_HOURS,
      name: form.name.trim(),
      city: form.city.trim() || null,
      people: form.people,
      notes: form.notes.trim() || null,
      status: 'reserved',
      revenue,
      created_by: profile?.id
    }).select().single()

    if (error) { setError(error.message); setSaving(false); return }
    setBookings(prev => [...prev, data])
    setNotif(`Guardado — ${form.modality === 'openplay' ? 'Sala: ' : ''}${form.name} · Cancha ${court} · ${hour}:00`)
    setModal(null)
    setSaving(false)
  }

  async function deleteBooking(id, e) {
    e.stopPropagation()
    const b = bookings.find(x => x.id === id)
    await supabase.from('bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(x => x.id !== id))
    setNotif(`Eliminada — ${b?.name}`)
  }

  const dayBookings = bookings.filter(b => b.date === selectedDay)
  const dayTours    = tourBookings.filter(b => b.date === selectedDay)
  const dayRevenue  = dayBookings.reduce((a, b) => a + Number(b.revenue || 0), 0)

  return (
    <div>
      {notif && (
        <div onClick={() => setNotif('')} style={{
          background: 'var(--glight)', border: '1px solid var(--gd)', color: 'var(--g)',
          borderRadius: 7, padding: '8px 12px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer'
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--g)' }} />
          {notif}
        </div>
      )}

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w - 1)}>←</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 600 }}>{weekLabel}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setWeekOffset(0); setSelectedDay(todayStr()) }}>Hoy</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(w => w + 1)}>→</button>
      </div>

      {/* Day tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {days.map(d => {
          const ds = ymd(d)
          const count = bookings.filter(b => b.date === ds).length + tourBookings.filter(b => b.date === ds).length
          const isToday = ds === today
          const isActive = ds === selectedDay
          return (
            <div key={ds} onClick={() => setSelectedDay(ds)} style={{
              flex: 1, background: isActive ? 'var(--g)' : 'var(--sf)',
              border: `1px solid ${isActive ? 'var(--g)' : isToday ? 'var(--am)' : 'var(--br)'}`,
              borderRadius: 8, padding: '7px 4px', textAlign: 'center', cursor: 'pointer'
            }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: isActive ? '#0d1f00' : isToday ? 'var(--am)' : 'var(--mt)' }}>
                {DAYS_ES[d.getDay()]}
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, color: isActive ? '#0d1f00' : 'var(--tx)' }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: 10, color: isActive ? '#1a3d00' : 'var(--mt)' }}>
                {count ? `${count} res.` : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* Court filter */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--mt)' }}>Ver:</span>
        {[0,1,2,3,4].map(n => (
          <button key={n} onClick={() => setCourtFilter(n)}
            style={{
              fontFamily: 'var(--font-cond)', fontSize: 12, padding: '3px 10px',
              borderRadius: 5, border: '1px solid var(--br)', cursor: 'pointer',
              background: courtFilter === n ? 'var(--bl)' : 'transparent',
              color: courtFilter === n ? '#fff' : 'var(--mt)',
              borderColor: courtFilter === n ? 'var(--bl)' : 'var(--br)'
            }}>
            {n === 0 ? 'Todas' : `Cancha ${n}`}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { bg: '#1a2e0d', border: 'var(--gd)', label: 'Cancha privada' },
          { bg: '#0d1e35', border: '#1e4a8a',   label: 'Open Play (3 h)' },
          { bg: '#2e1a0d', border: '#8a4a1e',   label: 'Dink & Drink Tour' },
          { bg: '#1e1535', border: '#6b3fa0',   label: 'Drill / Clase' },
          { bg: 'var(--sf)', border: 'var(--br)', label: 'Disponible' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--mt)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, border: `1px solid ${l.border}` }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Court headers */}
      <div style={{ display: 'flex', marginLeft: 52, gap: 3, marginBottom: 4 }}>
        {visibleCourts.map(c => (
          <div key={c} style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 600, color: 'var(--mt)', textAlign: 'center', letterSpacing: '.05em' }}>
            Cancha {c}
          </div>
        ))}
      </div>

      {/* Timeline */}
      {HOURS.map(h => {
        const isPastDay = selectedDay < today
        const isPastHour = isPastDay || (selectedDay === today && h < new Date().getHours())
        return (
          <div key={h}>
            <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 40 }}>
              <div style={{ width: 48, flexShrink: 0, fontSize: 11, color: 'var(--mt)', paddingTop: 4, textAlign: 'right', paddingRight: 8, fontFamily: 'var(--font-cond)' }}>
                {h}:00
              </div>
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${visibleCourts.length}, 1fr)`, gap: 3 }}>
                {visibleCourts.map(court => {
                  const booking    = bookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  const tourBooking = tourBookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  const blocker    = !booking && !tourBooking ? isSlotBlockedAll(selectedDay, court, h) : null
                  const isOPContinuation = blocker && blocker.modality === 'openplay' && blocker.hour !== h
                  const isTourContinuation = blocker && blocker.type === 'tour' && blocker.hour !== h

                  // Tour booking start
                  if (tourBooking) {
                    return (
                      <div key={court} style={{
                        background: '#2e1a0d', border: '1px solid #8a4a1e',
                        borderRadius: '5px 5px 0 0', borderBottom: 'none',
                        padding: '4px 6px', position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: '#e8a87c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🏓 {tourBooking.client_name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--mt)' }}>
                          {tourBooking.package} · {tourBooking.hotel?.substring(0, 15)}
                        </div>
                      </div>
                    )
                  }

                  // Drill booking
                  const drillBooking = drillBookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  if (drillBooking) {
                    return (
                      <div key={court} style={{
                        background: '#1e1535', border: '1px solid #6b3fa0',
                        borderRadius: 5, padding: '4px 6px', overflow: 'hidden',
                      }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: '#c8a8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          🎯 {drillBooking.client_name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--mt)' }}>
                          {drillBooking.type === 'private' ? 'Privado' : 'Colectivo'}
                        </div>
                      </div>
                    )
                  }

                  // Tour continuation
                  if (isTourContinuation) {
                    const isLast = h === blocker.hour + TOUR_HOURS - 1
                    return (
                      <div key={court} style={{
                        background: '#2e1a0d', border: '1px solid #8a4a1e',
                        borderTop: 'none', borderRadius: isLast ? '0 0 5px 5px' : 0,
                        borderBottom: isLast ? undefined : 'none', minHeight: 36
                      }} />
                    )
                  }

                  // Regular booking
                  if (booking) {
                    const isOP = booking.modality === 'openplay'
                    return (
                      <div key={court} style={{
                        background: isOP ? '#0d1e35' : isPastHour ? '#1e1e1e' : '#1a2e0d',
                        border: `1px solid ${isOP ? '#1e4a8a' : isPastHour ? '#2a2a2a' : 'var(--gd)'}`,
                        borderRadius: isOP ? '5px 5px 0 0' : 5,
                        borderBottom: isOP ? 'none' : undefined,
                        padding: '4px 6px', position: 'relative', overflow: 'hidden',
                        opacity: isPastHour && !isOP ? .6 : 1
                      }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: isOP ? 'var(--bl)' : 'var(--g)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isOP ? `Sala: ${booking.name}` : booking.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--mt)' }}>
                          {booking.people}p{booking.city ? ` · ${booking.city}` : ''}
                        </div>
                        {!isPastHour && (
                          <button
                            onClick={e => deleteBooking(booking.id, e)}
                            style={{ position: 'absolute', top: 3, right: 3, background: 'var(--rd)', border: 'none', borderRadius: 3, width: 14, height: 14, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >×</button>
                        )}
                      </div>
                    )
                  }

                  // Open play continuation
                  if (isOPContinuation) {
                    const isLast = h === blocker.hour + OPENPLAY_HOURS - 1
                    return (
                      <div key={court} style={{
                        background: '#0d1e35', border: '1px solid #1e4a8a',
                        borderTop: 'none', borderRadius: isLast ? '0 0 5px 5px' : 0,
                        borderBottom: isLast ? undefined : 'none', minHeight: 36
                      }} />
                    )
                  }

                  if (isPastHour) {
                    return <div key={court} style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 5, opacity: .4, minHeight: 36 }} />
                  }

                  return (
                    <div key={court}
                      onClick={() => { setModal({ hour: h, court }); setForm({ name:'', city:'', modality:'privada', people:2, notes:'' }); setError('') }}
                      style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 5, minHeight: 36, cursor: 'pointer', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--g)'; e.currentTarget.style.background = '#1e2a14' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--br)'; e.currentTarget.style.background = 'var(--sf)' }}
                    />
                  )
                })}
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--br)', margin: '1px 0 1px 52px', opacity: .35 }} />
          </div>
        )
      })}

      {/* Add booking modal */}
      {modal && (
        <div style={{ marginTop: 14, background: 'var(--cd)', border: '1px solid var(--br)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Nueva reserva · Cancha {modal.court} · {modal.hour}:00
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Nombre del cliente" />
            </div>
            <div>
              <label className="form-label">Ciudad</label>
              <input className="form-input" value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} placeholder="Cancún..." />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Modalidad</label>
              <select className="form-select" value={form.modality} onChange={e => setForm(f => ({...f, modality: e.target.value, duration: 1}))}>
                <option value="privada">Cancha privada · $400 · 1 hora</option>
                <option value="openplay">Open Play · $200/p · 3 horas</option>
              </select>
            </div>
            <div>
              <label className="form-label">Personas</label>
              <input className="form-input" type="number" min="1" max="12" value={form.people} onChange={e => setForm(f => ({...f, people: +e.target.value}))} />
            </div>
          </div>
          {form.modality === 'privada' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="form-label">Duración</label>
                <select className="form-select" value={form.duration} onChange={e => setForm(f => ({...f, duration: +e.target.value}))}>
                  <option value={1}>1 hora · $400</option>
                  <option value={2}>2 horas · $750 (ahorro $50)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--g)', fontWeight: 600 }}>
                  Total: ${form.duration === 2 ? '750' : '400'} MXN
                </div>
              </div>
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <label className="form-label">Notas</label>
            <input className="form-input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Cumpleaños, grupo especial..." />
          </div>
          {form.modality === 'openplay' && (
            <div style={{ fontSize: 11, color: 'var(--bl)', marginBottom: 8 }}>
              El Open Play bloquea 3 horas consecutivas en el calendario.
            </div>
          )}
          {error && <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)', borderRadius: 6, padding: '7px 12px', fontSize: 12, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-green" onClick={saveBooking} disabled={saving}>{saving ? 'Guardando...' : 'Guardar reserva'}</button>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Day summary */}
      <div className="card" style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'RESERVAS', val: dayBookings.length + dayTours.length },
          { label: 'PRIVADAS', val: dayBookings.filter(b => b.modality === 'privada').length },
          { label: 'OPEN PLAY', val: dayBookings.filter(b => b.modality === 'openplay').length },
          { label: 'TOURS D&D', val: dayTours.length },
          { label: 'DRILLS', val: drillBookings.filter(b => b.date === selectedDay).length },
          { label: 'PERSONAS EST.', val: dayBookings.reduce((a, b) => a + (b.people||0), 0) },
          { label: 'INGRESO EST.', val: fmtMXN(dayRevenue) },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: 'var(--mt)', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
