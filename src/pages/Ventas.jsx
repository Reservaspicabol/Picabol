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
  const [period,       setPeriod]       = useState('semana')
  const [bookings,     setBookings]     = useState([])
  const [tourBookings, setTourBookings] = useState([])
  const [loading,      setLoading]      = useState(true)

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

    const [b, t] = await Promise.all([
      fetchBookingsRange(from, to),
      supabase.from('tour_bookings').select('*').gte('date', from).lte('date', to).neq('status', 'cancelled'),
    ])
    setBookings(b.data || [])
    setTourBookings(t.data || [])
    setLoading(false)
  }

  // ── Regular bookings stats ────────────────────────────────────────────
  const finished  = bookings.filter(b => ['playing','finished'].includes(b.status))
  const privadas  = finished.filter(b => b.modality === 'privada')
  const opens     = finished.filter(b => b.modality === 'openplay')
  const privRev   = privadas.reduce((a, b) => a + Number(b.revenue || 0), 0)
  const openRev   = opens.reduce((a, b) => a + Number(b.revenue || 0), 0)
  const courtRev  = privRev + openRev

  // ── Tour stats ────────────────────────────────────────────────────────
  const confirmedTours = tourBookings.filter(b => b.status === 'confirmed')
  const tourRevMXN     = tourBookings.reduce((a, b) => a + Number(b.total_mxn || 0), 0)
  const tourDeposits   = tourBookings.reduce((a, b) => a + Number(b.deposit_mxn || 0), 0)
  const tourPeople     = tourBookings.reduce((a, b) => {
    const paxStr = b.package || ''
    const base   = parseInt(paxStr) || 2
    return a + base + (b.extra_pax || 0)
  }, 0)

  // ── Combined ──────────────────────────────────────────────────────────
  const totalRev  = courtRev + tourRevMXN
  const totalPpl  = finished.reduce((a, b) => a + (b.people || 0), 0) + tourPeople
  const gH        = finished.reduce((a, b) => a + (b.gender_m || 0), 0)
  const gF        = finished.reduce((a, b) => a + (b.gender_f || 0), 0)
  const gK        = finished.reduce((a, b) => a + (b.gender_k || 0), 0)
  const totalRes  = finished.length + tourBookings.length
  const avgTicket = totalRes ? Math.round(totalRev / totalRes) : 0

  // By day of week
  const days = getWeekDays(0)
  const byDay = days.map(d => {
    const ds      = ymd(d)
    const dayB    = finished.filter(b => b.date === ds)
    const dayT    = tourBookings.filter(b => b.date === ds)
    const courtR  = dayB.reduce((a, b) => a + Number(b.revenue || 0), 0)
    const tourR   = dayT.reduce((a, b) => a + Number(b.total_mxn || 0), 0)
    return {
      label: DAYS_ES[d.getDay()],
      rev: courtR + tourR, courtRev: courtR, tourRev: tourR,
      count: dayB.length + dayT.length,
      isToday: ds === format(new Date(), 'yyyy-MM-dd')
    }
  })
  const maxDayRev = Math.max(...byDay.map(d => d.rev), 1)

  // By hour
  const hourCounts = Array(15).fill(0)
  finished.forEach(b => { if (b.hour >= 7 && b.hour <= 21) hourCounts[b.hour - 7]++ })
  tourBookings.forEach(b => { if (b.hour >= 7 && b.hour <= 21) hourCounts[b.hour - 7]++ })
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

  // Donut: 3 segments now
  const r = 40, cx = 55, circ = 2 * Math.PI * r
  const privPct  = totalRev > 0 ? privRev / totalRev : 0
  const openPct  = totalRev > 0 ? openRev / totalRev : 0
  const tourPct  = totalRev > 0 ? tourRevMXN / totalRev : 0
  const privDash = privPct * circ
  const openDash = openPct * circ
  const tourDash = tourPct * circ

  const kpis = [
    {
      label: 'INGRESOS TOTALES', val: fmtMXN(totalRev), accent: 'var(--g)',
      sub: `Canchas: ${fmtMXN(courtRev)} · Tours: ${fmtMXN(tourRevMXN)}`
    },
    {
      label: 'RESERVAS TOTALES', val: totalRes, accent: 'var(--bl)',
      sub: `Canchas: ${finished.length} · Tours: ${tourBookings.length}`
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
              background: period === p.key ? 'var(--g)' : 'transparent',
              color: period === p.key ? '#0d1f00' : 'var(--mt)',
              borderColor: period === p.key ? 'var(--g)' : 'var(--br)',
              fontWeight: period === p.key ? 700 : 400
            }}>{p.label}</button>
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
            { label: 'Tours', val: tourBookings.length },
            { label: 'Confirmados', val: confirmedTours.length },
            { label: 'Ingreso Est.', val: fmtMXN(tourRevMXN) },
            { label: 'Depósitos', val: fmtMXN(tourDeposits) },
            { label: 'Balance', val: fmtMXN(tourRevMXN - tourDeposits) },
            { label: 'Personas', val: tourPeople },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 9, color: 'var(--mt)', letterSpacing: '.06em' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, color: 'var(--g)' }}>{s.val}</div>
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
              const h = Math.round(d.rev / maxDayRev * 100)
              const hCourt = Math.round(d.courtRev / maxDayRev * 100)
              const hTour  = Math.round(d.tourRev  / maxDayRev * 100)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ fontSize: 9, color: d.rev > 0 ? 'var(--mt)' : 'transparent', fontFamily: 'var(--font-cond)' }}>
                    {d.rev > 0 ? `$${(d.rev/1000).toFixed(1)}k` : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: 1, width: '100%' }}>
                    {/* Stacked bar: court + tour */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                      {d.tourRev > 0 && (
                        <div style={{ height: `${hTour}px`, minHeight: 3, background: '#c8e86b', width: '100%' }} />
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
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--mt)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--g)' }} /> Canchas
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--mt)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#c8e86b' }} /> Tours D&D
            </div>
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
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 800 }}>{fmtMXN(totalRev)}</div>
                <div style={{ fontSize: 9, color: 'var(--mt)' }}>total</div>
              </div>
            </div>
            {[
              { color: 'var(--g)',  label: 'Cancha privada', val: fmtMXN(privRev),    pct: Math.round(privPct*100), count: privadas.length },
              { color: 'var(--bl)', label: 'Open Play',      val: fmtMXN(openRev),    pct: Math.round(openPct*100), count: opens.length },
              { color: '#c8e86b',   label: 'Dink & Drink',   val: fmtMXN(tourRevMXN), pct: Math.round(tourPct*100), count: tourBookings.length },
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
        {/* Hour heatmap */}
        <div className="card">
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
            HORAS MÁS ACTIVAS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {hourCounts.map((v, i) => {
              const pct = v / maxHour
              const bg = v === 0 ? '#1e1e1e' : pct > .8 ? '#5A9418' : pct > .5 ? '#3d6b18' : pct > .2 ? '#2a4a10' : '#1e2e0d'
              const color = v === 0 ? '#333' : pct > .5 ? '#c8f080' : 'var(--g)'
              return (
                <div key={i} style={{ background: bg, color, borderRadius: 4, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 600 }}>
                  {i + 7}h
                </div>
              )
            })}
          </div>
        </div>

        {/* Cities */}
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

        {/* Gender + avg */}
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

      {/* Transactions table — combined */}
      <div className="card">
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 600, color: 'var(--mt)', letterSpacing: '.07em', marginBottom: 12 }}>
          ÚLTIMAS TRANSACCIONES
        </div>
        {(finished.length + tourBookings.length) === 0 ? (
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
                ...tourBookings.map(b => ({ ...b, _type: 'tour', name: b.client_name, revenue: b.total_mxn, people: (parseInt(b.package)||2) + (b.extra_pax||0), city: b.hotel }))
              ]
                .sort((a, b) => b.date?.localeCompare(a.date))
                .slice(0, 20)
                .map((b, idx) => (
                  <tr key={`${b._type}-${b.id}-${idx}`}>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.date}</td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.hour}:00</td>
                    <td style={{ fontSize: 12, fontWeight: 500, padding: '7px 6px', borderTop: '1px solid var(--br)' }}>
                      {b._type === 'tour' ? `🏓 ${b.name}` : b.modality === 'openplay' ? `Sala: ${b.name}` : b.name}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>C{b.court}</td>
                    <td style={{ padding: '7px 6px', borderTop: '1px solid var(--br)' }}>
                      <span style={{
                        display: 'inline-block', fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 4,
                        background: b._type === 'tour' ? '#1a2e10' : b.modality === 'privada' ? 'var(--glight)' : '#0d1e35',
                        color: b._type === 'tour' ? '#c8e86b' : b.modality === 'privada' ? 'var(--g)' : 'var(--bl)'
                      }}>
                        {b._type === 'tour' ? `Tour ${b.package}` : b.modality === 'privada' ? 'Privada' : 'Open Play'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>{b.people}p</td>
                    <td style={{ fontSize: 12, color: 'var(--mt)', padding: '7px 6px', borderTop: '1px solid var(--br)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.city || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, color: b._type === 'tour' ? '#c8e86b' : 'var(--g)', padding: '7px 6px', borderTop: '1px solid var(--br)' }}>
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
