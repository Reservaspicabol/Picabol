import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { todayStr, ymd, getWeekDays, DAYS_ES, MONTHS_ES } from '../lib/utils'

// Drill schedule by day of week (0=Sun,1=Mon,...,6=Sat)
const DRILL_SLOTS = {
  1: [{ hour: 8, label: '8:00–9:00' }],                          // Monday
  2: [{ hour: 7, label: '7:00–8:00' }, { hour: 8, label: '8:00–9:00' }], // Tuesday
  3: [{ hour: 8, label: '8:00–9:00' }],                          // Wednesday
  4: [{ hour: 7, label: '7:00–8:00' }, { hour: 8, label: '8:00–9:00' }], // Thursday
  6: [{ hour: 7, label: '7:00–8:00' }, { hour: 8, label: '8:00–9:00' }], // Saturday
}

const PRIVATE_PRICES = { 1: 800, 2: 800, 3: 1000, 4: 1200 }
const COLLECTIVE_PRICES = { single: 250, pack8: 1600, pack12: 2100 }
const PREFERRED_COURTS = [1, 3, 2, 4]

function fmtMXN(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) }
function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : '—' }

export default function Drills() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('reservas')
  const [drills, setDrills] = useState([])
  const [allBookings, setAllBookings] = useState([])
  const [allTours, setAllTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [drillType, setDrillType] = useState('private') // private | collective
  const [form, setForm] = useState({
    date: '', hour: '', people: 1, clientName: '', clientPhone: '', notes: '',
    packageType: 'single', // for collective: single | pack8 | pack12
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])

  // Filters
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    loadAll()
    const channel = supabase.channel('drills-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drills' }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadAll() {
    const [d, b, t] = await Promise.all([
      supabase.from('drills').select('*').order('date', { ascending: false }).order('hour'),
      supabase.from('bookings').select('date, hour, court, modality').gte('date', todayStr()),
      supabase.from('tour_bookings').select('date, hour, court').gte('date', todayStr()).neq('status', 'cancelled'),
    ])
    setDrills(d.data || [])
    setAllBookings(b.data || [])
    setAllTours(t.data || [])
    setLoading(false)
  }

  function notify(msg) { setNotif(msg); setTimeout(() => setNotif(''), 3500) }

  function getSlotsForDate(dateStr) {
    if (!dateStr) return []
    const d = new Date(dateStr + 'T12:00:00')
    const dow = d.getDay()
    return DRILL_SLOTS[dow] || []
  }

  function isSlotAvailable(dateStr, hour) {
    // Check existing drills
    if (drills.some(d => d.date === dateStr && d.hour === hour && d.status !== 'cancelled')) return false
    // Check bookings (drills take 1 hour)
    if (allBookings.some(b => b.date === dateStr && b.hour === hour)) return false
    // Check tours (tours take 3 hours)
    if (allTours.some(t => t.date === dateStr && hour >= t.hour && hour < t.hour + 3)) return false
    return true
  }

  function findAvailableCourt(dateStr, hour) {
    for (const court of PREFERRED_COURTS) {
      const courtBusy = [
        ...allBookings.filter(b => b.date === dateStr && b.hour === hour && b.court === court),
        ...allTours.filter(t => t.date === dateStr && t.court === court && hour >= t.hour && hour < t.hour + 3),
        ...drills.filter(d => d.date === dateStr && d.hour === hour && d.court === court && d.status !== 'cancelled'),
      ]
      if (courtBusy.length === 0) return court
    }
    return null
  }

  function handleDateChange(dateStr) {
    const slots = getSlotsForDate(dateStr)
    setForm(f => ({ ...f, date: dateStr, hour: '' }))
    setAvailableSlots(slots)
  }

  function getPrice() {
    if (drillType === 'private') return PRIVATE_PRICES[Math.min(form.people, 4)] || 800
    return COLLECTIVE_PRICES[form.packageType] || 250
  }

  async function saveDrill() {
    if (!form.date || !form.hour) return setFormError('Selecciona fecha y horario')
    if (!form.clientName.trim()) return setFormError('Ingresa el nombre del cliente')
    if (!isSlotAvailable(form.date, parseInt(form.hour))) return setFormError('Este horario no está disponible')
    const court = findAvailableCourt(form.date, parseInt(form.hour))
    if (!court) return setFormError('No hay canchas disponibles para ese horario')

    setSaving(true)
    setFormError('')

    const classesRemaining = form.packageType === 'pack8' ? 8 : form.packageType === 'pack12' ? 12 : null

    const { error } = await supabase.from('drills').insert({
      date: form.date,
      hour: parseInt(form.hour),
      court,
      type: drillType,
      people: drillType === 'private' ? parseInt(form.people) : 1,
      client_name: form.clientName.trim(),
      client_phone: form.clientPhone.trim() || null,
      notes: form.notes.trim() || null,
      package_type: drillType === 'collective' ? form.packageType : null,
      classes_remaining: classesRemaining,
      total_mxn: getPrice(),
      status: 'reserved',
      created_by: profile?.id,
    })

    if (error) { setFormError(error.message); setSaving(false); return }
    notify('✅ Drill agendado correctamente')
    setForm({ date: '', hour: '', people: 1, clientName: '', clientPhone: '', notes: '', packageType: 'single' })
    setShowForm(false)
    loadAll()
    setSaving(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('drills').update({ status }).eq('id', id)
    if (status === 'confirmed') notify('✅ Drill confirmado')
    if (status === 'cancelled') notify('❌ Drill cancelado')
    setDrills(prev => prev.map(d => d.id === id ? { ...d, status } : d))
  }

  async function deductClass(id) {
    const drill = drills.find(d => d.id === id)
    if (!drill || drill.classes_remaining <= 0) return
    const newRemaining = drill.classes_remaining - 1
    await supabase.from('drills').update({ classes_remaining: newRemaining }).eq('id', id)
    setDrills(prev => prev.map(d => d.id === id ? { ...d, classes_remaining: newRemaining } : d))
    notify(`📚 Clase descontada — quedan ${newRemaining} clases`)
  }

  async function deleteDrill(id) {
    if (!window.confirm('¿Eliminar este drill del panel?')) return
    await supabase.from('drills').delete().eq('id', id)
    setDrills(prev => prev.filter(d => d.id !== id))
    notify('🗑 Drill eliminado')
  }

  // Filtered
  const filtered = drills.filter(d => {
    if (filterType !== 'all' && d.type !== filterType) return false
    if (filterStatus !== 'all' && d.status !== filterStatus) return false
    return true
  })

  // Metrics
  const active = drills.filter(d => d.status !== 'cancelled')
  const totalRevMXN = active.reduce((s, d) => s + Number(d.total_mxn || 0), 0)
  const privateCount = active.filter(d => d.type === 'private').length
  const collectiveCount = active.filter(d => d.type === 'collective').length
  const packClients = drills.filter(d => d.package_type && d.package_type !== 'single' && d.status !== 'cancelled')

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, color: 'var(--mt)' }}>Cargando Drills…</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 28, fontWeight: 800, color: 'var(--tx)', letterSpacing: 1 }}>
          DRILLS <span style={{ color: 'var(--g)' }}>·</span> CLASES
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>Clases privadas y colectivas de Pickleball</div>
      </div>

      {notif && (
        <div onClick={() => setNotif('')} style={{
          background: 'var(--glight)', border: '1px solid var(--gd)', color: 'var(--g)',
          borderRadius: 7, padding: '8px 12px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer'
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--g)' }} />
          {notif}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'TOTAL DRILLS', val: active.length },
          { label: 'PRIVADOS', val: privateCount },
          { label: 'COLECTIVOS', val: collectiveCount },
          { label: 'INGRESO EST.', val: fmtMXN(totalRevMXN) },
          { label: 'CON PAQUETE', val: packClients.length },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.06em', marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, color: 'var(--tx)' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--br)', paddingBottom: 8 }}>
        {[
          { id: 'reservas', label: '📋 Reservas' },
          { id: 'paquetes', label: '📦 Paquetes' },
          { id: 'precios', label: '💵 Precios' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="btn btn-sm"
            style={{
              background: tab === t.id ? 'var(--glight)' : 'transparent',
              color: tab === t.id ? 'var(--g)' : 'var(--mt)',
              border: `1px solid ${tab === t.id ? 'var(--gd)' : 'var(--br)'}`,
              fontWeight: tab === t.id ? 600 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* RESERVAS TAB */}
      {tab === 'reservas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all','private','collective'].map(t => (
                <button key={t} onClick={() => setFilterType(t)} className="btn btn-sm"
                  style={{ background: filterType === t ? 'var(--glight)' : 'transparent', color: filterType === t ? 'var(--g)' : 'var(--mt)', border: `1px solid ${filterType === t ? 'var(--gd)' : 'var(--br)'}` }}>
                  {t === 'all' ? 'Todos' : t === 'private' ? 'Privados' : 'Colectivos'}
                </button>
              ))}
              {['all','reserved','confirmed','cancelled'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className="btn btn-sm"
                  style={{ background: filterStatus === s ? 'var(--glight)' : 'transparent', color: filterStatus === s ? 'var(--g)' : 'var(--mt)', border: `1px solid ${filterStatus === s ? 'var(--gd)' : 'var(--br)'}` }}>
                  {s === 'all' ? 'Todos status' : s === 'reserved' ? 'Reservados' : s === 'confirmed' ? 'Confirmados' : 'Cancelados'}
                </button>
              ))}
            </div>
            <button className="btn btn-green btn-sm" onClick={() => setShowForm(v => !v)}>+ Nueva Clase</button>
          </div>

          {/* New drill form */}
          {showForm && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Nueva Clase de Drill</div>

              {/* Type selector */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[
                  { id: 'private', label: '🎯 Privada' },
                  { id: 'collective', label: '📦 Paquetes' },
                ].map(t => (
                  <button key={t.id} onClick={() => setDrillType(t.id)} className="btn btn-sm"
                    style={{
                      background: drillType === t.id ? 'var(--g)' : 'var(--sf)',
                      color: drillType === t.id ? '#fff' : 'var(--mt)',
                      border: `1px solid ${drillType === t.id ? 'var(--g)' : 'var(--br)'}`,
                      fontWeight: drillType === t.id ? 700 : 400,
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="form-label">Fecha</label>
                  <input type="date" className="form-input" value={form.date}
                    min={todayStr()}
                    onChange={e => handleDateChange(e.target.value)} />
                  {form.date && getSlotsForDate(form.date).length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--rd)', marginTop: 4 }}>No hay drills este día</div>
                  )}
                </div>
                <div>
                  <label className="form-label">Horario</label>
                  <select className="form-select" value={form.hour} onChange={e => setForm(f => ({ ...f, hour: e.target.value }))}>
                    <option value="">Selecciona horario</option>
                    {availableSlots.map(s => (
                      <option key={s.hour} value={s.hour} disabled={!isSlotAvailable(form.date, s.hour)}>
                        {s.label} {!isSlotAvailable(form.date, s.hour) ? '(No disponible)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {drillType === 'private' ? (
                  <div>
                    <label className="form-label">Personas</label>
                    <select className="form-select" value={form.people} onChange={e => setForm(f => ({ ...f, people: +e.target.value }))}>
                      {[1,2,3,4].map(n => (
                        <option key={n} value={n}>{n} persona{n > 1 ? 's'  : ''} — {fmtMXN(PRIVATE_PRICES[n])}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="form-label">Paquete</label>
                    <select className="form-select" value={form.packageType} onChange={e => setForm(f => ({ ...f, packageType: e.target.value }))}>
                      <option value="single">1 clase suelta — $250</option>
                      <option value="pack8">Paquete 8 clases — $1,600</option>
                      <option value="pack12">Paquete 12 clases — $2,100</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="form-label">Nombre del cliente</label>
                  <input className="form-input" placeholder="Juan García" value={form.clientName}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Teléfono (opcional)</label>
                  <input className="form-input" placeholder="+52 998 000 0000" value={form.clientPhone}
                    onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label className="form-label">Notas (opcional)</label>
                <input className="form-input" placeholder="Nivel principiante, objetivos..." value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {/* Price preview */}
              {form.date && form.hour && (
                <div style={{ background: 'var(--glight)', border: '1px solid var(--gd)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--g)' }}>
                    {drillType === 'private' ? `Clase privada · ${form.people}p` : `Clase colectiva · ${form.packageType === 'single' ? '1 clase' : form.packageType === 'pack8' ? '8 clases' : '12 clases'}`}
                  </span>
                  <span style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--g)' }}>{fmtMXN(getPrice())}</span>
                </div>
              )}

              {formError && <div style={{ color: 'var(--rd)', fontSize: 12, marginBottom: 8 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-green btn-sm" onClick={saveDrill} disabled={saving}>
                  {saving ? 'Guardando…' : 'Agendar Drill'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setFormError('') }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Drill list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--mt)', fontSize: 14 }}>No hay clases registradas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(d => {
                const statusColor = { reserved: '#f5a623', confirmed: 'var(--g)', cancelled: 'var(--rd)' }
                const statusBg    = { reserved: '#2e2010', confirmed: '#1a2e0d', cancelled: '#2e0d0d' }
                return (
                  <div key={d.id} style={{
                    background: 'var(--cd)', border: '1px solid var(--br)',
                    borderLeft: `3px solid ${statusColor[d.status] || 'var(--br)'}`,
                    borderRadius: 8, padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                            {d.client_name}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: statusBg[d.status], color: statusColor[d.status], letterSpacing: '.04em' }}>
                            {d.status?.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: d.type === 'private' ? '#1a1e35' : '#1a2e0d', color: d.type === 'private' ? 'var(--bl)' : 'var(--g)' }}>
                            {d.type === 'private' ? '🎯 Privada' : '👥 Colectiva'}
                          </span>
                          {d.package_type && d.package_type !== 'single' && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#2e2010', color: 'var(--am)' }}>
                              📦 {d.package_type === 'pack8' ? '8 clases' : '12 clases'} · quedan {d.classes_remaining}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                          {d.client_phone && <span>📱 {d.client_phone}</span>}
                          <span>🎾 Cancha {d.court}</span>
                          {d.people > 1 && <span>👥 {d.people} personas</span>}
                          {d.notes && <span>📝 {d.notes}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3 }}>
                          📅 {fmtDate(d.date)} · {String(d.hour).padStart(2,'0')}:00–{String(d.hour+1).padStart(2,'0')}:00
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--g)' }}>
                          {fmtMXN(d.total_mxn)}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--br)', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {d.status === 'reserved' && (
                          <>
                            <button className="btn btn-sm" onClick={() => updateStatus(d.id, 'confirmed')}
                              style={{ background: 'var(--glight)', color: 'var(--g)', border: '1px solid var(--gd)', fontSize: 12 }}>
                              ✅ Confirmar
                            </button>
                            <button className="btn btn-sm" onClick={() => { if (window.confirm('¿Cancelar este drill?')) updateStatus(d.id, 'cancelled') }}
                              style={{ background: '#2e0d0d', color: 'var(--rd)', border: '1px solid #5a1a1a', fontSize: 12 }}>
                              ❌ Cancelar
                            </button>
                          </>
                        )}
                        {d.status === 'confirmed' && d.package_type && d.package_type !== 'single' && d.classes_remaining > 0 && (
                          <button className="btn btn-sm" onClick={() => deductClass(d.id)}
                            style={{ background: '#2e2010', color: 'var(--am)', border: '1px solid #5a4010', fontSize: 12 }}>
                            📚 Descontar clase ({d.classes_remaining} restantes)
                          </button>
                        )}
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteDrill(d.id)}
                        style={{ fontSize: 11, color: 'var(--rd)', borderColor: 'var(--rd)' }}>
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* PAQUETES TAB */}
      {tab === 'paquetes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700 }}>Clientes con Paquete</div>
            <div style={{ fontSize: 12, color: 'var(--mt)' }}>
              Selecciona un cliente para agendar su próxima clase
            </div>
          </div>

          {packClients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--mt)', fontSize: 14 }}>
              No hay clientes con paquete activo
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {packClients.map(d => {
                const totalClasses = d.package_type === 'pack8' ? 8 : 12
                const usedClasses = totalClasses - d.classes_remaining
                const isLow = d.classes_remaining <= 2
                const isEmpty = d.classes_remaining <= 0
                return (
                  <div key={d.id} className="card" style={{
                    padding: '14px 16px',
                    border: isEmpty ? '1px solid var(--rd)' : isLow ? '1px solid var(--am)' : '1px solid var(--br)',
                    opacity: isEmpty ? .6 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      {/* Client info */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>
                          {d.client_name}
                        </div>
                        {d.client_phone && <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 2 }}>📱 {d.client_phone}</div>}
                        <div style={{ fontSize: 11, color: 'var(--mt)' }}>
                          {d.package_type === 'pack8' ? 'Paquete 8 clases' : 'Paquete 12 clases'} · Desde {fmtDate(d.date)}
                        </div>

                        {/* Progress bar */}
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--mt)', marginBottom: 3 }}>
                            <span>{usedClasses} clases usadas</span>
                            <span style={{ color: isLow ? 'var(--am)' : 'var(--mt)' }}>{d.classes_remaining} restantes</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--sf)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 4,
                              background: isEmpty ? 'var(--rd)' : isLow ? 'var(--am)' : 'var(--g)',
                              width: `${(usedClasses / totalClasses) * 100}%`,
                              transition: 'width .3s ease'
                            }} />
                          </div>
                        </div>
                      </div>

                      {/* Classes counter + actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          background: 'var(--sf)', borderRadius: 10, padding: '8px 20px',
                          textAlign: 'center', minWidth: 80,
                          border: `2px solid ${isEmpty ? 'var(--rd)' : isLow ? 'var(--am)' : 'var(--gd)'}`
                        }}>
                          <div style={{
                            fontFamily: 'var(--font-cond)', fontSize: 32, fontWeight: 800, lineHeight: 1,
                            color: isEmpty ? 'var(--rd)' : isLow ? 'var(--am)' : 'var(--g)'
                          }}>
                            {d.classes_remaining}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.05em', marginTop: 2 }}>CLASES</div>
                        </div>

                        {/* Quick book button */}
                        {!isEmpty && (
                          <button
                            className="btn btn-green btn-sm"
                            style={{ width: '100%', fontSize: 11 }}
                            onClick={() => {
                              setDrillType('collective')
                              setForm(f => ({
                                ...f,
                                clientName: d.client_name,
                                clientPhone: d.client_phone || '',
                                packageType: d.package_type,
                                date: '', hour: '',
                              }))
                              setShowForm(true)
                              setTab('reservas')
                              notify(`✅ Cliente ${d.client_name} cargado — selecciona fecha y horario`)
                            }}>
                            📅 Agendar clase
                          </button>
                        )}

                        {/* Manual deduct */}
                        {!isEmpty && (
                          <button className="btn btn-ghost btn-sm"
                            style={{ width: '100%', fontSize: 11, color: 'var(--am)', borderColor: 'var(--am)' }}
                            onClick={() => deductClass(d.id)}>
                            −1 manual
                          </button>
                        )}

                        {isEmpty && (
                          <div style={{ fontSize: 11, color: 'var(--rd)', fontWeight: 600, textAlign: 'center' }}>
                            Sin clases
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Low warning */}
                    {isLow && !isEmpty && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--am)', background: '#2e2010', borderRadius: 6, padding: '6px 10px' }}>
                        ⚠️ Quedan pocas clases — considera renovar el paquete
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* PRECIOS TAB */}
      {tab === 'precios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600 }}>
          <div className="card">
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--g)' }}>🎯 Clases Privadas</div>
            {[
              { label: '1–2 personas', price: 800 },
              { label: '3 personas', price: 1000 },
              { label: '4 personas', price: 1200 },
            ].map(p => (
              <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--br)' }}>
                <span style={{ fontSize: 13, color: 'var(--tx)' }}>{p.label}</span>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--g)' }}>{fmtMXN(p.price)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--bl)' }}>👥 Clases Colectivas</div>
            {[
              { label: '1 clase suelta', price: 250, sub: 'Por clase' },
              { label: 'Paquete 8 clases', price: 1600, sub: '$200 por clase' },
              { label: 'Paquete 12 clases', price: 2100, sub: '$175 por clase' },
            ].map(p => (
              <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--br)' }}>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--tx)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--mt)' }}>{p.sub}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--bl)' }}>{fmtMXN(p.price)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--mt)' }}>📅 Horarios Disponibles</div>
            {[
              { day: 'Lunes', slots: '8:00–9:00' },
              { day: 'Martes', slots: '7:00–8:00 · 8:00–9:00' },
              { day: 'Miércoles', slots: '8:00–9:00' },
              { day: 'Jueves', slots: '7:00–8:00 · 8:00–9:00' },
              { day: 'Sábado', slots: '7:00–8:00 · 8:00–9:00' },
            ].map(h => (
              <div key={h.day} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--br)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{h.day}</span>
                <span style={{ fontSize: 12, color: 'var(--mt)' }}>{h.slots}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
