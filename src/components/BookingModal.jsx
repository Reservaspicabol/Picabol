import { useState } from 'react'

// mode: 'walkin' | 'openplay'
export default function BookingModal({ court, date, mode, onSave, onClose }) {
  const [name,       setName]       = useState('')   // nombre del titular
  const [roomName,   setRoomName]   = useState('')   // nombre de la sala (open play)
  const [city,       setCity]       = useState('')
  const [selCourt,   setSelCourt]   = useState(court || 1)
  const [duration,   setDuration]   = useState(1)
  const [gM,         setGM]         = useState(0)
  const [gF,         setGF]         = useState(0)
  const [gK,         setGK]         = useState(0)
  const [notes,      setNotes]      = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  // Open play: lista de nombres de jugadores (opcionales)
  const [playerInput, setPlayerInput] = useState('')
  const [players,     setPlayers]     = useState([])

  const total      = gM + gF + gK
  const isOpenPlay = mode === 'openplay'

  // Para open play, el total de personas es el máximo entre
  // lo que dice el contador H/M/N y el array de nombres
  const opPeople = Math.max(total, players.length)

  function getRevenue() {
    if (isOpenPlay) return 200 * opPeople
    if (duration === 1.5) return 600
    if (duration === 2)   return 750
    if (duration === 2.5) return 950
    return 400
  }

  function addPlayer() {
    const n = playerInput.trim()
    if (!n) return
    setPlayers(prev => [...prev, n])
    setPlayerInput('')
    // Sincronizar contador con la cantidad de jugadores nombrados
    // si hay más nombres que el contador, ajustar gM para que coincida
    const newCount = players.length + 1
    if (newCount > total) {
      setGM(prev => prev + 1)
    }
  }

  function removePlayer(i) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
    // Ajustar contador hacia abajo si corresponde
    if (players.length - 1 < total) {
      setGM(prev => Math.max(0, prev - 1))
    }
  }

  async function handleSave() {
    if (!isOpenPlay && !name.trim()) return setError('Ingresa el nombre del titular')
    if (isOpenPlay && !roomName.trim()) return setError('Ingresa el nombre de la sala')
    if (isOpenPlay && opPeople === 0) return setError('Agrega al menos 1 persona')
    setSaving(true)
    setError('')

    // Armar array final de jugadores: los nombrados + anonimos con etiqueta
    const finalPlayers = [...players]
    const anonymous = opPeople - players.length
    for (let i = 0; i < anonymous; i++) {
      finalPlayers.push(`Jugador ${players.length + i + 1}`)
    }

    const payload = {
      date,
      hour:             new Date().getHours(),
      start_minute:     0,
      court:            selCourt,
      modality:         isOpenPlay ? 'openplay' : 'privada',
      // Para open play: el campo name guarda el nombre de la sala
      name:             isOpenPlay ? roomName.trim() : name.trim(),
      city:             city.trim() || null,
      people:           isOpenPlay ? opPeople : total || 1,
      gender_m:         gM,
      gender_f:         gF,
      gender_k:         gK,
      notes:            notes.trim() || null,
      notes_players:    isOpenPlay ? JSON.stringify(finalPlayers) : '[]',
      duration:         isOpenPlay ? 3 : duration,
      scheduled_at:     new Date().toISOString(),
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
        <button type="button" className="btn btn-ghost btn-sm"
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(Math.max(0, value - 1)) }}>
          −
        </button>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 18, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
          {value}
        </div>
        <button type="button" className="btn btn-ghost btn-sm"
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

        {/* ── OPEN PLAY ── */}
        {isOpenPlay && (
          <>
            {/* Nombre de la sala */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Nombre de la sala *</label>
              <input className="form-input" value={roomName} onChange={e => setRoomName(e.target.value)}
                placeholder="Ej: Los Jaguares, Sala Tarde, etc." />
              <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 4 }}>
                Este nombre identifica la sala en el calendario y el reporte.
              </div>
            </div>

            {/* Nombre del titular (opcional) */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Titular que abre la sala <span style={{ color: 'var(--mt)', fontWeight: 400 }}>(opcional)</span></label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Nombre del responsable..." />
            </div>

            {/* Contador de personas */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">
                Personas que ingresan ahora
                <span style={{ color: 'var(--g)', fontWeight: 600, marginLeft: 8 }}>
                  {opPeople} persona{opPeople !== 1 ? 's' : ''} · ${getRevenue()} MXN
                </span>
              </label>
              <div style={{ marginTop: 8, background: 'var(--sf)', borderRadius: 8, padding: '10px 12px' }}>
                <Counter label="Hombres" value={gM} onChange={v => { setGM(v) }} />
                <Counter label="Mujeres" value={gF} onChange={v => { setGF(v) }} />
                <Counter label="Niños"   value={gK} onChange={v => { setGK(v) }} />
              </div>
            </div>

            {/* Lista de jugadores con nombres (opcionales) */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">
                Nombres de jugadores <span style={{ color: 'var(--mt)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 8 }}>
                Puedes agregar nombres ahora o después desde la sala. El contador de arriba es lo que manda.
              </div>

              {/* Chips de jugadores */}
              {players.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {players.map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#0d2010', border: '1px solid var(--g)',
                      borderRadius: 6, padding: '4px 8px', fontSize: 12,
                    }}>
                      <span style={{ color: 'var(--g)', fontWeight: 500 }}>{p}</span>
                      <span style={{ fontSize: 11, color: 'var(--mt)' }}>$200</span>
                      <button type="button" onClick={() => removePlayer(i)}
                        style={{ border: 'none', background: 'none', color: 'var(--mt)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input agregar nombre */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={playerInput}
                  onChange={e => setPlayerInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlayer() } }}
                  placeholder="Nombre del jugador (Enter para agregar)..."
                  style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost"
                  onClick={addPlayer}
                  style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  + Agregar
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── WALK-IN (privada) ── */}
        {!isOpenPlay && (
          <>
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
          </>
        )}

        {/* Notas — ambos modos */}
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
