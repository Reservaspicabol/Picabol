import { useState } from 'react'
import { HOURS } from '../lib/utils'

export default function BookingModal({ court, hour, date, onSave, onClose }) {
  const [name,     setName]     = useState('')
  const [city,     setCity]     = useState('')
  const [modality, setModality] = useState('privada')
  const [selCourt, setSelCourt] = useState(court || 1)
  const [selHour,  setSelHour]  = useState(hour  || 10)
  const [gM,       setGM]       = useState(0)
  const [gF,       setGF]       = useState(0)
  const [gK,       setGK]       = useState(0)
  const [notes,    setNotes]    = useState('')
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const total = gM + gF + gK

  async function handleSave() {
    if (!name.trim())   return setError('Ingresa el nombre')
    if (total === 0)    return setError('Agrega al menos 1 persona')
    setSaving(true)
    setError('')
    const payload = {
      date,
      hour: selHour,
      court: selCourt,
      modality,
      name: name.trim(),
      city: city.trim() || null,
      people: total,
      gender_m: gM,
      gender_f: gF,
      gender_k: gK,
      notes: notes.trim() || null,
      scheduled_at: new Date().toISOString(),
    }
    const err = await onSave(payload)
    if (err) setError(err.message)
    setSaving(false)
  }

  const inputRow = { marginBottom: 12 }
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }

  function Counter({ label, value, onChange }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--mt)', minWidth: 56 }}>{label}</div>
        <button className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}
          onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
          {value}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width: 24, height: 24, padding: 0, justifyContent: 'center' }}
          onClick={() => onChange(value + 1)}>+</button>
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
        borderRadius: 10, padding: 18, width: '100%', maxWidth: 420
      }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
          {court ? `Nueva reserva · Cancha ${court}` : 'Nuevo ingreso'}
        </div>

        <div style={grid2}>
          <div>
            <label className="form-label">Nombre</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del cliente" />
          </div>
          <div>
            <label className="form-label">Ciudad de origen</label>
            <input className="form-input" value={city} onChange={e => setCity(e.target.value)} placeholder="Cancún..." />
          </div>
        </div>

        <div style={grid2}>
          <div>
            <label className="form-label">Cancha</label>
            <select className="form-select" value={selCourt} onChange={e => setSelCourt(+e.target.value)}>
              {[1,2,3,4].map(c => <option key={c} value={c}>Cancha {c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Hora</label>
            <select className="form-select" value={selHour} onChange={e => setSelHour(+e.target.value)}>
              {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
        </div>

        <div style={inputRow}>
          <label className="form-label">Modalidad</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {[
              { val: 'privada',  label: 'Cancha privada · $400' },
              { val: 'openplay', label: 'Open Play · $200/p' },
            ].map(m => (
              <button
                key={m.val}
                onClick={() => setModality(m.val)}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                  border: modality === m.val ? '1px solid var(--g)' : '1px solid var(--br)',
                  background: modality === m.val ? 'var(--glight)' : '#2a2a2a',
                  color: modality === m.val ? 'var(--g)' : 'var(--mt)',
                  cursor: 'pointer'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={inputRow}>
          <label className="form-label">Personas que ingresan</label>
          <div style={{ marginTop: 6 }}>
            <Counter label="Hombres" value={gM} onChange={setGM} />
            <Counter label="Mujeres" value={gF} onChange={setGF} />
            <Counter label="Niños"   value={gK} onChange={setGK} />
          </div>
          {total > 0 && (
            <div style={{ fontSize: 11, color: 'var(--g)', marginTop: 2 }}>
              Total: {total} persona{total > 1 ? 's' : ''} ·{' '}
              {modality === 'privada' ? '$400 total' : `$${200 * total} total`}
            </div>
          )}
        </div>

        <div style={inputRow}>
          <label className="form-label">Notas (opcional)</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Cumpleaños, grupo especial..." />
        </div>

        {error && (
          <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)', borderRadius: 6, padding: '7px 12px', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-green" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
            {saving ? 'Guardando...' : 'Registrar y asignar'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
