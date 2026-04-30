import { useState } from 'react'
import { HOURS } from '../lib/utils'

// mode: 'walkin' | 'reserva' | 'openplay'
export default function BookingModal({ court, hour, date, mode, onSave, onClose }) {
  const [name,     setName]     = useState('')
  const [city,     setCity]     = useState('')
  const [modality, setModality] = useState(mode === 'openplay' ? 'openplay' : 'privada')
  const [selCourt, setSelCourt] = useState(court || 1)
  const [selHour,  setSelHour]  = useState(hour  || 10)
  const [selDate,  setSelDate]  = useState(date  || '')
  const [duration, setDuration] = useState(1)
  const [gM,       setGM]       = useState(0)
  const [gF,       setGF]       = useState(0)
  const [gK,       setGK]       = useState(0)
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  // Open Play specific
  const [opMode,   setOpMode]   = useState('create') // 'create' | 'join'
  const [roomName, setRoomName] = useState('')

  const total = gM + gF + gK
  const isWalkin  = mode === 'walkin'
  const isReserva = mode === 'reserva'
  const isOpenPlay = mode === 'openplay' || modality === 'openplay'

  function getRevenue() {
    if (isOpenPlay) return 200 * total
    if (form.duration === 1.5) return 600
    if (form.duration === 2)   return 750
    if (form.duration === 2.5) return 950
    return 400
  }

  async function handleSave() {
    if (!name.trim() && !isOpenPlay) return setError('Ingresa el nombre')
    if (isOpenPlay && !roomName.trim()) return setError('Ingresa el nombre de la sala')
    if (total === 0) return setError('Agrega al menos 1 persona')
    if (isReserva && !selDate) return setError('Selecciona una fecha')

    setSaving(true)
    setError('')

    const startHour   = Math.floor(selHour)
    const startMinute = selHour % 1 === 0.5 ? 30 : 0

    const payload = {
      date:         isReserva ? selDate : date,
      hour:         startHour,
      start_minute: startMinute,
      court:        selCourt,
      modality: isOpenPlay ? 'openplay' : 'privada',
      name:     isOpenPlay ? roomName.trim() : name.trim(),
      city:     city.trim() || null,
      people:   total,
      gender_m: gM,
      gender_f: gF,
      gender_k: gK,
      notes:    notes.trim() || null,
      duration: isOpenPlay ? 3 : duration,
      // Only set scheduled_at for walkin (immediate arrival expected)
      scheduled_at: isWalkin ? new Date().toISOString() : null,
    }
    const err = await onSave(payload)
    if (err) setError(err.message)
    setSaving(false)
  }

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }

  function Counter({ label, value, onChange }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--mt)', minWidth: 56 }}>{label}</div>
        <button className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}
          onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{value}</div>
        <button className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}
          onClick={() => onChange(value + 1)}>+</button>
      </div>
    )
  }

  const titleMap = {
    walkin:   `Walk-in · Cancha ${court}`,
    reserva:  'Nueva Reserva',
    openplay: `Open Play · Cancha ${court}`,
  }

  return (
    <div style={{
      background: 'rgba(0,0,0,.65)', borderRadius: 12,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 20, minHeight: 400
    }}>
      <div style={{
        background: 'var(--cd)', border: '1px solid var(--br)',
        borderRadius: 10, padding: 18, width: '100%', maxWidth: 480
      }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
          {titleMap[mode] || 'Nuevo ingreso'}
        </div>

        {/* Open Play mode selector */}
        {mode === 'openplay' && (
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">¿Qué deseas hacer?</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[
                { val: 'create', label: '🎾 Crear sala nueva' },
                { val: 'join',   label: '👥 Unirse a sala existente' },
              ].map(m => (
                <button key={m.val} onClick={() => setOpMode(m.val)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                    border: opMode === m.val ? '1px solid var(--g)' : '1px solid var(--br)',
                    background: opMode === m.val ? 'var(--glight)' : '#2a2a2a',
                    color: opMode === m.val ? 'var(--g)' : 'var(--mt)',
                    cursor: 'pointer', fontWeight: opMode === m.val ? 600 : 400
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open Play fields */}
        {mode === 'openplay' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">{opMode === 'create' ? 'Nombre de la sala' : 'Sala a la que se une'}</label>
            <input className="form-input" value={roomName} onChange={e => setRoomName(e.target.value)}
              placeholder={opMode === 'create' ? 'Ej: Sala Lunes Tarde' : 'Nombre de sala existente'} />
          </div>
        )}

        {/* Client name — not for open play create */}
        {mode !== 'openplay' && (
          <div style={grid2}>
            <div>
              <label className="form-label">Nombre del cliente</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" />
            </div>
            <div>
              <label className="form-label">Ciudad de origen</label>
              <input className="form-input" value={city} onChange={e => setCity(e.target.value)} placeholder="Cancún..." />
            </div>
          </div>
        )}

        {/* For open play join — client name */}
        {mode === 'openplay' && opMode === 'join' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Nombre del cliente</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" />
          </div>
        )}

        {/* Court + Hour */}
        <div style={grid2}>
          <div>
            <label className="form-label">Cancha</label>
            <select className="form-select" value={selCourt} onChange={e => setSelCourt(+e.target.value)}>
              {[1,2,3,4].map(c => <option key={c} value={c}>Cancha {c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Hora de inicio</label>
            <select className="form-select" value={selHour} onChange={e => setSelHour(+e.target.value)}>
              {HOURS.flatMap(h => [
                <option key={h} value={h}>{h}:00</option>,
                <option key={h+0.5} value={h+0.5}>{h}:30</option>
              ])}
            </select>
          </div>
        </div>

        {/* Date — only for reserva */}
        {mode === 'reserva' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Fecha de la reserva</label>
            <input type="date" className="form-input" value={selDate}
              min={date}
              onChange={e => setSelDate(e.target.value)} />
          </div>
        )}

        {/* Duration — only for privada */}
        {mode !== 'openplay' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Modalidad y duración</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {[
                { mod: 'privada',  dur: 1, label: 'Privada · 1h · $400' },
                { mod: 'privada',  dur: 2, label: 'Privada · 2h · $750' },
              ].map(m => (
                <button key={`${m.mod}-${m.dur}`}
                  onClick={() => { setModality(m.mod); setDuration(m.dur) }}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                    border: modality === m.mod && duration === m.dur ? '1px solid var(--g)' : '1px solid var(--br)',
                    background: modality === m.mod && duration === m.dur ? 'var(--glight)' : '#2a2a2a',
                    color: modality === m.mod && duration === m.dur ? 'var(--g)' : 'var(--mt)',
                    cursor: 'pointer'
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* People counters */}
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Personas que ingresan</label>
          <div style={{ marginTop: 6 }}>
            <Counter label="Hombres" value={gM} onChange={setGM} />
            <Counter label="Mujeres" value={gF} onChange={setGF} />
            <Counter label="Niños"   value={gK} onChange={setGK} />
          </div>
          {total > 0 && (
            <div style={{ fontSize: 11, color: 'var(--g)', marginTop: 4 }}>
              Total: {total} persona{total > 1 ? 's' : ''} · ${getRevenue()} MXN
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Notas (opcional)</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Cumpleaños, grupo especial..." />
        </div>

        {error && (
          <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)', borderRadius: 6, padding: '7px 12px', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : mode === 'reserva' ? 'Crear reserva' : 'Registrar ingreso'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
