import { useState } from 'react'

// mode: 'walkin' | 'openplay'
export default function BookingModal({ court, date, mode, onSave, onClose }) {
  const [name,     setName]     = useState('')
  const [city,     setCity]     = useState('')
  const [selCourt, setSelCourt] = useState(court || 1)
  const [duration, setDuration] = useState(1)
  const [gM,       setGM]       = useState(0)
  const [gF,       setGF]       = useState(0)
  const [gK,       setGK]       = useState(0)
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [opMode,   setOpMode]   = useState('create')
  const [roomName, setRoomName] = useState('')

  const total      = gM + gF + gK
  const isOpenPlay = mode === 'openplay'

  function getRevenue() {
    if (isOpenPlay) return 200 * total
    if (duration === 1.5) return 600
    if (duration === 2)   return 750
    if (duration === 2.5) return 950
    return 400
  }

  async function handleSave() {
    if (!isOpenPlay && !name.trim()) return setError('Ingresa el nombre')
    if (isOpenPlay && !roomName.trim()) return setError('Ingresa el nombre de la sala')
    if (total === 0) return setError('Agrega al menos 1 persona')
    setSaving(true)
    setError('')
    const payload = {
      date,
      hour:         new Date().getHours(),
      start_minute: 0,
      court:        selCourt,
      modality:     isOpenPlay ? 'openplay' : 'privada',
      name:         isOpenPlay ? roomName.trim() : name.trim(),
      city:         city.trim() || null,
      people:       total,
      gender_m:     gM,
      gender_f:     gF,
      gender_k:     gK,
      notes:        notes.trim() || null,
      duration:     isOpenPlay ? 3 : duration,
      scheduled_at: new Date().toISOString(),
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(Math.max(0, value - 1)) }}>
          −
        </button>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
          {value}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(value + 1) }}>
          +
        </button>
      </div>
    )
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
          {isOpenPlay ? `Open Play · Cancha ${court}` : `Walk-in · Cancha ${court}`}
        </div>

        {isOpenPlay && (
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">¿Qué deseas hacer?</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {[
                { val: 'create', label: '🎾 Crear sala nueva' },
                { val: 'join',   label: '👥 Unirse a sala existente' },
              ].map(m => (
                <button key={m.val} type="button" onClick={() => setOpMode(m.val)}
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

        {isOpenPlay && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">{opMode === 'create' ? 'Nombre de la sala' : 'Sala a la que se une'}</label>
            <input className="form-input" value={roomName} onChange={e => setRoomName(e.target.value)}
              placeholder={opMode === 'create' ? 'Ej: Sala Lunes Tarde' : 'Nombre de sala existente'} />
          </div>
        )}

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

        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Cancha</label>
          <select className="form-select" value={selCourt} onChange={e => setSelCourt(+e.target.value)}>
            {[1,2,3,4].map(c => <option key={c} value={c}>Cancha {c}</option>)}
          </select>
        </div>

        {!isOpenPlay && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Duración</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {[
                { dur: 1,   label: '1h · $400' },
                { dur: 1.5, label: '1.5h · $600' },
                { dur: 2,   label: '2h · $750' },
                { dur: 2.5, label: '2.5h · $950' },
              ].map(m => (
                <button key={m.dur} type="button" onClick={() => setDuration(m.dur)}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 6, fontSize: 11,
                    border: duration === m.dur ? '1px solid var(--g)' : '1px solid var(--br)',
                    background: duration === m.dur ? 'var(--glight)' : '#2a2a2a',
                    color: duration === m.dur ? 'var(--g)' : 'var(--mt)',
                    cursor: 'pointer', minWidth: '40%'
                  }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Personas que ingresan</label>
          <div style={{ marginTop: 8, background: 'var(--sf)', borderRadius: 8, padding: '10px 12px' }}>
            <Counter label="Hombres" value={gM} onChange={setGM} />
            <Counter label="Mujeres" value={gF} onChange={setGF} />
            <Counter label="Niños"   value={gK} onChange={setGK} />
          </div>
          {total > 0 && (
            <div style={{ fontSize: 11, color: 'var(--g)', marginTop: 6, fontWeight: 600 }}>
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
          <button type="button" className="btn btn-green" onClick={handleSave} disabled={saving}
            style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : 'Registrar ingreso'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
