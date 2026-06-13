import { useState, useEffect } from 'react'
import { fetchBookingsRange } from '../hooks/useBookings'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import OpenPlayRoomModal from '../components/OpenPlayRoomModal'
import {
  HOURS, SLOTS, COURTS, DAYS_ES, MONTHS_ES, OPENPLAY_HOURS,
  getWeekDays, ymd, todayStr, fmtMXN,
  toSlotIndex, durationSlots
} from '../lib/utils'

const TOUR_HOURS_SLOTS = 6

export default function Calendar() {
  const { profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(todayStr())
  const [courtFilter, setCourtFilter] = useState(0)
  const [bookings, setBookings] = useState([])
  const [tourBookings, setTourBookings] = useState([])
  const [drillBookings, setDrillBookings] = useState([])
  const [modal, setModal] = useState(null) // { hour, court } — inline form trigger
  const [detailModal, setDetailModal] = useState(null)
  const [openPlayModal, setOpenPlayModal] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [form, setForm] = useState({ name:'', city:'', modality:'privada', people:2, notes:'', startMin:0, endHour:0, endMin:0 })
  const [saving, setSaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [error, setError] = useState('')
  const [notif, setNotif] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const days = getWeekDays(weekOffset)

  async function reloadWeek(offset) {
    const currentDays = getWeekDays(offset ?? weekOffset)
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
  }

  useEffect(() => {
    reloadWeek(weekOffset)
    const channel = supabase.channel('cal-week-full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => reloadWeek(weekOffset))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_bookings' }, () => reloadWeek(weekOffset))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drills' }, () => reloadWeek(weekOffset))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [weekOffset])

  const tourBookingsNormalized = tourBookings.map(tb => ({
    ...tb, modality: 'tour', name: `🏓 Tour: ${tb.client_name}`, people: 1,
  }))

  const weekLabel = (() => {
    const f = days[0], l = days[6]
    return `${f.getDate()} ${MONTHS_ES[f.getMonth()]} — ${l.getDate()} ${MONTHS_ES[l.getMonth()]} ${l.getFullYear()}`
  })()

  const visibleCourts = courtFilter === 0 ? COURTS : [courtFilter]
  const today = todayStr()

  // Resuelve que ocupa un slot de 30min dado (slotIdx) en una cancha/dia.
  // Devuelve { item, kind, startSlot, spanSlots, isStart, isEnd } o null si esta libre.
  function getSlotOccupant(date, court, slotIdx) {
    for (const b of bookings) {
      if (b.date !== date || b.court !== court) continue
      const startSlot = toSlotIndex(b.hour, b.start_minute || 0)
      const spanSlots = durationSlots(b, 'booking')
      if (slotIdx >= startSlot && slotIdx < startSlot + spanSlots) {
        return { item: b, kind: 'booking', startSlot, spanSlots, isStart: slotIdx === startSlot, isEnd: slotIdx === startSlot + spanSlots - 1 }
      }
    }
    for (const b of tourBookings) {
      if (b.date !== date || b.court !== court) continue
      const startSlot = toSlotIndex(b.hour, 0)
      const spanSlots = TOUR_HOURS_SLOTS
      if (slotIdx >= startSlot && slotIdx < startSlot + spanSlots) {
        return { item: { ...b, name: b.client_name, modality: 'tour' }, kind: 'tour', startSlot, spanSlots, isStart: slotIdx === startSlot, isEnd: slotIdx === startSlot + spanSlots - 1 }
      }
    }
    for (const b of drillBookings) {
      if (b.date !== date || b.court !== court) continue
      const startSlot = toSlotIndex(b.hour, 0)
      const spanSlots = 2 // 1 hora
      if (slotIdx >= startSlot && slotIdx < startSlot + spanSlots) {
        return { item: { ...b, name: b.client_name, modality: 'drill' }, kind: 'drill', startSlot, spanSlots, isStart: slotIdx === startSlot, isEnd: slotIdx === startSlot + spanSlots - 1 }
      }
    }
    return null
  }

  function openDetail(booking, type) {
    if (type === 'booking' && booking.modality === 'openplay') {
      setOpenPlayModal(booking)
      return
    }
    setDetailModal({ booking, type })
    setEditMode(false)
    setEditForm({
      name:         booking.name || booking.client_name || '',
      city:         booking.city || booking.hotel || '',
      people:       booking.people || 1,
      gender_m:     booking.gender_m || 0,
      gender_f:     booking.gender_f || 0,
      gender_k:     booking.gender_k || 0,
      notes:        booking.notes || '',
      hour:         booking.start_minute === 30 ? booking.hour + 0.5 : booking.hour,
      court:        booking.court,
      client_phone: booking.client_phone || '',
      hotel:        booking.hotel || '',
      package:      booking.package || '',
      duration:     booking.duration || 1,
    })
  }

  async function saveEdit() {
    if (!detailModal) return
    setSavingEdit(true)
    const { booking, type } = detailModal

    if (type === 'booking') {
      const editHour   = Math.floor(parseFloat(editForm.hour))
      const editMinute = parseFloat(editForm.hour) % 1 === 0.5 ? 30 : 0
      const dur        = parseFloat(editForm.duration || 1)
      function calcRev(mins) {
        if (mins <= 60)  return 400
        if (mins <= 90)  return 600
        if (mins <= 120) return 750
        if (mins <= 150) return 950
        return 400 + Math.ceil((mins - 60) / 30) * 200
      }
      const revenue = calcRev(dur * 60)
      const people  = parseInt(editForm.gender_m||0) + parseInt(editForm.gender_f||0) + parseInt(editForm.gender_k||0) || parseInt(editForm.people)
      await supabase.from('bookings').update({
        name: editForm.name, city: editForm.city, people,
        gender_m: parseInt(editForm.gender_m || 0),
        gender_f: parseInt(editForm.gender_f || 0),
        gender_k: parseInt(editForm.gender_k || 0),
        notes: editForm.notes, hour: editHour, start_minute: editMinute,
        court: parseInt(editForm.court), duration: dur, revenue,
      }).eq('id', booking.id)
    } else if (type === 'tour') {
      await supabase.from('tour_bookings').update({
        client_name: editForm.name, client_phone: editForm.client_phone,
        hotel: editForm.hotel, hour: parseInt(editForm.hour),
        court: parseInt(editForm.court), notes: editForm.notes,
      }).eq('id', booking.id)
    } else if (type === 'drill') {
      await supabase.from('drills').update({
        client_name: editForm.name, client_phone: editForm.client_phone,
        hour: parseInt(editForm.hour), court: parseInt(editForm.court),
        notes: editForm.notes, people: parseInt(editForm.people),
      }).eq('id', booking.id)
    }

    await reloadWeek()
    setNotif('✅ Reserva actualizada')
    setDetailModal(null)
    setEditMode(false)
    setSavingEdit(false)
  }

  async function saveBooking() {
    if (!form.name.trim()) return setError('Ingresa el nombre')
    const { hour, court } = modal
    const startMin     = form.startMin || 0
    const endHour      = form.endHour  || hour + 1
    const endMin       = form.endMin   || 0
    const durationMins = (endHour * 60 + endMin) - (hour * 60 + startMin)

    if (durationMins <= 0) return setError('La hora de fin debe ser después de la hora de inicio')

    // Validacion exacta por slots de 30min (cubre reservas que empiezan/duran en medias horas)
    const newStartSlot = toSlotIndex(hour, startMin)
    const newSpanSlots = form.modality === 'openplay' ? OPENPLAY_HOURS * 2 : Math.round(durationMins / 30)
    for (let s = newStartSlot; s < newStartSlot + newSpanSlots; s++) {
      if (s >= SLOTS.length) return setError(`La reserva excede el horario disponible (hasta ${SLOTS[SLOTS.length - 1].hour}:${String(SLOTS[SLOTS.length - 1].minute).padStart(2,'0')})`)
      const occ = getSlotOccupant(selectedDay, court, s)
      if (occ) {
        const slot = SLOTS[s]
        return setError(`Conflicto en Cancha ${court} a las ${String(slot.hour).padStart(2,'0')}:${String(slot.minute).padStart(2,'0')}`)
      }
    }

    function calcRev(mod, mins, ppl) {
      if (mod === 'openplay') return 200 * ppl
      if (mins <= 60)  return 400
      if (mins <= 90)  return 600
      if (mins <= 120) return 750
      if (mins <= 150) return 950
      return 400 + Math.ceil((mins - 60) / 30) * 200
    }
    const revenue       = calcRev(form.modality, durationMins, form.people)
    const durationHours = durationMins / 60

    setSaving(true)
    const totalPeople = (form.gM||0) + (form.gF||0) + (form.gK||0) || form.people
    const { data, error } = await supabase.from('bookings').insert({
      date: selectedDay, hour, court, modality: form.modality,
      duration: durationHours, start_minute: startMin,
      name: form.name.trim(), city: form.city.trim() || null,
      people: totalPeople, gender_m: form.gM || 0, gender_f: form.gF || 0,
      gender_k: form.gK || 0, notes: form.notes.trim() || null,
      status: 'reserved', revenue, created_by: profile?.id
    }).select().single()

    if (error) { setError(error.message); setSaving(false); return }
    setBookings(prev => [...prev, data])
    setNotif(`Guardado — ${form.name} · Cancha ${court} · ${String(hour).padStart(2,'0')}:${String(startMin).padStart(2,'0')}–${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}`)
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

  const currentHour  = new Date().getHours()
  const upcomingAll  = [
    ...dayBookings.filter(b => b.date > today || (b.date === today && b.hour >= currentHour)).map(b => ({ ...b, _type: 'booking' })),
    ...dayTours.filter(b => b.date > today || (b.date === today && b.hour >= currentHour)).map(b => ({ ...b, _type: 'tour', name: b.client_name })),
    ...dayDrills.filter(b => b.date > today || (b.date === today && b.hour >= currentHour)).map(b => ({ ...b, _type: 'drill', name: b.client_name })),
  ].sort((a, b) => a.hour - b.hour)

  const typeColors = {
    booking: { bg: '#1a2e0d', border: 'var(--gd)', text: 'var(--g)', label: 'Cancha' },
    tour:    { bg: '#2e1a0d', border: '#8a4a1e',   text: '#e8a87c', label: 'Tour D&D' },
    drill:   { bg: '#1e1535', border: '#6b3fa0',   text: '#c8a8f0', label: 'Drill / Clase' },
  }

  // ── Inline form renderer ──────────────────────────────────────────────────
  function renderInlineForm(h, court, startMinute = 0) {
    const startTotalMins = h * 60 + (form.startMin ?? startMinute)
    const endTotalMins   = (form.endHour || h+1) * 60 + (form.endMin ?? 0)
    const durationMins   = endTotalMins - startTotalMins
    const durationHours  = durationMins / 60

    function calcRev(mod, durMins, ppl) {
      if (mod === 'openplay') return 200 * ppl
      if (durMins <= 60)  return 400
      if (durMins <= 90)  return 600
      if (durMins <= 120) return 750
      if (durMins <= 150) return 950
      return 400 + Math.ceil((durMins - 60) / 30) * 200
    }
    const revenue = calcRev(form.modality, durationMins, form.people)

    const halfHours = []
    for (let hh = h; hh <= 21; hh++) {
      for (let m of [0, 30]) {
        const totalM = hh * 60 + m
        if (totalM > startTotalMins && totalM <= 21 * 60) {
          halfHours.push({ h: hh, m, label: `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}` })
        }
      }
    }

    return (
      <div style={{
        position: 'relative', zIndex: 50,
        background: 'var(--cd)', border: '1px solid var(--gd)',
        borderRadius: 10, padding: 14, marginTop: 4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700 }}>
            Nueva reserva · Cancha {court} · {String(h).padStart(2,'0')}:{String(startMinute).padStart(2,'0')}
          </div>
          <button onClick={() => { setModal(null); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--mt)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="form-label">Hora inicio</label>
            <select className="form-select" value={`${h}:${form.startMin||0}`}
              onChange={e => {
                const [hv, mv] = e.target.value.split(':').map(Number)
                setForm(f => ({ ...f, startMin: mv, endHour: f.endHour || hv+1, endMin: f.endMin || 0 }))
              }}>
              <option value={`${h}:0`}>{String(h).padStart(2,'0')}:00</option>
              <option value={`${h}:30`}>{String(h).padStart(2,'0')}:30</option>
            </select>
          </div>
          <div>
            <label className="form-label">Hora fin</label>
            <select className="form-select" value={`${form.endHour || h+1}:${form.endMin || 0}`}
              onChange={e => {
                const [hv, mv] = e.target.value.split(':').map(Number)
                setForm(f => ({...f, endHour: hv, endMin: mv}))
              }}>
              {halfHours.map(({h: hv, m, label}) => (
                <option key={label} value={`${hv}:${m}`}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {durationMins > 0 && (
          <div style={{ background: 'var(--glight)', border: '1px solid var(--gd)', borderRadius: 6, padding: '6px 10px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--g)' }}>{durationMins} min</span>
            <span style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--g)' }}>${revenue} MXN</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="form-label">Modalidad</label>
            <select className="form-select" value={form.modality}
              onChange={e => setForm(f => ({...f, modality: e.target.value, endHour: e.target.value === 'openplay' ? h+3 : f.endHour, endMin: 0}))}>
              <option value="privada">Cancha privada</option>
              <option value="openplay">Open Play · $200/p · 3h</option>
            </select>
          </div>
          <div>
            <label className="form-label">Personas</label>
            <input className="form-input" type="number" min="1" max="12" value={form.people}
              onChange={e => setForm(f => ({...f, people: +e.target.value}))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Nombre del cliente" autoFocus />
          </div>
          <div>
            <label className="form-label">Ciudad</label>
            <input className="form-input" value={form.city}
              onChange={e => setForm(f => ({...f, city: e.target.value}))} placeholder="Cancún..." />
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label className="form-label">Personas (H/M/N)</label>
          <div style={{ display: 'flex', gap: 12, background: 'var(--sf)', borderRadius: 7, padding: '8px 10px' }}>
            {[['H','gM'],['M','gF'],['N','gK']].map(([lbl, key]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--mt)', minWidth: 12 }}>{lbl}</span>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={e => { e.stopPropagation(); setForm(f => ({...f, [key]: Math.max(0, (f[key]||0) - 1)})) }}>−</button>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{form[key] || 0}</span>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0 }}
                  onClick={e => { e.stopPropagation(); setForm(f => ({...f, [key]: (f[key]||0) + 1})) }}>+</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label className="form-label">Notas</label>
          <input className="form-input" value={form.notes}
            onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Cumpleaños, grupo especial..." />
        </div>

        {error && <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" onClick={saveBooking} disabled={saving}>{saving ? 'Guardando...' : 'Guardar reserva'}</button>
          <button className="btn btn-ghost" onClick={() => { setModal(null); setError('') }}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {notif && (
        <div onClick={() => setNotif('')} style={{ background: 'var(--glight)', border: '1px solid var(--gd)', color: 'var(--g)', borderRadius: 7, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
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
          const isToday  = ds === today
          const isActive = ds === selectedDay
          return (
            <div key={ds} onClick={() => setSelectedDay(ds)} style={{ flex: 1, background: isActive ? 'var(--g)' : 'var(--sf)', border: `1px solid ${isActive ? 'var(--g)' : isToday ? 'var(--am)' : 'var(--br)'}`, borderRadius: 8, padding: '7px 4px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: isActive ? '#0d1f00' : isToday ? 'var(--am)' : 'var(--mt)' }}>{DAYS_ES[d.getDay()]}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, color: isActive ? '#0d1f00' : 'var(--tx)' }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, color: isActive ? '#1a3d00' : 'var(--mt)' }}>{count ? `${count} res.` : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Court filter */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--mt)' }}>Ver:</span>
        {[0,1,2,3,4].map(n => (
          <button key={n} onClick={() => setCourtFilter(n)}
            style={{ fontFamily: 'var(--font-cond)', fontSize: 12, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--br)', cursor: 'pointer', background: courtFilter === n ? 'var(--bl)' : 'transparent', color: courtFilter === n ? '#fff' : 'var(--mt)', borderColor: courtFilter === n ? 'var(--bl)' : 'var(--br)' }}>
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
          <div key={c} style={{ flex: 1, fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 600, color: 'var(--mt)', textAlign: 'center', letterSpacing: '.05em' }}>Cancha {c}</div>
        ))}
      </div>

      {/* Timeline — grid unico con filas de 30min, las reservas ocupan varias filas */}
      {(() => {
        const ROW_H = 20 // alto de cada fila de 30min
        const isPastDay = selectedDay < today
        const nowH = new Date().getHours()
        const nowM = new Date().getMinutes()
        const nowSlot = toSlotIndex(nowH, nowM >= 30 ? 30 : 0)

        // Track de celdas ya "consumidas" por un span (para no re-renderizar continuaciones)
        const consumed = {} // `${court}-${slotIdx}` => true

        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `48px repeat(${visibleCourts.length}, 1fr)`,
            gridTemplateRows: `repeat(${SLOTS.length}, ${ROW_H}px)`,
            columnGap: 3,
          }}>
            {SLOTS.map((slot, slotIdx) => {
              const isHourMark = slot.minute === 0
              const isPastSlot = isPastDay || (selectedDay === today && slotIdx < nowSlot)
              return (
                <div key={`label-${slotIdx}`} style={{
                  gridColumn: 1, gridRow: slotIdx + 1,
                  fontSize: isHourMark ? 11 : 9,
                  color: isHourMark ? 'var(--mt)' : 'var(--br)',
                  textAlign: 'right', paddingRight: 8,
                  fontFamily: 'var(--font-cond)',
                  borderTop: isHourMark ? '1px solid var(--br)' : '1px dashed var(--br)',
                  borderTopColor: isHourMark ? 'var(--br)' : 'rgba(255,255,255,.06)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                  opacity: isHourMark ? 1 : 0.5,
                }}>
                  {isHourMark ? `${slot.hour}:00` : ''}
                </div>
              )
            })}

            {visibleCourts.map((court, ci) => (
              SLOTS.map((slot, slotIdx) => {
                const key = `${court}-${slotIdx}`
                if (consumed[key]) return null

                const isHourMark = slot.minute === 0
                const isPastSlot = isPastDay || (selectedDay === today && slotIdx < nowSlot)
                const occ = getSlotOccupant(selectedDay, court, slotIdx)
                const isModalOpen = modal && modal.court === court && modal.slotIdx === slotIdx

                const baseStyle = {
                  gridColumn: ci + 2,
                  borderTop: isHourMark ? '1px solid var(--br)' : '1px dashed rgba(255,255,255,.06)',
                }

                if (occ) {
                  // marca como consumidas todas las filas que ocupa este bloque
                  for (let s = occ.startSlot; s < occ.startSlot + occ.spanSlots; s++) consumed[`${court}-${s}`] = true
                  if (!occ.isStart) return null // las filas de continuacion no rendean nada (ya consumidas)

                  const { item, kind, spanSlots } = occ
                  const isOP    = kind === 'booking' && item.modality === 'openplay'
                  const isTour  = kind === 'tour'
                  const isDrill = kind === 'drill'
                  const colors = isTour
                    ? { bg: '#2e1a0d', border: '#8a4a1e', text: '#e8a87c' }
                    : isDrill
                    ? { bg: '#1e1535', border: '#6b3fa0', text: '#c8a8f0' }
                    : isOP
                    ? { bg: '#0d1e35', border: '#1e4a8a', text: '#7eb8f7' }
                    : { bg: isPastSlot ? '#1e1e1e' : '#1a2e0d', border: isPastSlot ? '#2a2a2a' : 'var(--gd)', text: 'var(--g)' }

                  let icon = ''
                  let line1 = item.name
                  let line2 = ''
                  if (isTour) { icon = '🏓 '; line2 = `${item.package} · ${item.hotel?.substring(0, 15) || ''}` }
                  else if (isDrill) { icon = '🎯 '; line2 = item.type === 'private' ? 'Privado' : 'Colectivo' }
                  else if (isOP) { icon = '👥 '; line2 = `${item.people}p · $${item.revenue} MXN` }
                  else {
                    const durLabel = spanSlots > 2 ? ` · ${spanSlots / 2}h` : ''
                    line2 = `${item.people}p${item.city ? ` · ${item.city}` : ''}${durLabel}`
                  }

                  return (
                    <div key={key}
                      onClick={() => openDetail(item, kind)}
                      style={{
                        ...baseStyle,
                        gridRow: `${occ.startSlot + 1} / span ${spanSlots}`,
                        background: colors.bg, border: `1px solid ${colors.border}`,
                        borderRadius: 5, padding: '4px 6px', overflow: 'hidden',
                        position: 'relative', cursor: 'pointer',
                        opacity: isPastSlot && kind === 'booking' && !isOP ? .6 : 1,
                      }}>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {icon}{line1}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--mt)' }}>{line2}</div>
                      {kind === 'booking' && !isPastSlot && (
                        confirmDelete === item.id ? (
                          <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2, background: 'var(--cd)', borderRadius: 4, padding: 2, zIndex: 10 }}>
                            <button onClick={e => { e.stopPropagation(); deleteBooking(item.id); setConfirmDelete(null) }}
                              style={{ background: 'var(--rd)', border: 'none', borderRadius: 3, padding: '1px 5px', color: '#fff', fontSize: 9, cursor: 'pointer' }}>✓</button>
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                              style={{ background: '#444', border: 'none', borderRadius: 3, padding: '1px 5px', color: '#fff', fontSize: 9, cursor: 'pointer' }}>✗</button>
                          </div>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); setConfirmDelete(item.id) }}
                            style={{ position: 'absolute', top: 3, right: 3, background: 'var(--rd)', border: 'none', borderRadius: 3, width: 14, height: 14, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        )
                      )}
                    </div>
                  )
                }

                if (isPastSlot) {
                  return <div key={key} style={{ ...baseStyle, gridRow: slotIdx + 1, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: isHourMark ? 5 : 0, opacity: .4 }} />
                }

                if (isModalOpen) {
                  return (
                    <div key={key} style={{ ...baseStyle, gridRow: `${slotIdx + 1} / span 1`, gridColumn: '2 / -1', zIndex: 50 }}>
                      {renderInlineForm(slot.hour, court, slot.minute)}
                    </div>
                  )
                }

                return (
                  <div key={key}
                    onClick={() => {
                      setModal({ hour: slot.hour, minute: slot.minute, court, slotIdx })
                      setForm({ name:'', city:'', modality:'privada', people:2, gM:0, gF:0, gK:0, notes:'', startMin: slot.minute, endHour: slot.minute === 30 ? slot.hour + 1 : slot.hour, endMin: slot.minute === 30 ? 0 : 30 })
                      setError('')
                    }}
                    style={{ ...baseStyle, gridRow: slotIdx + 1, background: 'var(--sf)', borderLeft: '1px solid var(--br)', borderRight: '1px solid var(--br)', borderBottom: slotIdx === SLOTS.length - 1 ? '1px solid var(--br)' : 'none', borderRadius: isHourMark ? '5px 5px 0 0' : 0, cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1e2a14' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--sf)' }}
                  />
                )
              })
            ))}
          </div>
        )
      })()}

      {/* DETAIL MODAL — tours, drills y privadas */}
      {detailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setDetailModal(null); setEditMode(false) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cd)', border: `1px solid ${typeColors[detailModal.type]?.border || 'var(--br)'}`, borderRadius: 12, padding: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: typeColors[detailModal.type]?.bg, color: typeColors[detailModal.type]?.text, letterSpacing: '.04em' }}>
                  {typeColors[detailModal.type]?.label?.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700 }}>
                  {detailModal.type === 'booking' ? detailModal.booking.name : detailModal.booking.client_name}
                </div>
              </div>
              <button onClick={() => { setDetailModal(null); setEditMode(false) }} style={{ background: 'none', border: 'none', color: 'var(--mt)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {!editMode ? (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Fecha',     val: detailModal.booking.date },
                    { label: 'Hora',      val: (() => {
                      const b = detailModal.booking
                      const startMin = b.start_minute || 0
                      const startStr = `${String(b.hour).padStart(2,'0')}:${String(startMin).padStart(2,'0')}`
                      const durH = detailModal.type === 'tour' ? 3 : detailModal.type === 'drill' ? 1 : (b.duration || 1)
                      const totalMins = b.hour * 60 + startMin + durH * 60
                      const endH = Math.floor(totalMins / 60)
                      const endM = totalMins % 60
                      return `${startStr} — ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
                    })() },
                    { label: 'Cancha',    val: `Cancha ${detailModal.booking.court}` },
                    detailModal.type === 'booking' && { label: 'Modalidad', val: detailModal.booking.modality === 'privada' ? 'Cancha privada' : 'Open Play' },
                    detailModal.type === 'booking' && { label: 'Personas',  val: detailModal.booking.people },
                    detailModal.type === 'booking' && { label: 'Ciudad',    val: detailModal.booking.city || '—' },
                    detailModal.type === 'tour' && { label: 'Teléfono',   val: detailModal.booking.client_phone || '—' },
                    detailModal.type === 'tour' && { label: 'Hotel',       val: detailModal.booking.hotel || '—' },
                    detailModal.type === 'tour' && { label: 'Pickup time', val: detailModal.booking.pickup_time || '—' },
                    detailModal.type === 'tour' && { label: 'Paquete',     val: detailModal.booking.package || '—' },
                    detailModal.type === 'tour' && { label: 'Total',       val: `$${detailModal.booking.total_mxn || 0} MXN / $${detailModal.booking.total_usd || 0} USD` },
                    detailModal.type === 'tour' && { label: 'Depósito',    val: `$${detailModal.booking.deposit_mxn || 0} MXN` },
                    detailModal.type === 'drill' && { label: 'Tipo',       val: detailModal.booking.type === 'private' ? 'Privado' : 'Colectivo' },
                    detailModal.type === 'drill' && { label: 'Personas',   val: detailModal.booking.people },
                    detailModal.type === 'drill' && { label: 'Teléfono',   val: detailModal.booking.client_phone || '—' },
                    detailModal.type === 'drill' && { label: 'Paquete',    val: detailModal.booking.package_type || 'Clase suelta' },
                    { label: 'Notas',     val: detailModal.booking.notes || '—' },
                    { label: 'Status',    val: detailModal.booking.status || '—' },
                  ].filter(Boolean).map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--br)' }}>
                      <span style={{ fontSize: 12, color: 'var(--mt)', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--tx)', textAlign: 'right', maxWidth: '60%' }}>{row.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green btn-sm" onClick={() => setEditMode(true)} style={{ flex: 1, justifyContent: 'center' }}>✏️ Editar</button>
                  {detailModal.type === 'booking' && (
                    confirmDelete === detailModal.booking.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--rd)' }}>¿Confirmar?</span>
                        <button className="btn btn-red btn-sm" onClick={() => { deleteBooking(detailModal.booking.id); setConfirmDelete(null) }}>Sí, eliminar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(detailModal.booking.id)} style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}>🗑 Eliminar</button>
                    )
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setDetailModal(null); setEditMode(false) }}>Cerrar</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{detailModal.type === 'booking' ? 'Nombre' : 'Nombre del cliente'}</label>
                    <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
                  </div>
                  {detailModal.type === 'tour' && (
                    <>
                      <div className="form-group"><label className="form-label">Teléfono</label><input className="form-input" value={editForm.client_phone} onChange={e => setEditForm(f => ({...f, client_phone: e.target.value}))} /></div>
                      <div className="form-group"><label className="form-label">Hotel / Pickup</label><input className="form-input" value={editForm.hotel} onChange={e => setEditForm(f => ({...f, hotel: e.target.value}))} /></div>
                    </>
                  )}
                  {detailModal.type === 'booking' && (
                    <>
                      <div className="form-group"><label className="form-label">Ciudad</label><input className="form-input" value={editForm.city} onChange={e => setEditForm(f => ({...f, city: e.target.value}))} /></div>
                      <div className="form-group">
                        <label className="form-label">Personas que ingresan</label>
                        <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '8px 12px', marginTop: 4 }}>
                          {[['Hombres','gender_m'],['Mujeres','gender_f'],['Niños','gender_k']].map(([lbl,key]) => (
                            <div key={key} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                              <div style={{ fontSize:12, color:'var(--mt)', minWidth:56 }}>{lbl}</div>
                              <button type="button" className="btn btn-ghost btn-sm" style={{ width:26,height:26,padding:0,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={() => setEditForm(f => ({...f, [key]: Math.max(0,(f[key]||0)-1)}))}>−</button>
                              <div style={{ fontFamily:'var(--font-cond)',fontSize:16,fontWeight:700,minWidth:20,textAlign:'center' }}>{editForm[key] || 0}</div>
                              <button type="button" className="btn btn-ghost btn-sm" style={{ width:26,height:26,padding:0,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={() => setEditForm(f => ({...f, [key]: (f[key]||0)+1}))}>+</button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Duración</label>
                        <select className="form-select" value={editForm.duration || 1} onChange={e => setEditForm(f => ({...f, duration: +e.target.value}))}>
                          <option value={1}>1 hora · $400</option>
                          <option value={1.5}>1.5 horas · $600</option>
                          <option value={2}>2 horas · $750</option>
                          <option value={2.5}>2.5 horas · $950</option>
                        </select>
                      </div>
                    </>
                  )}
                  {detailModal.type === 'drill' && (
                    <>
                      <div className="form-group"><label className="form-label">Teléfono</label><input className="form-input" value={editForm.client_phone} onChange={e => setEditForm(f => ({...f, client_phone: e.target.value}))} /></div>
                      <div className="form-group"><label className="form-label">Personas</label><input className="form-input" type="number" min="1" max="4" value={editForm.people} onChange={e => setEditForm(f => ({...f, people: e.target.value}))} /></div>
                    </>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Hora</label>
                      <select className="form-select" value={editForm.hour} onChange={e => setEditForm(f => ({...f, hour: e.target.value}))}>
                        {HOURS.flatMap(hh => [<option key={hh} value={hh}>{hh}:00</option>, <option key={hh+0.5} value={hh+0.5}>{hh}:30</option>])}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cancha</label>
                      <select className="form-select" value={editForm.court} onChange={e => setEditForm(f => ({...f, court: e.target.value}))}>
                        {[1,2,3,4].map(c => <option key={c} value={c}>Cancha {c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group"><label className="form-label">Notas</label><input className="form-input" value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} placeholder="Notas..." /></div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-green btn-sm" onClick={saveEdit} disabled={savingEdit} style={{ flex: 1, justifyContent: 'center' }}>{savingEdit ? 'Guardando...' : '✅ Guardar cambios'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OPEN PLAY ROOM MODAL */}
      {openPlayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setOpenPlayModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500 }}>
            <OpenPlayRoomModal
              booking={openPlayModal}
              onUpdate={async (id, updates) => {
                const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select().single()
                if (!error) { setBookings(prev => prev.map(b => b.id === id ? data : b)); setOpenPlayModal(prev => ({ ...prev, ...updates })); setNotif('Sala actualizada') }
                return { data, error }
              }}
              onStartPlay={async (id) => {
                const updates = { status: 'playing', started_at: new Date().toISOString() }
                const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select().single()
                if (!error) { setBookings(prev => prev.map(b => b.id === id ? data : b)); setOpenPlayModal(prev => ({ ...prev, ...updates })); setNotif('¡Sala en juego! Base congelada') }
                return { data, error }
              }}
              onFinish={async (id) => {
                const updates = { status: 'finished', finished_at: new Date().toISOString() }
                const { data, error } = await supabase.from('bookings').update(updates).eq('id', id).select().single()
                if (!error) { setBookings(prev => prev.map(b => b.id === id ? data : b)); setNotif('Sala cerrada — revenue sumado al reporte'); setOpenPlayModal(null) }
                return { data, error }
              }}
              onClose={() => setOpenPlayModal(null)}
              onDelete={async (id) => {
                if (confirmDelete === id) {
                  await supabase.from('bookings').delete().eq('id', id)
                  const b = bookings.find(x => x.id === id)
                  setBookings(prev => prev.filter(x => x.id !== id))
                  setNotif(`Sala eliminada — ${b?.name}`)
                  setOpenPlayModal(null)
                  setConfirmDelete(null)
                } else {
                  setConfirmDelete(id)
                }
              }}
              confirmDelete={confirmDelete}
              onCancelDelete={() => setConfirmDelete(null)}
            />
          </div>
        </div>
      )}

      {/* Day summary */}
      <div className="card" style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'RESERVAS',      val: dayBookings.length + dayTours.length + dayDrills.length },
          { label: 'PRIVADAS',      val: dayBookings.filter(b => b.modality === 'privada').length },
          { label: 'OPEN PLAY',     val: dayBookings.filter(b => b.modality === 'openplay').length },
          { label: 'TOURS D&D',     val: dayTours.length },
          { label: 'DRILLS',        val: dayDrills.length },
          { label: 'PERSONAS EST.', val: dayBookings.reduce((a, b) => a + (b.people||0), 0) },
          { label: 'INGRESO EST.',  val: fmtMXN(dayRevenue) },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 10, color: 'var(--mt)', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Upcoming bookings */}
      {upcomingAll.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, color: 'var(--mt)', letterSpacing: '.05em', marginBottom: 8 }}>
            PRÓXIMAS RESERVAS — {selectedDay === today ? 'HOY' : selectedDay}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcomingAll.map((b) => {
              const tc = typeColors[b._type] || typeColors.booking
              return (
                <div key={`${b._type}-${b.id}`}
                  onClick={() => openDetail(b, b._type)}
                  style={{ background: 'var(--cd)', border: `1px solid var(--br)`, borderLeft: `3px solid ${tc.text}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = tc.text}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--br)'}
                >
                  <div style={{ minWidth: 44, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 800, color: tc.text }}>{String(b.hour).padStart(2,'0')}</div>
                    <div style={{ fontSize: 9, color: 'var(--mt)' }}>:00</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b._type === 'booking' && b.modality === 'openplay' ? `👥 ${b.name}` : b.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mt)' }}>
                      Cancha {b.court} · {b._type === 'booking' && b.modality === 'openplay' ? `Open Play · ${b.people}p · $${b.revenue} MXN` : tc.label}
                      {b._type === 'booking' && b.modality !== 'openplay' && ` · ${b.people}p · ${b.city || ''}`}
                      {b._type === 'tour' && ` · ${b.package} · ${b.hotel?.substring(0,20) || ''}`}
                      {b._type === 'drill' && ` · ${b.type === 'private' ? 'Privado' : 'Colectivo'}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mt)', flexShrink: 0 }}>
                    {b._type === 'booking' && b.modality === 'openplay' ? '👥 Ver sala' : '✏️ Ver / Editar'}
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
