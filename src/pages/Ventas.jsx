import { useState, useEffect } from 'react'
import { fetchBookingsRange } from '../hooks/useBookings'
import { supabase } from '../lib/supabase'
import { getWeekDays, ymd, fmtMXN, DAYS_ES, MONTHS_ES } from '../lib/utils'
import { format, startOfMonth, endOfMonth } from 'date-fns'

const PERIODS = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes',    label: 'Este mes' },
]

export default function Ventas() {
  const [period,        setPeriod]        = useState('semana')
  const [bookings,      setBookings]      = useState([])
  const [tourBookings,  setTourBookings]  = useState([])
  const [drillBookings, setDrillBookings] = useState([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    const today = new Date()
    let from, to

    if (period === 'hoy') {
      from = to = format(today, 'yyyy-MM-dd')
    } else if (period === 'semana') {
      const days = getWeekDays(0)
      from = ymd(days[0])
      to   = ymd(days[6])
    } else {
      from = format(startOfMonth(today), 'yyyy-MM-dd')
      to   = format(endOfMonth(today),   'yyyy-MM-dd')
    }

    const [b, t, d] = await Promise.all([
      fetchBookingsRange(from, to),
      supabase.from('tour_bookings').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
      supabase.from('drills').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
    ])
    setBookings(b.data || [])
    setTourBookings(t.data || [])
    setDrillBookings(d.data || [])
    setLoading(false)
  }

  // ── Canchas stats ─────────────────────────────────────────────────────
  const finished = bookings.filter(b => ['playing','finished'].includes(b.status))
  const privadas = finished.filter(b => b.modality === 'privada')
  const opens    = finished.filter(b => b.modality === 'openplay')
  const privRev  = privadas.reduce((a, b) => a + Number(b.revenue || 0), 0)
  const openRev  = opens.reduce((a, b) => a + Number(b.revenue || 0), 0)
  const courtRev = privRev + openRev

  // ── Tour stats ────────────────────────────────────────────────────────
  const confirmedTours = tourBookings.filter(b => b.status === 'confirmed')
  const tourRevMXN     = tourBookings.reduce((a, b) => a + Number(b.total_mxn || 0), 0)
  const tourDeposits   = tourBookings.reduce((a, b) => a + Number(b.deposit_mxn || 0), 0)
  const tourPeople     = tourBookings.reduce((a, b) => {
    const base = parseInt(b.package || '') || 2
    return a + base + (b.extra_pax || 0)
  }, 0)

  // ── Drill stats ───────────────────────────────────────────────────────
  // Solo suma drills con revenue_collected=true y que NO sean pago previo al sistema
  const drillRevMXN = drillBookings
    .filter(b => b.revenue_collected && !b.pre_system_payment)
    .reduce((a, b) => a + Number(b.total_mxn || 0), 0)
  const confirmedDrills  = drillBookings.filter(b => b.status === 'confirmed')
  const privateDrills    = drillBookings.filter(b => b.type === 'private')
  const collectiveDrills = drillBookings.filter(b => b.type === 'collective')

  // ── Combined ──────────────────────────────────────────────────────────
  const totalRev = courtRev + tourRevMXN + drillRevMXN
  const totalPpl = finished.reduce((a, b) => a + (b.people || 0), 0) + tourPeople
  const gH       = finished.reduce((a, b) => a + (b.gender_m || 0), 0)
  const gF       = finished.reduce((a, b) => a + (b.gender_f || 0), 0)
  const gK       = finished.reduce((a, b) => a + (b.gender_k || 0), 0)
  const totalRes = finished.length + tourBookings.length + drillBookings.length
  const avgTicket = totalRes ? Math.round(totalRev / totalRes) : 0

  // By day of week
  const days = getWeekDays(0)
  const byDay = days.map(d => {
    const ds     = ymd(d)
    const dayB   = finished.filter(b => b.date === ds)
    const dayT   = tourBookings.filter(b => b.date === ds)
    const dayD   = drillBookings.filter(b => b.date === ds && b.revenue_collected && !b.pre_system_payment)
    const courtR = dayB.reduce((a, b) => a + Number(b.revenue || 0), 0)
    const tourR  = dayT.reduce((a, b) => a + Number(b.total_mxn || 0), 0)
    const drillR = dayD.reduce((a, b) => a + Number(b.total_mxn || 0), 0)
    return {
      label: DAYS_ES[d.getDay()],
      rev: courtR + tourR + drillR, courtRev: courtR, tourRev: tourR, drillRev: drillR,
      count: dayB.length + dayT.length + dayD.length,
      isToday: ds === format(new Date(), 'yyyy-MM-dd')
    }
  })
  const maxDayRev = Math.max(...byDay.map(d => d.rev), 1)

  // By hour
  const hourCounts = Array(15).fill(0)
  finished.forEach(b => { if (b.hour >= 7 && b.hour <= 21) hourCounts[b.hour - 7]++ })
  tourBookings.forEach(b => { if (b.hour >= 7 && b.hour <= 21) hourCounts[b.hour - 7]++ })
  drillBookings.forEach(b => { if (b.hour >= 7 && b.hour <= 21) hourCounts[b.hour - 7]++ })
  const maxHour = Math.max(...hourCounts, 1)

  // By city
  const cities = {}
  finished.forEach(b => { if (b.city) cities[b.city] = (cities[b.city] || 0) + (b.people || 0) })
  tourBookings.forEach(b => { if (b.hotel) {
    const city = b.hotel.split(',')[0].trim()
    cities[city] = (cities[city] || 0) + 1
  }})
  const cityList = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxCity  = cityList[0]?.[1] || 1

  // Donut
  const r = 40, cx = 55, circ = 2 * Math.PI * r
  const privPct  = totalRev > 0 ? privRev      / totalRev : 0
  const openPct  = totalRev > 0 ? openRev      / totalRev : 0
  const tourPct  = totalRev > 0 ? tourRevMXN   / totalRev : 0
  const drillPct = totalRev > 0 ? drillRevMXN  / totalRev : 0
  const privDash  = privPct  * circ
  const openDash  = openPct  * circ
  const tourDash  = tourPct  * circ
  const drillDash = drillPct * circ

  const kpis = [
    {
      label: 'INGRESOS TOTALES', val: fmtMXN(totalRev), accent: 'var(--g)',
      sub: `Canchas: ${fmtMXN(courtRev)} · Tours: ${fmtMXN(tourRevMXN)} · Drills: ${fmtMXN(drillRevMXN)}`
    },
    {
      label: 'RESERVAS TOTALES', val: totalRes, accent: 'var(--bl)',
      sub: `Canchas: ${finished.length} · Tours: ${tourBookings.length} · Drills: ${drillBookings.length}`
    },
    {
      label: 'PERSONAS', val: totalPpl, accent: 'var(--tl)',
      sub: `H:${gH} · M:${gF} · N:${gK} · Tours:${tourPeople}`
    },
    {
      label: 'TICKET PROMEDIO', val: fmtMXN(avgTicket), accent: 'var(--am)',
      sub: `Tours confirmados: ${confirmedTours.length}`
    },
  ]

  function exportExcelGeneral(period) {
    const now = new Date()
    const periodLabel = period === 'hoy' ? 'Hoy' : period === 'semana' ? 'Semana' : 'Mes'

    const courtRows = finished.map(b => [
      b.date, String(b.hour).padStart(2,'0') + ':00', b.name, '—', b.city || '—',
      b.modality === 'privada' ? 'Cancha Privada' : 'Open Play',
      b.court, b.people || 0, b.revenue || 0, 0, b.revenue || 0, b.status || '—'
    ])
    const tourRows = tourBookings.map(b => [
      b.date, String(b.hour).padStart(2,'0') + ':00', b.client_name, b.client_phone || '—', b.hotel || '—',
      'Tour D&D ' + (b.package || ''), b.court, 0, b.total_mxn || 0, b.deposit_mxn || 0,
      (b.total_mxn || 0) - (b.deposit_mxn || 0), b.status || '—'
    ])
    const drillRows = drillBookings
      .filter(b => b.revenue_collected && !b.pre_system_payment)
      .map(b => [
        b.date, String(b.hour).padStart(2,'0') + ':00', b.client_name, b.client_phone || '—', '—',
        'Drill ' + (b.type === 'private' ? 'Privado' : 'Colectivo'), b.court, b.people || 1,
        b.total_mxn || 0, 0, b.total_mxn || 0, b.status || '—'
      ])

    const csvHeader = ['Fecha','Hora','Cliente','Telefono','Hotel/Ciudad','Tipo','Cancha','Personas','Total MXN','Deposito MXN','Balance MXN','Status']
    const csvRows   = [...courtRows, ...tourRows, ...drillRows].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    const csv       = [csvHeader, ...csvRows].map(r => r.map(v => '"' + String(v || '') + '"').join(',')).join('\n')
    const blob      = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url       = URL.createObjectURL(blob)
    const a         = document.createElement('a')
    a.href          = url
    a.download      = 'picabol-reporte-' + periodLabel + '-' + now.toISOString().slice(0,10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDFGeneral(period) {
    const now = new Date()
    const periodLabel = period === 'hoy' ? 'Hoy' : period === 'semana' ? 'Esta Semana' : 'Este Mes'

    const allRows = [
      ...finished.map(b => ({
        date: b.date, hour: b.hour, name: b.name,
        type: b.modality === 'privada' ? 'Cancha Privada' : 'Open Play',
        location: b.city || '—', people: b.people || 0, total: b.revenue || 0,
        status: b.status, _color: b.modality === 'privada' ? '#3d5a2e' : '#1e4a8a'
      })),
      ...tourBookings.map(b => ({
        date: b.date, hour: b.hour, name: b.client_name,
        type: 'Tour D&D ' + (b.package || ''),
        location: b.hotel || '—', people: (parseInt(b.package)||2) + (b.extra_pax||0),
        total: b.total_mxn || 0, status: b.status, _color: '#4a7a35'
      })),
      ...drillBookings
        .filter(b => b.revenue_collected && !b.pre_system_payment)
        .map(b => ({
          date: b.date, hour: b.hour, name: b.client_name,
          type: 'Drill ' + (b.type === 'private' ? 'Privado' : 'Colectivo'),
          location: '—', people: b.people || 1,
          total: b.total_mxn || 0, status: b.status, _color: '#6b3fa0'
        })),
    ].sort((a, b) => a.date?.localeCompare(b.date))

    const fmt  = n => '$' + Number(n||0).toLocaleString('es-MX', { maximumFractionDigits: 0 })
    const rows = allRows.map(b => `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:5px 8px;font-size:11px">${b.date}</td>
        <td style="padding:5px 8px;font-size:11px">${String(b.hour).padStart(2,'0')}:00</td>
        <td style="padding:5px 8px;font-size:11px;font-weight:600">${b.name}</td>
        <td style="padding:5px 8px;font-size:10px"><span style="background:${b._color}22;color:${b._color};padding:2px 6px;border-radius:4px;font-weight:600">${b.type}</span></td>
        <td style="padding:5px 8px;font-size:11px">${b.location}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:center">${b.people}</td>
        <td style="padding:5px 8px;font-size:11px;text-align:right;font-weight:700;color:${b._color}">${fmt(b.total)}</td>
        <td style="padding:5px 8px;font-size:10px;text-align:center"><span style="background:#eee;padding:2px 6px;border-radius:4px">${b.status?.toUpperCase()}</span></td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Picabol — Reporte General ${periodLabel}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:32px;color:#111}
      h1{color:#3d5a2e;margin-bottom:4px;font-size:22px}
      .sub{color:#666;font-size:13px;margin-bottom:20px}
      .stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
      .stat{background:#f5f5f0;border-radius:8px;padding:10px 14px;min-width:110px}
      .stat-label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em}
      .stat-val{font-size:18px;font-weight:700;color:#3d5a2e}
      table{width:100%;border-collapse:collapse}
      th{background:#3d5a2e;color:#fff;padding:7px 8px;font-size:11px;text-align:left}
      tr:nth-child(even){background:#f9f9f6}
      .footer{margin-top:20px;font-size:11px;color:#999;text-align:center}
    </style></head><body>
    <h1>🏓 PICABOL — Reporte General</h1>
    <div class="sub">${periodLabel} · Generado el ${now.toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Total Reservas</div><div class="stat-val">${allRows.length}</div></div>
      <div class="stat"><div class="stat-label">Canchas</div><div class="stat-val">${finished.length}</div></div>
      <div class="stat"><div class="stat-label">Tours D&D</div><div class="stat-val">${tourBookings.length}</div></div>
      <div class="stat"><div class="stat-label">Drills</div><div class="stat-val">${drillBookings.length}</div></div>
      <div class="stat"><div class="stat-label">Ingreso Total</div><div class="stat-val">${fmt(totalRev)}</div></div>
    </div>
    <table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Tipo</th><th>Hotel/Ciudad</th><th style="text-align:center">Pax</th><th style="text-align:right">Total</th><th style="text-align:center">Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Picabol · Cancún, México</div>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const win  = window.open(url, '_blank')
    setTimeout(() => { win?.print(); URL.revokeObjectURL(url) }, 800)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--mt)' }}>
      Cargando datos...
    </div>
  )

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, marginRight: 8 }}>Ventas</span>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              fontFamily: 'var(--font-cond)', fontSize: 13, padding: '5px 13px',
              borderRadius: 6, border: '1px solid var(--br)', cursor: 'pointer',
              background:   period === p.key ? 'var(--g)' : 'transparent',
              color:        period === p.key ? '#0d1f00'  : 'var(--mt)',
              borderColor:  period === p.key ? 'var(--g)' : 'var(--br)',
              fontWeight:   period === p.key ? 700 : 400
            }}>{p.label}</button>
        ))}
      </div>

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, color: 'var(--mt)', alignSelf: 'center' }}>Exportar reporte general:</span>
        {[
          { label: '📊 Excel', action: () => exportExcelGeneral(period) },
          { label: '📄 PDF',   action: () => exportPDFGeneral(period) },
        ].map(btn => (
          <button key={btn.label} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={btn.action}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: k.accent }} />
            <div style={{ fontSize: 11, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 34, fontWeight: 800, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tour summary strip */}
      {tourBookings.length > 0 && (
        <div style={{
          background: '#1a2e10', border: '1px solid var(--gd)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 10,
          display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: 'var(--g)', letterSpacing: '.05em' }}>
            🏓 DINK & DRINK
          </div>
          {[
            { label: 'Tours',        val: tourBookings.length },
            { label: 'Confirmados',  val: confirmedTours.length },
            { label: 'Ingreso Est.', val: fmtMXN(tourRevMXN) },
            { label: 'Depósitos',    val: fmtMXN(tourDeposits) },
            { label: 'Balance',      val: fmtMXN(tourRevMXN - tourDeposits) },
            { label: 'Personas',     val: tourPeople },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.06em' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--g)' }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Drills summary strip */}
      {drillBookings.length > 0 && (
        <div style={{
          background: '#1a1535', border: '1px solid #6b3fa0',
          borderRadius: 8, padding: '10px 16px', marginBottom: 10,
          display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: '#c8a8f0', letterSpacing: '.05em' }}>
            🎯 DRILLS
          </div>
          {[
            { label: 'Total',        val: drillBookings.length },
            { label: 'Confirmados',  val: confirmedDrills.length },
            { label: 'Privados',     val: privateDrills.length },
            { label: 'Colectivos',   val: collectiveDrills.length },
            { label: 'Cobrado',      val: fmtMXN(drillRevMXN) },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.06em' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: '#c8a8f0' }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main row: bar chart + donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            INGRESOS POR DÍA
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 120 }}>
            {byDay.map((d, i) => {
              const hCourt = Math.round(d.courtRev / maxDayRev * 100)
              const hTour  = Math.round(d.tourRev  / maxDayRev * 100)
              const hDrill = Math.round(d.drillRev / maxDayRev * 100)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ fontSize: 9, color: d.rev > 0 ? 'var(--mt)' : 'transparent', fontFamily: 'var(--font-cond)' }}>
                    {d.rev > 0 ? `$${(d.rev/1000).toFixed(1)}k` : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1, width: '100%' }}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                      {d.tourRev > 0 && (
                        <div style={{ height: `${hTour}px`, minHeight: 3, background: '#c8e86b', width: '100%' }} />
                      )}
                      {d.drillRev > 0 && (
                        <div style={{ height: `${hDrill}px`, minHeight: 3, background: '#9b59b6', width: '100%' }} />
                      )}
                      {d.courtRev > 0 && (
                        <div style={{ height: `${hCourt}px`, minHeight: 3, background: d.isToday ? 'var(--g)' : '#3d6b18', width: '100%' }} />
                      )}
                      {d.rev === 0 && (
                        <div style={{ height: 3, background: '#2a2a2a', width: '100%' }} />
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: d.isToday ? 'var(--am)' : 'var(--mt)' }}>{d.label}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[
              { color: 'var(--g)', label: 'Canchas' },
              { color: '#c8e86b', label: 'Tours D&D' },
              { color: '#9b59b6', label: 'Drills' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--mt)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} /> {l.label}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            MODALIDADES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 110, height: 110 }}>
              <svg viewBox="0 0 110 110" width="110" height="110">
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="#2a2a2a" strokeWidth="12" />
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--g)" strokeWidth="12"
                  strokeDasharray={`${privDash} ${circ}`} strokeDashoffset={circ * 0.25} />
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--bl)" strokeWidth="12"
                  strokeDasharray={`${openDash} ${circ}`} strokeDashoffset={circ * 0.25 - privDash} />
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="#c8e86b" strokeWidth="12"
                  strokeDasharray={`${tourDash} ${circ}`} strokeDashoffset={circ * 0.25 - privDash - openDash} />
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="#9b59b6" strokeWidth="12"
                  strokeDasharray={`${drillDash} ${circ}`} strokeDashoffset={circ * 0.25 - privDash - openDash - tourDash} />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 800 }}>{fmtMXN(totalRev)}</div>
                <div style={{ fontSize: 9, color: 'var(--mt)' }}>total</div>
              </div>
            </div>
            {[
              { color: 'var(--g)',  label: 'Cancha privada', val: fmtMXN(privRev),    pct: Math.round(privPct*100),  count: privadas.length },
              { color: 'var(--bl)', label: 'Open Play',      val: fmtMXN(openRev),    pct: Math.round(openPct*100),  count: opens.length },
              { color: '#c8e86b',   label: 'Dink & Drink',   val: fmtMXN(tourRevMXN), pct: Math.round(tourPct*100),  count: tourBookings.length },
              { color: '#9b59b6',   label: 'Drills',         val: fmtMXN(drillRevMXN),pct: Math.round(drillPct*100), count: drillBookings.length },
            ].map(m => (
              <div key={m.label} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--br)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: m.color }} />
                  <div style={{ fontSize: 12 }}>{m.label}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700 }}>{m.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--mt)' }}>{m.pct}% · {m.count} res.</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            HORAS MÁS ACTIVAS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {hourCounts.map((v, i) => {
              const pct = v / maxHour
              const bg    = v === 0 ? '#1e1e1e' : pct > .8 ? '#5A9418' : pct > .5 ? '#3d6b18' : pct > .2 ? '#2a4a10' : '#1e2e0d'
              const color = v === 0 ? '#333'     : pct > .5 ? '#c8f080' : 'var(--g)'
              return (
                <div key={i} style={{ background: bg, color, borderRadius: 4, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 600 }}>
                  {i + 7}h
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            VISITANTES POR HOTEL/CIUDAD
          </div>
          {cityList.length ? cityList.map(([city, n], i) => (
            <div key={city} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < cityList.length - 1 ? '1px solid var(--br)' : 'none' }}>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 800, color: 'var(--br)', minWidth: 22 }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 12 }}>{city}</div>
              <div style={{ width: 60, background: '#2a2a2a', borderRadius: 3, height: 6 }}>
                <div style={{ width: `${Math.round(n / maxCity * 100)}%`, height: '100%', borderRadius: 3, background: 'var(--tl)' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, color: 'var(--tl)', minWidth: 26, textAlign: 'right' }}>{n}</div>
            </div>
          )) : (
            <div style={{ fontSize: 13, color: 'var(--mt)' }}>Sin datos para este período</div>
          )}
        </div>

        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            VISITANTES POR GÉNERO
          </div>
          {[
            { label: 'Hombres', val: gH, color: 'var(--bl)' },
            { label: 'Mujeres', val: gF, color: '#D4537E' },
            { label: 'Niños',   val: gK, color: 'var(--am)' },
          ].map(g => {
            const maxG = Math.max(gH, gF, gK, 1)
            return (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--mt)', minWidth: 52 }}>{g.label}</div>
                <div style={{ flex: 1, background: '#2a2a2a', borderRadius: 3, height: 10 }}>
                  <div style={{ width: `${Math.round(g.val / maxG * 100)}%`, height: '100%', borderRadius: 3, background: g.color }} />
                </div>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, color: g.color, minWidth: 28, textAlign: 'right' }}>{g.val}</div>
              </div>
            )
          })}
          <div style={{ height: 1, background: 'var(--br)', margin: '10px 0' }} />
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 6 }}>
            PROMEDIO POR RESERVA
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 32, fontWeight: 800, color: 'var(--g)' }}>{fmtMXN(avgTicket)}</div>
          <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 3 }}>
            Tour avg: {fmtMXN(tourBookings.length ? Math.round(tourRevMXN / tourBookings.length) : 0)}
          </div>
        </div>
      </div>

      {/* Transactions table */}
      <div className="card">
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
          ÚLTIMAS TRANSACCIONES
        </div>
        {(finished.length + tourBookings.length + drillBookings.length) === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--mt)' }}>Sin transacciones para este período</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Fecha','Hora','Cliente','Cancha','Tipo','Personas','Hotel/Ciudad','Monto'].map(h => (
                  <th key={h} style={{ fontSize: 10, color: 'var(--mt)', letterSpacing: '.06em', padding: '0 6px 8px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ...finished.map(b => ({ ...b, _type: 'court' })),
                ...tourBookings.map(b => ({ ...b, _type: 'tour', name: b.client_name, revenue: b.total_mxn, people: (parseInt(b.package)||2) + (b.extra_pax||0), city: b.hotel })),
                ...drillBookings
                  .filter(b => b.revenue_collected && !b.pre_system_payment)
                  .map(b => ({ ...b, _type: 'drill', name: b.client_name, revenue: b.total_mxn, people: b.people || 1, city: b.notes || '—', modality: b.type })),
              ]
                .sort((a, b) => b.date?.localeCompare(a.date))
                .slice(0, 20)
                .map((b, idx) => (
                  <tr key={`${b._type}-${b.id}-${idx}`}>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.date}</td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.hour}:00</td>
                    <td style={{ fontSize: 12, fontWeight: 500, padding: '7px 6px', borderTop: '1px solid var(--br)' }}>
                      {b._type === 'tour' ? `🏓 ${b.name}` : b.modality === 'openplay' ? `👥 ${b.name}` : b.name}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>C{b.court}</td>
                    <td style={{ padding: '7px 6px', borderTop: '1px solid var(--br)' }}>
                      <span style={{
                        display: 'inline-block', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 4,
                        background: b._type === 'drill' ? '#1e1535' : b._type === 'tour' ? '#1a2e10' : b.modality === 'privada' ? 'var(--glight)' : '#0d1e35',
                        color:      b._type === 'drill' ? '#c8a8f0' : b._type === 'tour' ? '#c8e86b' : b.modality === 'privada' ? 'var(--g)' : 'var(--bl)'
                      }}>
                        {b._type === 'drill' ? `Drill ${b.modality}` : b._type === 'tour' ? `Tour ${b.package}` : b.modality === 'privada' ? 'Privada' : 'Open Play'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.people}p</td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.city || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, padding: '7px 6px', borderTop: '1px solid var(--br)',
                      color: b._type === 'drill' ? '#c8a8f0' : b._type === 'tour' ? '#c8e86b' : 'var(--g)' }}>
                      {fmtMXN(b.revenue)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
