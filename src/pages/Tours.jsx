import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TABS = ['bookings', 'management', 'metrics', 'incentives']

const PACKAGES = [
  { pax: 2, totalMXN: 2203.83, totalUSD: 125.93 },
  { pax: 3, totalMXN: 2842.76, totalUSD: 162.44 },
  { pax: 4, totalMXN: 3481.68, totalUSD: 198.95 },
  { pax: 6, totalMXN: 5870.71, totalUSD: 335.47 },
  { pax: 8, totalMXN: 7148.57, totalUSD: 408.49 },
]

function fmtMXN(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) }
function fmtUSD(n) { return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

export default function Tours() {
  const [tab, setTab] = useState('bookings')
  const [bookings, setBookings] = useState([])
  const [profiles, setProfiles] = useState([])
  const [commissions, setCommissions] = useState([])
  const [incentives, setIncentives] = useState([])
  const [loading, setLoading] = useState(true)
  const [notif, setNotif] = useState('')

  // Management form
  const [showMgmtForm, setShowMgmtForm] = useState(false)
  const [mgmtForm, setMgmtForm] = useState({ email: '', fullName: '', password: '' })
  const [savingMgmt, setSavingMgmt] = useState(false)
  const [mgmtError, setMgmtError] = useState('')

  // Incentive form
  const [showIncForm, setShowIncForm] = useState(false)
  const [incForm, setIncForm] = useState({ title: '', description: '', target_bookings: '', reward: '' })
  const [savingInc, setSavingInc] = useState(false)

  // Filters
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('')

  useEffect(() => {
    loadAll()
    const channel = supabase.channel('admin-tours')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_bookings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadAll() {
    const [b, p, c, i] = await Promise.all([
      supabase.from('tour_bookings').select('*').order('date', { ascending: false }).order('hour', { ascending: true }),
      supabase.from('profiles').select('*').in('role', ['management', 'vendor']),
      supabase.from('commissions').select('*'),
      supabase.from('incentives').select('*').order('created_at', { ascending: false }),
    ])
    setBookings(b.data || [])
    setProfiles(p.data || [])
    setCommissions(c.data || [])
    setIncentives(i.data || [])
    setLoading(false)
  }

  function notify(msg) {
    setNotif(msg)
    setTimeout(() => setNotif(''), 3500)
  }

  async function updateBookingStatus(id, status) {
    await supabase.from('tour_bookings').update({ status }).eq('id', id)
    if (status === 'cancelled') {
      // Pay cancellation commissions
      const comm = commissions.find(c => c.tour_booking_id === id)
      if (comm) {
        await supabase.from('commissions').update({
          vendor_amount: 50,
          manager_amount: 25,
          status: 'cancelled_partial'
        }).eq('tour_booking_id', id)
      }
      notify('Reserva cancelada — comisiones de cancelación aplicadas ($50 vendedor / $25 management)')
    } else if (status === 'confirmed') {
      await supabase.from('commissions').update({ status: 'confirmed' }).eq('tour_booking_id', id)
      notify('✅ Check-in confirmado')
    }
    loadAll()
  }

  async function createManagement() {
    if (!mgmtForm.email || !mgmtForm.fullName || !mgmtForm.password) return setMgmtError('Todos los campos son requeridos')
    if (mgmtForm.password.length < 6) return setMgmtError('La contraseña debe tener al menos 6 caracteres')
    setSavingMgmt(true)
    setMgmtError('')

    // Use Supabase Admin API via service role to avoid signing out current user
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SERVICE_KEY  = import.meta.env.VITE_SUPABASE_SERVICE_KEY

    try {
      // Create auth user without affecting current session
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: mgmtForm.email,
          password: mgmtForm.password,
          email_confirm: true,
          user_metadata: {
            full_name: mgmtForm.fullName,
            role: 'management',
          },
        }),
      })
      const newUser = await res.json()
      if (!res.ok) {
        setMgmtError(newUser.msg || newUser.message || 'Error al crear usuario')
        setSavingMgmt(false)
        return
      }
      // Wait for Supabase to auto-create the profile row
      await new Promise(r => setTimeout(r, 1500))
      // Update the auto-created profile
      const { error: upErr } = await supabase.from('profiles').update({
        full_name: mgmtForm.fullName,
        role: 'management',
        commission_per_booking: 500,
      }).eq('id', newUser.id)
      // Fallback: insert if profile wasn't auto-created
      if (upErr) {
        await supabase.from('profiles').insert({
          id: newUser.id,
          email: mgmtForm.email,
          full_name: mgmtForm.fullName,
          role: 'management',
          commission_per_booking: 500,
        })
      }
      notify(`✅ Management ${mgmtForm.fullName} creado exitosamente`)
      setMgmtForm({ email: '', fullName: '', password: '' })
      setShowMgmtForm(false)
      loadAll()
    } catch (e) {
      setMgmtError('Error de conexión: ' + e.message)
    }
    setSavingMgmt(false)
  }

  async function saveIncentive() {
    if (!incForm.title.trim()) return
    setSavingInc(true)
    await supabase.from('incentives').insert({
      title: incForm.title, description: incForm.description || null,
      target_bookings: incForm.target_bookings ? parseInt(incForm.target_bookings) : null,
      reward: incForm.reward || null, active: true,
    })
    setIncForm({ title: '', description: '', target_bookings: '', reward: '' })
    setShowIncForm(false)
    loadAll()
    setSavingInc(false)
  }

  async function deleteBooking(id) {
    if (!window.confirm('¿Eliminar esta reserva del panel? Esta acción no se puede deshacer.')) return
    await supabase.from('commissions').delete().eq('tour_booking_id', id)
    await supabase.from('tour_bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(b => b.id !== id))
    notify('🗑 Reserva eliminada del panel')
  }

  function exportExcel(period) {
    const now = new Date()
    let filtered = bookings
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay())
      const end   = new Date(start); end.setDate(start.getDate() + 6)
      filtered = bookings.filter(b => b.date >= start.toISOString().slice(0,10) && b.date <= end.toISOString().slice(0,10))
    } else if (period === 'month') {
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      filtered = bookings.filter(b => b.date?.startsWith(ym))
    }

    const rows = filtered.map(b => {
      const comm = commissions.find(c => c.tour_booking_id === b.id)
      const vendor = profiles.find(p => p.id === b.vendor_id)
      return [
        b.date, `${String(b.hour).padStart(2,'0')}:00`, b.client_name, b.client_phone,
        b.hotel, b.package, b.court, b.pickup_time, b.status,
        b.total_mxn, b.total_usd, b.deposit_mxn, b.deposit_usd,
        b.total_mxn - b.deposit_mxn,
        vendor?.full_name || '—',
        comm?.vendor_amount || 0, comm?.manager_amount || 0, comm?.status || '—'
      ]
    })

    const header = ['Fecha','Hora','Cliente','Teléfono','Hotel/Pickup','Paquete','Cancha','Hora Pickup','Status',
      'Total MXN','Total USD','Depósito MXN','Depósito USD','Balance MXN',
      'Vendedor','Comisión Vendedor','Comisión Management','Status Comisión']

    const csv = [header, ...rows].map(r => r.map(v => '"' + v + '"').join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `dink-and-drink-${period}-${now.toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notify(`✅ Reporte ${period === 'week' ? 'semanal' : 'mensual'} descargado`)
  }

  function exportPDF(period) {
    const now = new Date()
    let filtered = bookings
    let periodLabel = 'General'
    if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay())
      const end   = new Date(start); end.setDate(start.getDate() + 6)
      filtered = bookings.filter(b => b.date >= start.toISOString().slice(0,10) && b.date <= end.toISOString().slice(0,10))
      periodLabel = `Semana del ${start.toLocaleDateString('es-MX')} al ${end.toLocaleDateString('es-MX')}`
    } else if (period === 'month') {
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      filtered = bookings.filter(b => b.date?.startsWith(ym))
      periodLabel = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    }

    const active    = filtered.filter(b => b.status !== 'cancelled')
    const confirmed = filtered.filter(b => b.status === 'confirmed')
    const cancelled = filtered.filter(b => b.status === 'cancelled')
    const totalMXN  = active.reduce((s,b) => s + Number(b.total_mxn||0), 0)
    const totalDep  = active.reduce((s,b) => s + Number(b.deposit_mxn||0), 0)
    const totalComm = commissions
      .filter(c => filtered.some(b => b.id === c.tour_booking_id))
      .reduce((s,c) => s + Number(c.vendor_amount||0) + Number(c.manager_amount||0), 0)

    const rows = filtered.map(b => {
      const vendor = profiles.find(p => p.id === b.vendor_id)
      const comm   = commissions.find(c => c.tour_booking_id === b.id)
      const statusColors = { pending: '#f5a623', confirmed: '#3d5a2e', cancelled: '#c0392b' }
      return `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:6px 8px;font-size:11px">${b.date}</td>
          <td style="padding:6px 8px;font-size:11px">${String(b.hour).padStart(2,'0')}:00</td>
          <td style="padding:6px 8px;font-size:11px;font-weight:600">${b.client_name}</td>
          <td style="padding:6px 8px;font-size:11px">${b.hotel}</td>
          <td style="padding:6px 8px;font-size:11px">${b.package}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:right">$${Number(b.total_mxn||0).toLocaleString('es-MX',{maximumFractionDigits:0})}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:right">$${Number(b.deposit_mxn||0).toLocaleString('es-MX',{maximumFractionDigits:0})}</td>
          <td style="padding:6px 8px;font-size:11px">${vendor?.full_name||'—'}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:right">$${Number(comm?.vendor_amount||0).toLocaleString('es-MX',{maximumFractionDigits:0})}</td>
          <td style="padding:6px 8px;font-size:11px;text-align:center">
            <span style="background:${statusColors[b.status]||'#999'};color:#fff;padding:2px 6px;border-radius:4px;font-size:10px">${b.status?.toUpperCase()}</span>
          </td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Dink & Drink — Reporte ${periodLabel}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:32px;color:#111}
      h1{color:#3d5a2e;margin-bottom:4px}
      .sub{color:#666;font-size:13px;margin-bottom:24px}
      .stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
      .stat{background:#f5f5f0;border-radius:8px;padding:12px 16px;min-width:120px}
      .stat-label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em}
      .stat-val{font-size:20px;font-weight:700;color:#3d5a2e}
      table{width:100%;border-collapse:collapse}
      th{background:#3d5a2e;color:#fff;padding:8px;font-size:11px;text-align:left}
      tr:nth-child(even){background:#f9f9f6}
      .footer{margin-top:24px;font-size:11px;color:#999;text-align:center}
    </style></head><body>
    <h1>🏓 Dink & Drink by Picabol</h1>
    <div class="sub">Reporte de Reservas — ${periodLabel} · Generado el ${now.toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Total Tours</div><div class="stat-val">${filtered.length}</div></div>
      <div class="stat"><div class="stat-label">Confirmados</div><div class="stat-val">${confirmed.length}</div></div>
      <div class="stat"><div class="stat-label">Cancelados</div><div class="stat-val">${cancelled.length}</div></div>
      <div class="stat"><div class="stat-label">Ingreso Est.</div><div class="stat-val">$${totalMXN.toLocaleString('es-MX',{maximumFractionDigits:0})}</div></div>
      <div class="stat"><div class="stat-label">Depósitos</div><div class="stat-val">$${totalDep.toLocaleString('es-MX',{maximumFractionDigits:0})}</div></div>
      <div class="stat"><div class="stat-label">Comisiones</div><div class="stat-val">$${totalComm.toLocaleString('es-MX',{maximumFractionDigits:0})}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Hora</th><th>Cliente</th><th>Hotel</th><th>Paquete</th>
        <th style="text-align:right">Total MXN</th><th style="text-align:right">Depósito</th>
        <th>Vendedor</th><th style="text-align:right">Comisión</th><th style="text-align:center">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Picabol · Cancún, México · picabol.netlify.app</div>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank')
    setTimeout(() => { win?.print(); URL.revokeObjectURL(url) }, 800)
    notify(`✅ Reporte PDF listo para imprimir`)
  }

  async function toggleIncentive(id, active) {
    await supabase.from('incentives').update({ active: !active }).eq('id', id)
    loadAll()
  }

  async function deleteIncentive(id) {
    await supabase.from('incentives').delete().eq('id', id)
    loadAll()
  }

  async function deleteUser(userId, role) {
    const name = profiles.find(p => p.id === userId)?.full_name || 'este usuario'
    if (!window.confirm(`¿Eliminar a ${name}? Se borrarán sus comisiones pero las reservas quedarán en el sistema.`)) return
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SERVICE_KEY  = import.meta.env.VITE_SUPABASE_SERVICE_KEY
    // Delete commissions
    if (role === 'vendor') {
      await supabase.from('commissions').delete().eq('vendor_id', userId)
    } else {
      await supabase.from('commissions').delete().eq('manager_id', userId)
      // Also delete their vendors' commissions
      const myVendors = profiles.filter(p => p.manager_id === userId)
      for (const v of myVendors) {
        await supabase.from('commissions').delete().eq('vendor_id', v.id)
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${v.id}`, {
          method: 'DELETE',
          headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
        })
      }
    }
    // Delete from Auth
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    })
    notify(`✅ Usuario eliminado correctamente`)
    loadAll()
  }

  async function resetCommissions(userId, action) {
    const name = profiles.find(p => p.id === userId)?.full_name || 'este usuario'
    if (action === 'paid') {
      if (!window.confirm(`¿Marcar comisiones de ${name} como PAGADAS?`)) return
      await supabase.from('commissions').update({ status: 'paid' }).or(`vendor_id.eq.${userId},manager_id.eq.${userId}`)
      notify(`✅ Comisiones de ${name} marcadas como pagadas`)
    } else {
      if (!window.confirm(`¿REINICIAR comisiones de ${name} a cero?`)) return
      await supabase.from('commissions').update({ vendor_amount: 0, manager_amount: 0, status: 'reset' }).or(`vendor_id.eq.${userId},manager_id.eq.${userId}`)
      notify(`🔄 Comisiones de ${name} reiniciadas a $0`)
    }
    loadAll()
  }

  // Filtered bookings
  const filteredBookings = bookings.filter(b => {
    if (filterStatus !== 'all' && b.status !== filterStatus) return false
    if (filterDate && b.date !== filterDate) return false
    return true
  })

  // Metrics
  const activeBookings    = bookings.filter(b => b.status !== 'cancelled')
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed')
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled')
  const totalRevenueMXN   = activeBookings.reduce((s, b) => s + Number(b.total_mxn || 0), 0)
  const totalDepositsMXN  = activeBookings.reduce((s, b) => s + Number(b.deposit_mxn || 0), 0)
  const totalCommissions  = commissions.filter(c => c.status !== 'cancelled_partial').reduce((s, c) => s + Number(c.vendor_amount || 0) + Number(c.manager_amount || 0), 0)
  const managementProfiles = profiles.filter(p => p.role === 'management')
  const vendorProfiles     = profiles.filter(p => p.role === 'vendor')

  function getVendorName(id) {
    const p = profiles.find(x => x.id === id)
    return p?.full_name || p?.email || '—'
  }

  function getVendorComm(bookingId) {
    const c = commissions.find(x => x.tour_booking_id === bookingId)
    return c ? { vendor: c.vendor_amount, manager: c.manager_amount, status: c.status } : null
  }

  const statusColor = { pending: '#f5a623', confirmed: 'var(--g)', cancelled: 'var(--rd)' }
  const statusBg    = { pending: '#2e2010', confirmed: '#1a2e0d', cancelled: '#2e0d0d' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, color: 'var(--mt)' }}>Cargando Tours…</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 28, fontWeight: 800, color: 'var(--tx)', letterSpacing: 1 }}>
          DINK <span style={{ color: 'var(--g)' }}>&</span> DRINK
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>Panel de administración de tours</div>
      </div>

      {/* Notif */}
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

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'TOTAL TOURS', val: activeBookings.length },
          { label: 'CONFIRMADOS', val: confirmedBookings.length },
          { label: 'CANCELADOS', val: cancelledBookings.length },
          { label: 'INGRESO EST.', val: fmtMXN(totalRevenueMXN) },
          { label: 'DEPÓSITOS', val: fmtMXN(totalDepositsMXN) },
          { label: 'COMISIONES', val: fmtMXN(totalCommissions) },
          { label: 'MANAGEMENT', val: managementProfiles.length },
          { label: 'VENDEDORES', val: vendorProfiles.length },
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
          { id: 'bookings', label: '📋 Reservas' },
          { id: 'management', label: '👥 Management' },
          { id: 'metrics', label: '📊 Métricas' },
          { id: 'incentives', label: '🎯 Incentivos' },
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

      {/* BOOKINGS TAB */}
      {tab === 'bookings' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['all', 'pending', 'confirmed', 'cancelled'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className="btn btn-sm"
                style={{
                  background: filterStatus === s ? 'var(--glight)' : 'transparent',
                  color: filterStatus === s ? 'var(--g)' : 'var(--mt)',
                  border: `1px solid ${filterStatus === s ? 'var(--gd)' : 'var(--br)'}`,
                }}>
                {s === 'all' ? 'Todas' : s === 'pending' ? 'Pendientes' : s === 'confirmed' ? 'Confirmadas' : 'Canceladas'}
              </button>
            ))}
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="form-input" style={{ height: 32, fontSize: 12, padding: '0 10px', width: 'auto' }} />
            {filterDate && <button className="btn btn-ghost btn-sm" onClick={() => setFilterDate('')}>✕ Fecha</button>}
          </div>

          {filteredBookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--mt)', fontSize: 14 }}>No hay reservas</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredBookings.map(b => {
                const comm = getVendorComm(b.id)
                return (
                  <div key={b.id} style={{
                    background: 'var(--cd)', border: '1px solid var(--br)',
                    borderLeft: `3px solid ${statusColor[b.status] || 'var(--br)'}`,
                    borderRadius: 8, padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      {/* Client info */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                            {b.client_name}
                          </div>
                          <div style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: statusBg[b.status] || 'var(--sf)',
                            color: statusColor[b.status] || 'var(--mt)',
                            letterSpacing: '.04em'
                          }}>
                            {b.status?.toUpperCase()}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                          <span>📱 {b.client_phone}</span>
                          <span>🏨 {b.hotel}</span>
                          <span>📦 {b.package}</span>
                          <span>🎾 Cancha {b.court}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>📅 {fmtDate(b.date)} · {String(b.hour).padStart(2,'0')}:00–{String(b.hour+3).padStart(2,'0')}:00</span>
                          <span>🚐 Pickup: {b.pickup_time}</span>
                        </div>
                      </div>

                      {/* Amounts */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--g)' }}>
                          {fmtMXN(b.total_mxn)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--mt)' }}>{fmtUSD(b.total_usd)} USD</div>
                        <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 2 }}>
                          Depósito: {fmtMXN(b.deposit_mxn)}
                        </div>
                        {comm && (
                          <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 3 }}>
                            Comisión: {fmtMXN(comm.vendor)} + {fmtMXN(comm.manager)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vendor + Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--br)' }}>
                      <div style={{ fontSize: 11, color: 'var(--mt)' }}>
                        Vendedor: <span style={{ color: 'var(--g)', fontWeight: 600 }}>{getVendorName(b.vendor_id)}</span>
                      </div>
                      {b.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm"
                            onClick={() => updateBookingStatus(b.id, 'confirmed')}
                            style={{ background: 'var(--glight)', color: 'var(--g)', border: '1px solid var(--gd)', fontSize: 12 }}>
                            ✅ Check-in
                          </button>
                          <button className="btn btn-sm"
                            onClick={() => { if (window.confirm('¿Cancelar esta reserva?')) updateBookingStatus(b.id, 'cancelled') }}
                            style={{ background: '#2e0d0d', color: 'var(--rd)', border: '1px solid #5a1a1a', fontSize: 12 }}>
                            ❌ Cancelar
                          </button>
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <div style={{ fontSize: 12, color: 'var(--g)', fontWeight: 600 }}>✅ Check-in realizado</div>
                      )}
                      {b.status === 'cancelled' && (
                        <div style={{ fontSize: 12, color: 'var(--rd)' }}>❌ Cancelado · $50/$25 aplicados</div>
                      )}
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => deleteBooking(b.id)}
                        style={{ fontSize: 11, color: 'var(--rd)', borderColor: 'var(--rd)', marginLeft: 6 }}>
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

      {/* MANAGEMENT TAB */}
      {tab === 'management' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700 }}>Usuarios Management</div>
            <button className="btn btn-green btn-sm" onClick={() => setShowMgmtForm(v => !v)}>+ Crear Management</button>
          </div>

          {showMgmtForm && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Nuevo Management</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Nombre completo</label>
                  <input className="form-input" placeholder="Juan García" value={mgmtForm.fullName}
                    onChange={e => setMgmtForm(f => ({ ...f, fullName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="juan@ejemplo.com" value={mgmtForm.email}
                    onChange={e => setMgmtForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Contraseña inicial</label>
                  <input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={mgmtForm.password}
                    onChange={e => setMgmtForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              {mgmtError && <div style={{ color: 'var(--rd)', fontSize: 12, marginBottom: 8 }}>{mgmtError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-green btn-sm" onClick={createManagement} disabled={savingMgmt}>
                  {savingMgmt ? 'Creando…' : 'Crear Management'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowMgmtForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Management list */}
          {managementProfiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mt)', fontSize: 13 }}>No hay usuarios management aún</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {managementProfiles.map(mgmt => {
                const myVendors = vendorProfiles.filter(v => v.manager_id === mgmt.id)
                const myBookings = bookings.filter(b => {
                  const vendorIds = [mgmt.id, ...myVendors.map(v => v.id)]
                  return vendorIds.includes(b.vendor_id) && b.status !== 'cancelled'
                })
                const myComms = commissions.filter(c => c.manager_id === mgmt.id || c.vendor_id === mgmt.id)
                const totalComm = myComms.reduce((s, c) => s + Number(c.vendor_amount || 0) + Number(c.manager_amount || 0), 0)
                return (
                  <div key={mgmt.id} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>
                          {mgmt.full_name || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)' }}>{mgmt.email}</div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 4 }}>
                          Vendedores: <span style={{ color: 'var(--g)', fontWeight: 600 }}>{myVendors.length}</span>
                          {myVendors.length > 0 && (
                            <span style={{ marginLeft: 8 }}>({myVendors.map(v => v.full_name || v.email).join(', ')})</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--g)' }}>
                          {myBookings.length} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--mt)' }}>reservas</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 8 }}>Comisiones: {fmtMXN(totalComm)}</div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm"
                            style={{ fontSize: 10, padding: '2px 8px', height: 26, color: 'var(--g)', borderColor: 'var(--gd)' }}
                            onClick={() => resetCommissions(mgmt.id, 'paid')}>
                            💳 Pagadas
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            style={{ fontSize: 10, padding: '2px 8px', height: 26 }}
                            onClick={() => resetCommissions(mgmt.id, 'reset')}>
                            🔄 Reiniciar
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            style={{ fontSize: 10, padding: '2px 8px', height: 26, color: 'var(--rd)', borderColor: 'var(--rd)' }}
                            onClick={() => deleteUser(mgmt.id, 'management')}>
                            🗑 Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* METRICS TAB */}
      {tab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 12, color: 'var(--mt)', alignSelf: 'center' }}>Exportar:</span>
            {[
              { label: '📊 Excel Semanal', action: () => exportExcel('week') },
              { label: '📊 Excel Mensual', action: () => exportExcel('month') },
              { label: '📄 PDF Semanal',   action: () => exportPDF('week') },
              { label: '📄 PDF Mensual',   action: () => exportPDF('month') },
            ].map(btn => (
              <button key={btn.label} className="btn btn-ghost btn-sm"
                style={{ fontSize: 11 }} onClick={btn.action}>
                {btn.label}
              </button>
            ))}
          </div>

          {/* Revenue by package */}
          <div className="card">
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Reservas por paquete</div>
            {PACKAGES.map(pkg => {
              const count = activeBookings.filter(b => b.package?.startsWith(String(pkg.pax))).length
              const revenue = count * pkg.totalMXN
              const maxCount = Math.max(...PACKAGES.map(p => activeBookings.filter(b => b.package?.startsWith(String(p.pax))).length), 1)
              return (
                <div key={pkg.pax} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 60, fontSize: 12, fontWeight: 600, color: 'var(--mt)' }}>{pkg.pax} pax</div>
                  <div style={{ flex: 1, height: 20, background: 'var(--sf)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: 'var(--g)', borderRadius: 4,
                      width: `${(count / maxCount) * 100}%`, transition: 'width .5s ease'
                    }} />
                  </div>
                  <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: 'var(--tx)', textAlign: 'right' }}>{count}</div>
                  <div style={{ width: 90, fontSize: 12, color: 'var(--mt)', textAlign: 'right' }}>{fmtMXN(revenue)}</div>
                </div>
              )
            })}
          </div>

          {/* Commissions by vendor */}
          <div className="card">
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Comisiones por vendedor</div>
            {vendorProfiles.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--mt)' }}>No hay vendedores aún</div>
            ) : vendorProfiles.map(v => {
              const vComms = commissions.filter(c => c.vendor_id === v.id)
              const total = vComms.reduce((s, c) => s + Number(c.vendor_amount || 0), 0)
              const count = bookings.filter(b => b.vendor_id === v.id && b.status !== 'cancelled').length
              const mgr = profiles.find(p => p.id === v.manager_id)
              return (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--br)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{v.full_name || v.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--mt)' }}>
                      {mgr ? `Management: ${mgr.full_name || mgr.email}` : 'Sin management'} · {count} reservas
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700, color: 'var(--g)' }}>
                      {fmtMXN(total)}
                    </div>
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 8px', height: 26, color: 'var(--g)', borderColor: 'var(--gd)' }}
                      onClick={() => resetCommissions(v.id, 'paid')}>
                      💳
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 8px', height: 26 }}
                      onClick={() => resetCommissions(v.id, 'reset')}>
                      🔄
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 8px', height: 26, color: 'var(--rd)', borderColor: 'var(--rd)' }}
                      onClick={() => deleteUser(v.id, 'vendor')}>
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'INGRESO TOTAL EST.', val: fmtMXN(totalRevenueMXN) },
              { label: 'DEPÓSITOS RECIBIDOS', val: fmtMXN(totalDepositsMXN) },
              { label: 'BALANCE PENDIENTE', val: fmtMXN(totalRevenueMXN - totalDepositsMXN) },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.06em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 22, fontWeight: 800, color: 'var(--g)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INCENTIVES TAB */}
      {tab === 'incentives' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700 }}>Incentivos activos</div>
            <button className="btn btn-green btn-sm" onClick={() => setShowIncForm(v => !v)}>+ Nuevo incentivo</button>
          </div>

          {showIncForm && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="form-label">Título</label>
                  <input className="form-input" placeholder="¡Llega a 10 reservas esta semana!" value={incForm.title}
                    onChange={e => setIncForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Premio</label>
                  <input className="form-input" placeholder="$500 MXN bono" value={incForm.reward}
                    onChange={e => setIncForm(f => ({ ...f, reward: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Descripción (opcional)</label>
                  <input className="form-input" placeholder="El mejor vendedor del mes gana…" value={incForm.description}
                    onChange={e => setIncForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Meta (# reservas)</label>
                  <input className="form-input" type="number" placeholder="10" value={incForm.target_bookings}
                    onChange={e => setIncForm(f => ({ ...f, target_bookings: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-green btn-sm" onClick={saveIncentive} disabled={savingInc}>
                  {savingInc ? 'Guardando…' : 'Publicar incentivo'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowIncForm(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {incentives.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--mt)', fontSize: 13 }}>No hay incentivos publicados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incentives.map(inc => (
                <div key={inc.id} style={{
                  background: inc.active ? 'var(--glight)' : 'var(--sf)',
                  border: `1px solid ${inc.active ? 'var(--gd)' : 'var(--br)'}`,
                  borderRadius: 8, padding: '12px 14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: inc.active ? 'var(--g)' : 'var(--mt)', marginBottom: 2 }}>
                      {inc.title}
                    </div>
                    {inc.description && <div style={{ fontSize: 12, color: 'var(--mt)' }}>{inc.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 3, display: 'flex', gap: 12 }}>
                      {inc.target_bookings && <span>Meta: {inc.target_bookings} reservas</span>}
                      {inc.reward && <span>🏆 {inc.reward}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleIncentive(inc.id, inc.active)}>
                      {inc.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}
                      onClick={() => { if (window.confirm('¿Eliminar este incentivo?')) deleteIncentive(inc.id) }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
