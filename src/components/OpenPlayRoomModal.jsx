import { useState } from 'react'

export default function OpenPlayRoomModal({ booking, onUpdate, onStartPlay, onFinish, onClose, onDelete, confirmDelete, onCancelDelete }) {

  function parseInitialPlayers(b) {
    try {
      const parsed = JSON.parse(b.notes_players || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* noop */ }
    const count = parseInt(b.people) || 0
    return Array.from({ length: count }, (_, i) => `Jugador ${i + 1}`)
  }

  const [players,  setPlayers]  = useState(() => parseInitialPlayers(booking))
  const [inputVal, setInputVal] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const isPlaying  = booking.status === 'playing'
  const isFinished = booking.status === 'finished' || booking.status === 'cancelled'
  const frozenCount = (isPlaying || isFinished) ? (booking.people_at_checkin ?? players.length) : 0
  const total   = players.length
  const revenue = total * 200

  function initials(name) {
    if (!name || name.startsWith('Jugador ')) return '#'
    return name.trim().split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
  }

  function buildNewName() {
    const trimmed = inputVal.trim()
    if (trimmed) return trimmed
    return `Jugador ${players.length + 1}`
  }

  function addPlayer() {
    if (isFinished) return
    setPlayers(prev => [...prev, buildNewName()])
    setInputVal('')
  }

  function removePlayer(i) {
    if (isPlaying || isFinished) return
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleCheckin() {
    if (players.length === 0) return setError('Agrega al menos 1 jugador antes del check-in')
    setSaving(true); setError('')
    const { error: e1 } = await onUpdate(booking.id, {
      people: players.length, people_at_checkin: players.length,
      revenue: players.length * 200, notes_players: JSON.stringify(players),
    })
    if (e1) { setError(e1.message); setSaving(false); return }
    const { error: e2 } = await onStartPlay(booking.id)
    if (e2) setError(e2.message)
    setSaving(false)
  }

  async function handleAddWhilePlaying() {
    if (isFinished) return
    const name = buildNewName()
    const newPlayers = [...players, name]
    setPlayers(newPlayers); setInputVal(''); setSaving(true); setError('')
    const { error: err } = await onUpdate(booking.id, {
      people: newPlayers.length, revenue: newPlayers.length * 200,
      notes_players: JSON.stringify(newPlayers),
    })
    if (err) setError(err.message)
    setSaving(false)
  }

  async function handleFinish() {
    setSaving(true); setError('')
    const { error: e1 } = await onUpdate(booking.id, {
      people: players.length, revenue: players.length * 200,
      notes_players: JSON.stringify(players),
    })
    if (e1) { setError(e1.message); setSaving(false); return }
    const { error: e2 } = await onFinish(booking.id)
    if (e2) { setError(e2.message); setSaving(false); return }
    setSaving(false); onClose()
  }

  async function handleSavePending() {
    setSaving(true); setError('')
    const { error: err } = await onUpdate(booking.id, {
      people: players.length, revenue: players.length * 200,
      notes_players: JSON.stringify(players),
    })
    if (err) setError(err.message)
    setSaving(false)
    if (!err) onClose()
  }

  const statusBadge = {
    reserved: { bg: '#1e2a1e', color: 'var(--mt)',  border: '1px solid var(--br)', label: 'Pendiente', icon: '⏳' },
    playing:  { bg: '#0d2010', color: 'var(--g)',   border: '1px solid var(--g)',  label: 'En juego',  icon: '▶' },
    finished: { bg: '#0d1a2e', color: '#5b9bd5',    border: '1px solid #2a4a6e',  label: 'Terminado', icon: '✓' },
    cancelled:{ bg: '#2e0d0d', color: 'var(--rd)',  border: '1px solid #5a1a1a',  label: 'Cancelado', icon: '✗' },
  }
  const bs = statusBadge[booking.status] || statusBadge.reserved

  return (
    <div style={{ background: 'rgba(0,0,0,.65)', borderRadius: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, minHeight: 400 }}>
      <div style={{ background: 'var(--cd)', border: '1px solid var(--br)', borderRadius: 10, padding: 18, width: '100%', maxWidth: 500 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 5, marginBottom: 6, background: bs.bg, color: bs.color, border: bs.border }}>
              {bs.icon} {bs.label}
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>Cancha {booking.court} - Open Play</div>
            <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>{booking.name} · {booking.hour}:00 – {booking.hour + 3}:00 · 3 horas</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue sala</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 26, fontWeight: 700, color: 'var(--g)' }}>${revenue.toLocaleString('es-MX')} MXN</div>
            {(isPlaying || isFinished) && (
              <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2 }}>🔒 base ${(frozenCount * 200).toLocaleString('es-MX')} al check-in</div>
            )}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--br)', margin: '0 0 14px' }} />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Jugadores</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>{total}</div>
            <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2 }}>{Math.min(Math.round(total / 8 * 100), 100)}% capacidad</div>
          </div>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Tarifa</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>$200</div>
            <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2 }}>MXN por persona</div>
          </div>
          <div style={{ background: 'var(--sf)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
              {isFinished ? 'Total final' : isPlaying ? 'Post check-in' : 'Con 1 más'}
            </div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>
              {isFinished ? `$${revenue.toLocaleString('es-MX')}` : isPlaying ? `+${total - frozenCount}` : `$${((total + 1) * 200).toLocaleString('es-MX')}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 2 }}>
              {isFinished ? 'sumado al reporte' : isPlaying ? 'jugadores desde check-in' : 'al agregar 1 más'}
            </div>
          </div>
        </div>

        {isPlaying && (
          <div style={{ background: '#1a2010', border: '1px solid var(--g)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'var(--g)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            🔒 Base congelada en {frozenCount} jugador{frozenCount !== 1 ? 'es' : ''} (${(frozenCount * 200).toLocaleString('es-MX')} MXN). Puedes seguir sumando — ya no se puede quitar a nadie.
          </div>
        )}

        {isFinished && (
          <div style={{ background: '#0d1a2e', border: '1px solid #2a4a6e', borderRadius: 7, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5b9bd5', marginBottom: 3 }}>✓ Sala cerrada — revenue sumado al reporte</div>
            <div style={{ fontSize: 11, color: '#4a7ab5' }}>{total} jugadores · ${revenue.toLocaleString('es-MX')} MXN</div>
          </div>
        )}

        {/* Lista jugadores */}
        <div style={{ fontSize: 10, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Jugadores en la sala</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12, minHeight: 40 }}>
          {players.length === 0 && <div style={{ fontSize: 12, color: 'var(--mt)', padding: '6px 0' }}>Sin jugadores — agrega el primero abajo</div>}
          {players.map((name, i) => {
            const locked = (isPlaying || isFinished) && i < frozenCount
            const isAnon = name.startsWith('Jugador ')
            const canRemove = !locked && !isFinished
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, background: locked ? 'var(--sf)' : '#1a2a1a', border: `1px solid ${locked ? 'var(--br)' : 'var(--g)'}`, borderRadius: 7, padding: '6px 10px', fontSize: 12, opacity: locked ? 0.75 : 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: locked ? 'var(--sf)' : '#0d2010', border: `1px solid ${locked ? 'var(--br)' : 'var(--g)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: locked ? 'var(--mt)' : 'var(--g)' }}>
                  {initials(name)}
                </div>
                <span style={{ fontSize: 12, color: isAnon ? 'var(--mt)' : locked ? 'var(--mt)' : 'var(--fg)', fontWeight: locked || isAnon ? 400 : 500, fontStyle: isAnon ? 'italic' : 'normal' }}>{name}</span>
                <span style={{ fontSize: 10, color: 'var(--g)' }}>$200</span>
                {canRemove && <button type="button" onClick={() => removePlayer(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--mt)', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>×</button>}
                {locked && <span style={{ fontSize: 10, color: 'var(--mt)' }}>🔒</span>}
              </div>
            )
          })}
        </div>

        {/* Agregar jugador */}
        {!isFinished && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <input className="form-input" value={inputVal} onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); isPlaying ? handleAddWhilePlaying() : addPlayer() } }}
                placeholder={isPlaying ? 'Nombre del jugador que llega... (opcional)' : 'Nombre del jugador... (opcional)'}
                style={{ flex: 1 }} />
              <button type="button" className="btn btn-green" onClick={isPlaying ? handleAddWhilePlaying : addPlayer} disabled={saving}>+ Agregar</button>
            </div>
            {!isPlaying && <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 12 }}>Nombre opcional — deja vacío para agregar jugador anónimo. Puedes quitar jugadores hasta el check-in.</div>}
          </>
        )}

        {error && <div style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)', borderRadius: 6, padding: '7px 12px', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {/* Acciones principales */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--br)', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isPlaying && !isFinished && (
              <button type="button" className="btn btn-green" onClick={handleCheckin} disabled={saving || players.length === 0}>▶ Check-in / Jugar</button>
            )}
            {isPlaying && (
              <button type="button" className="btn" onClick={handleFinish} disabled={saving} style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)' }}>■ Cerrar sala</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>{isFinished ? 'Cerrar' : 'Cancelar'}</button>
            {!isPlaying && !isFinished && (
              <button type="button" className="btn btn-green" onClick={handleSavePending} disabled={saving} style={{ opacity: 0.85 }}>{saving ? 'Guardando...' : 'Guardar'}</button>
            )}
          </div>
        </div>

        {/* ── ELIMINAR SALA ── */}
        {onDelete && !isFinished && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--br)' }}>
            {confirmDelete === booking.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#2e0d0d', border: '1px solid #5a1a1a', borderRadius: 7, padding: '10px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--rd)', flex: 1 }}>¿Eliminar esta sala? Esta acción no se puede deshacer.</span>
                <button className="btn btn-red btn-sm" onClick={() => onDelete(booking.id)}>Sí, eliminar</button>
                <button className="btn btn-ghost btn-sm" onClick={onCancelDelete}>Cancelar</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => onDelete(booking.id)}
                style={{ color: 'var(--rd)', borderColor: 'var(--rd)', width: '100%', justifyContent: 'center' }}>
                🗑 Eliminar sala
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
