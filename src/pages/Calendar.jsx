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
  const [detailModal, setDetailModal] = useState(null) // { booking, type }
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [form, setForm] = useState({ name:'', city:'', modality:'privada', people:2, notes:'', duration:1 })
  const [saving, setSaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [error, setError] = useState('')
  const [notif, setNotif] = useState('')

  const days = getWeekDays(weekOffset)

  useEffect(() => {
    const currentDays = getWeekDays(weekOffset)
    const from = ymd(currentDays[0])
    const to   = ymd(currentDays[6])

    async function loadAll() {
      const [b, t, d] = await Promise.all([
        fetchBookingsRange(from, to),
        supabase.from('tour_bookings').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
        supabase.from('drills').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
      ])
      setBookings(b.data || [])
      setTourBookings(t.data || [])
      setDrillBookings(d.data || [])
    }

    loadAll()

    const channel = supabase.channel('cal-week-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_bookings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drills' }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [weekOffset])

  const tourBookingsNormalized = tourBookings.map(tb => ({
    ...tb, modality: 'tour', name: `🏓 Tour: ${tb.client_name}`, people: 1,
  }))
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

  // Open detail modal
  function openDetail(booking, type) {
    setDetailModal({ booking, type })
    setEditMode(false)
    setEditForm({
      name: booking.name || booking.client_name || '',
      city: booking.city || booking.hotel || '',
      people: booking.people || 1,
      notes: booking.notes || '',
      hour: booking.hour,
      court: booking.court,
      client_phone: booking.client_phone || '',
      hotel: booking.hotel || '',
      package: booking.package || '',
    })
  }

  // Save edit
  async function saveEdit() {
    if (!detailModal) return
    setSavingEdit(true)
    const { booking, type } = detailModal

    if (type === 'booking') {
      await supabase.from('bookings').update({
        name: editForm.name,
        city: editForm.city,
        people: parseInt(editForm.people),
        notes: editForm.notes,
        hour: parseInt(editForm.hour),
        court: parseInt(editForm.court),
      }).eq('id', booking.id)
    } else if (type === 'tour') {
      await supabase.from('tour_bookings').update({
        client_name: editForm.name,
        client_phone: editForm.client_phone,
        hotel: editForm.hotel,
        hour: parseInt(editForm.hour),
        court: parseInt(editForm.court),
        notes: editForm.notes,
      }).eq('id', booking.id)
    } else if (type === 'drill') {
      await supabase.from('drills').update({
        client_name: editForm.name,
        client_phone: editForm.client_phone,
        hour: parseInt(editForm.hour),
        court: parseInt(editForm.court),
        notes: editForm.notes,
        people: parseInt(editForm.people),
      }).eq('id', booking.id)
    }

    // Reload
    const currentDays = getWeekDays(weekOffset)
    const from = ymd(currentDays[0])
    const to   = ymd(currentDays[6])
    const [b, t, d] = await Promise.all([
      fetchBookingsRange(from, to),
      supabase.from('tour_bookings').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
      supabase.from('drills').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
    ])
    setBookings(b.data || [])
    setTourBookings(t.data || [])
    setDrillBookings(d.data || [])

    setNotif('✅ Reserva actualizada')
    setDetailModal(null)
    setEditMode(false)
    setSavingEdit(false)
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
    e?.stopPropagation()
    const b = bookings.find(x => x.id === id)
    await supabase.from('bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(x => x.id !== id))
    setNotif(`Eliminada — ${b?.name}`)
    setDetailModal(null)
  }

  const dayBookings  = bookings.filter(b => b.date === selectedDay)
  const dayTours     = tourBookings.filter(b => b.date === selectedDay)
  const dayDrills    = drillBookings.filter(b => b.date === selectedDay)
  const dayRevenue   = dayBookings.reduce((a, b) => a + Number(b.revenue || 0), 0)

  // Upcoming bookings for selected day (future hours only)
  const currentHour  = new Date().getHours()
  const upcomingAll  = [
    ...dayBookings.filter(b => b.date > today || (b.date === today && b.hour >= currentHour))
      .map(b => ({ ...b, _type: 'booking' })),
    ...dayTours.filter(b => b.date > today || (b.date === today && b.hour >= currentHour))
      .map(b => ({ ...b, _type: 'tour', name: b.client_name })),
    ...dayDrills.filter(b => b.date > today || (b.date === today && b.hour >= currentHour))
      .map(b => ({ ...b, _type: 'drill', name: b.client_name })),
  ].sort((a, b) => a.hour - b.hour)

  const typeColors = {
    booking: { bg: '#1a2e0d', border: 'var(--gd)', text: 'var(--g)', label: 'Cancha' },
    tour:    { bg: '#2e1a0d', border: '#8a4a1e',   text: '#e8a87c', label: 'Tour D&D' },
    drill:   { bg: '#1e1535', border: '#6b3fa0',   text: '#c8a8f0', label: 'Drill' },
  }

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
          const count = bookings.filter(b => b.date === ds).length + tourBookings.filter(b => b.date === ds).length + drillBookings.filter(b => b.date === ds).length
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
                  const booking     = bookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  const tourBooking = tourBookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  const drillBooking = drillBookings.find(b => b.date === selectedDay && b.court === court && b.hour === h)
                  const blocker     = !booking && !tourBooking && !drillBooking ? isSlotBlockedAll(selectedDay, court, h) : null
                  const isOPContinuation   = blocker && blocker.modality === 'openplay' && blocker.hour !== h
                  const isTourContinuation = blocker && blocker.type === 'tour' && blocker.hour !== h

                  // Tour booking start
                  if (tourBooking) {
                    return (
                      <div key={court} onClick={() => openDetail(tourBooking, 'tour')} style={{
                        background: '#2e1a0d', border: '1px solid #8a4a1e',
                        borderRadius: '5px 5px 0 0', borderBottom: 'none',
                        padding: '4px 6px', overflow: 'hidden', cursor: 'pointer',
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
                  if (drillBooking) {
                    return (
                      <div key={court} onClick={() => openDetail(drillBooking, 'drill')} style={{
                        background: '#1e1535', border: '1px solid #6b3fa0',
                        borderRadius: 5, padding: '4px 6px', overflow: 'hidden', cursor: 'pointer',
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
                      <div key={court} onClick={() => openDetail(booking, 'booking')} style={{
                        background: isOP ? '#0d1e35' : isPastHour ? '#1e1e1e' : '#1a2e0d',
                        border: `1px solid ${isOP ? '#1e4a8a' : isPastHour ? '#2a2a2a' : 'var(--gd)'}`,
                        borderRadius: isOP ? '5px 5px 0 0' : 5,
                        borderBottom: isOP ? 'none' : undefined,
                        padding: '4px 6px', position: 'relative', overflow: 'hidden',
                        opacity: isPastHour && !isOP ? .6 : 1, cursor: 'pointer',
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
                      onClick={() => { setModal({ hour: h, court }); setForm({ name:'', city:'', modality:'privada', people:2, notes:'', duration:1 }); setError('') }}
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

      {/* DETAIL MODAL */}
      {detailModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }} onClick={() => { setDetailModal(null); setEditMode(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--cd)', border: `1px solid ${typeColors[detailModal.type]?.border || 'var(--br)'}`,
            borderRadius: 12, padding: 20, width: '100%', maxWidth: 480,
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                  background: typeColors[detailModal.type]?.bg,
                  color: typeColors[detailModal.type]?.text,
                  letterSpacing: '.04em'
                }}>
                  {typeColors[detailModal.type]?.label?.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700 }}>
                  {detailModal.type === 'booking' ? detailModal.booking.name :
                   detailModal.type === 'tour' ? detailModal.booking.client_name :
                   detailModal.booking.client_name}
                </div>
              </div>
              <button onClick={() => { setDetailModal(null); setEditMode(false) }}
                style={{ background: 'none', border: 'none', color: 'var(--mt)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {!editMode ? (
              /* VIEW MODE */
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Fecha', val: detailModal.booking.date },
                    { label: 'Hora', val: `${String(detailModal.booking.hour).padStart(2,'0')}:00 — ${String(detailModal.booking.hour + (detailModal.type === 'tour' ? 3 : detailModal.type === 'drill' ? 1 : detailModal.booking.duration || 1)).padStart(2,'0')}:00` },
                    { label: 'Cancha', val: `Cancha ${detailModal.booking.court}` },
                    detailModal.type === 'booking' && { label: 'Modalidad', val: detailModal.booking.modality === 'privada' ? 'Cancha privada' : 'Open Play' },
                    detailModal.type === 'booking' && { label: 'Personas', val: detailModal.booking.people },
                    detailModal.type === 'booking' && { label: 'Ciudad', val: detailModal.booking.city || '—' },
                    detailModal.type === 'tour' && { label: 'Teléfono', val: detailModal.booking.client_phone || '—' },
                    detailModal.type === 'tour' && { label: 'Hotel / Pickup', val: detailModal.booking.hotel || '—' },
                    detailModal.type === 'tour' && { label: 'Pickup time', val: detailModal.booking.pickup_time || '—' },
                    detailModal.type === 'tour' && { label: 'Paquete', val: detailModal.booking.package || '—' },
                    detailModal.type === 'tour' && { label: 'Total', val: `$${detailModal.booking.total_mxn || 0} MXN / $${detailModal.booking.total_usd || 0} USD` },
                    detailModal.type === 'tour' && { label: 'Depósito', val: `$${detailModal.booking.deposit_mxn || 0} MXN` },
                    detailModal.type === 'drill' && { label: 'Tipo', val: detailModal.booking.type === 'private' ? 'Privado' : 'Colectivo' },
                    detailModal.type === 'drill' && { label: 'Personas', val: detailModal.booking.people },
                    detailModal.type === 'drill' && { label: 'Teléfono', val: detailModal.booking.client_phone || '—' },
                    detailModal.type === 'drill' && { label: 'Paquete', val: detailModal.booking.package_type || 'Clase suelta' },
                    { label: 'Notas', val: detailModal.booking.notes || '—' },
                    { label: 'Status', val: detailModal.booking.status || '—' },
                  ].filter(Boolean).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--br)' }}>
                      <span style={{ fontSize: 12, color: 'var(--mt)', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--tx)', textAlign: 'right', maxWidth: '60%' }}>{row.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green btn-sm" onClick={() => setEditMode(true)} style={{ flex: 1, justifyContent: 'center' }}>
                    ✏️ Editar
                  </button>
                  {detailModal.type === 'booking' && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => deleteBooking(detailModal.booking.id)}
                      style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}>
                      🗑 Eliminar
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setDetailModal(null); setEditMode(false) }}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* EDIT MODE */
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{detailModal.type === 'booking' ? 'Nombre' : 'Nombre del cliente'}</label>
                    <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
                  </div>
                  {detailModal.type === 'tour' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Teléfono</label>
                        <input className="form-input" value={editForm.client_phone} onChange={e => setEditForm(f => ({...f, client_phone: e.target.value}))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hotel / Pickup</label>
                        <input className="form-input" value={editForm.hotel} onChange={e => setEditForm(f => ({...f, hotel: e.target.value}))} />
                      </div>
                    </>
                  )}
                  {detailModal.type === 'booking' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Ciudad</label>
                        <input className="form-input" value={editForm.city} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Personas</label>
                        <input className="form-input" type="number" min="1" max="20" value={editForm.people} onChange={e => setEditForm(f => ({...f, people: e.target.value}))} />
                      </div>
                    </>
                  )}
                  {detailModal.type === 'drill' && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Teléfono</label>
                        <input className="form-input" value={editForm.client_phone} onChange={e => setEditForm(f => ({...f, client_phone: e.target.value}))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Personas</label>
                        <input className="form-input" type="number" min="1" max="4" value={editForm.people} onChange={e => setEditForm(f => ({...f, people: e.target.value}))} />
                      </div>
                    </>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Hora</label>
                      <select className="form-select" value={editForm.hour} onChange={e => setEditForm(f => ({...f, hour: e.target.value}))}>
                        {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cancha</label>
                      <select className="form-select" value={editForm.court} onChange={e => setEditForm(f => ({...f, court: e.target.value}))}>
                        {[1,2,3,4].map(c => <option key={c} value={c}>Cancha {c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notas</label>
                    <input className="form-input" value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} placeholder="Notas..." />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green btn-sm" onClick={saveEdit} disabled={savingEdit} style={{ flex: 1, justifyContent: 'center' }}>
                    {savingEdit ? 'Guardando...' : '✅ Guardar cambios'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Day summary */}
      <div className="card" style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'RESERVAS', val: dayBookings.length + dayTours.length + dayDrills.length },
          { label: 'PRIVADAS', val: dayBookings.filter(b => b.modality === 'privada').length },
          { label: 'OPEN PLAY', val: dayBookings.filter(b => b.modality === 'openplay').length },
          { label: 'TOURS D&D', val: dayTours.length },
          { label: 'DRILLS', val: dayDrills.length },
          { label: 'PERSONAS EST.', val: dayBookings.reduce((a, b) => a + (b.people||0), 0) },
          { label: 'INGRESO EST.', val: fmtMXN(dayRevenue) },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: 'var(--mt)', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* UPCOMING BOOKINGS LIST */}
      {upcomingAll.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, color: 'var(--mt)', letterSpacing: '.05em', marginBottom: 8 }}>
            PRÓXIMAS RESERVAS — {selectedDay === today ? 'HOY' : selectedDay}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcomingAll.map((b, i) => {
              const tc = typeColors[b._type] || typeColors.booking
              return (
                <div key={`${b._type}-${b.id}`}
                  onClick={() => openDetail(b, b._type)}
                  style={{
                    background: 'var(--cd)', border: `1px solid var(--br)`,
                    borderLeft: `3px solid ${tc.text}`,
                    borderRadius: 8, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = tc.text}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--br)'}
                >
                  <div style={{ minWidth: 44, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 800, color: tc.text }}>
                      {String(b.hour).padStart(2,'0')}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--mt)' }}>:00</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mt)' }}>
                      Cancha {b.court} · {tc.label}
                      {b._type === 'booking' && ` · ${b.people}p · ${b.city || ''}`}
                      {b._type === 'tour' && ` · ${b.package} · ${b.hotel?.substring(0,20) || ''}`}
                      {b._type === 'drill' && ` · ${b.type === 'private' ? 'Privado' : 'Colectivo'}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mt)', flexShrink: 0 }}>
                    ✏️ Ver / Editar
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
