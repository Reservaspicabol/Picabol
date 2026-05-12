import { useState } from 'react'

/**
 * OpenPlayRoomModal
 *
 * Se muestra cuando el usuario edita (o hace check-in de) una reserva
 * con modality === 'openplay'.
 *
 * Props:
 *   booking      — objeto completo de la reserva desde Supabase
 *   onUpdate     — async fn(id, updates) → { error }   (viene de useBookings.updateBooking)
 *   onStartPlay  — async fn(id)           → { error }   (viene de useBookings.startPlay)
 *   onFinish     — async fn(id)           → { error }   (viene de useBookings.finishPlay)
 *   onClose      — fn()
 */
export default function OpenPlayRoomModal({ booking, onUpdate, onStartPlay, onFinish, onClose }) {
  // ── estado local de la lista de nombres ──────────────────────────────────
  // El campo `notes` de la reserva guarda los nombres como JSON array.
  // Si no hay nada guardado, se inicializa vacío.
  function parseNames(booking) {
    try {
      const parsed = JSON.parse(booking.notes_players || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const [players,  setPlayers]  = useState(() => parseNames(booking))
  const [inputVal, setInputVal] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // Estado derivado del booking
  const isPlaying  = booking.status === 'playing'
  const isFinished = booking.status === 'finished' || booking.status === 'cancelled'
  const frozenAt   = booking.people_at_checkin ?? null   // guardado al hacer check-in

  // Jugadores congelados = los que estaban al hacer check-in
  // Sólo disponible cuando ya se hizo check-in
  const frozenCount = isPlaying || isFinished
    ? (frozenAt ?? players.length)
    : null

  const total   = players.length
  const revenue = total * 200

  // ── helpers UI ───────────────────────────────────────────────────────────
  const COLORS = ['info', 'warning', 'success', 'danger']
  function colorFor(i) { return COLORS[i % COLORS.length] }
  function initials(name) {
    return name.trim().split(' ').slice(0, 2)
      .map(w => w[0]?.toUpperCase() || '').join('') || '?'
  }

  // ── acciones ─────────────────────────────────────────────────────────────
  function addPlayer() {
    const name = inputVal.trim()
    if (!name) return
    if (isFinished) return
    setPlayers(prev => [...prev, name])
    setInputVal('')
  }

  function removePlayer(i) {
    // Solo se puede quitar si aún no hubo check-in
    if (isPlaying || isFinished) return
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleCheckin() {
    if (players.length === 0) return setError('Agrega al menos 1 jugador antes del check-in')
    setSaving(true)
    setError('')
    const { error: err } = await onUpdate(booking.id, {
      people:             players.length,
      people_at_checkin:  players.length,
      revenue:            players.length * 200,
      notes_players:      JSON.stringify(players),
    })
    if (err) { setError(err.message); setSaving(false); return }
    const { error: err2 } = await onStartPlay(booking.id)
    if (err2) setError(err2.message)
    setSaving(false)
  }

  async function handleAddWhilePlaying() {
    const name = inputVal.trim()
    if (!name) return
    if (isFinished) return
    const newPlayers = [...players, name]
    setPlayers(newPlayers)
    setInputVal('')
    setSaving(true)
    setError('')
    const { error: err } = await onUpdate(booking.id, {
      people:        newPlayers.length,
      revenue:       newPlayers.length * 200,
      notes_players: JSON.stringify(newPlayers),
    })
    if (err) setError(err.message)
    setSaving(false)
  }

  async function handleFinish() {
    setSaving(true)
    setError('')
    // Guardar estado final antes de cerrar
    const { error: err } = await onUpdate(booking.id, {
      people:        players.length,
      revenue:       players.length * 200,
      notes_players: JSON.stringify(players),
    })
    if (err) { setError(err.message); setSaving(false); return }
    const { error: err2 } = await onFinish(booking.id)
    if (err2) { setError(err2.message); setSaving(false); return }
    setSaving(false)
    onClose()
  }

  async function handleSavePending() {
    setSaving(true)
    setError('')
    const { error: err } = await onUpdate(booking.id, {
      people:        players.length,
      revenue:       players.length * 200,
      notes_players: JSON.stringify(players),
    })
    if (err) setError(err.message)
    setSaving(false)
    if (!err) onClose()
  }

  // ── render ────────────────────────────────────────────────────────────────
  const s = {
    overlay: {
      background: 'rgba(0,0,0,.65)',
      borderRadius: 12,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: 20,
      minHeight: 400,
    },
    card: {
      background: 'var(--cd)',
      border: '1px solid var(--br)',
      borderRadius: 10,
      padding: 18,
      width: '100%',
      maxWidth: 500,
    },
    header: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    badge: (status) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 5,
      marginBottom: 5,
      ...(status === 'reserved'  ? { background: '#1e2a1e', color: 'var(--mt)',  border: '1px solid var(--br)' } :
          status === 'playing'   ? { background: '#0d2010', color: 'var(--g)',   border: '1px solid var(--g)' } :
          status === 'finished'  ? { background: '#0d1a2e', color: '#5b9bd5',    border: '1px solid #2a4a6e' } :
                                   { background: '#2e0d0d', color: 'var(--rd)',   border: '1px solid #5a1a1a' }),
    }),
    revenueBlock: {
      textAlign: 'right',
    },
    revenueLabel: {
      fontSize: 10,
      color: 'var(--mt)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    revenueAmount: {
      fontFamily: 'var(--font-cond)',
      fontSize: 26,
      fontWeight: 700,
      color: 'var(--g)',
    },
    frozenNote: {
      fontSize: 10,
      color: 'var(--mt)',
      marginTop: 2,
    },
    divider: {
      border: 'none',
      borderTop: '1px solid var(--br)',
      margin: '12px 0',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 8,
      marginBottom: 14,
    },
    stat: {
      background: 'var(--sf)',
      borderRadius: 8,
      padding: '10px 12px',
    },
    statLabel: {
      fontSize: 10,
      color: 'var(--mt)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: 3,
    },
    statVal: {
      fontFamily: 'var(--font-cond)',
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--fg)',
    },
    statSub: {
      fontSize: 10,
      color: 'var(--mt)',
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: 10,
      color: 'var(--mt)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: 8,
    },
    playersGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 12,
      minHeight: 40,
    },
    chip: (locked) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      background: locked ? 'var(--sf)' : '#1a2a1a',
      border: locked ? '1px solid var(--br)' : '1px solid var(--g)',
      borderRadius: 7,
      padding: '6px 10px',
      fontSize: 12,
      opacity: locked ? 0.7 : 1,
    }),
    avatar: (colorKey) => ({
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: `var(--${colorKey}-bg, #1a2a3a)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 9,
      fontWeight: 600,
      color: `var(--${colorKey}-fg, #5b9bd5)`,
      flexShrink: 0,
    }),
    addRow: {
      display: 'flex',
      gap: 8,
      marginBottom: 12,
    },
    notice: {
      background: '#1a2010',
      border: '1px solid var(--g)',
      borderRadius: 7,
      padding: '8px 12px',
      fontSize: 11,
      color: 'var(--g)',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    finishedBox: {
      background: '#0d1a2e',
      border: '1px solid #2a4a6e',
      borderRadius: 7,
      padding: '10px 14px',
      marginBottom: 12,
    },
    actionRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingTop: 12,
      borderTop: '1px solid var(--br)',
    },
    errorBox: {
      background: '#2e0d0d',
      border: '1px solid #5a1a1a',
      color: 'var(--rd)',
      borderRadius: 6,
      padding: '7px 12px',
      fontSize: 12,
      marginBottom: 10,
    },
  }

  const statusLabel = isFinished ? 'Terminado' : isPlaying ? 'En juego' : 'Pendiente'

  return (
    <div style={s.overlay}>
      <div style={s.card}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <div style={s.badge(booking.status)}>{statusLabel}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 20, fontWeight: 700 }}>
              Cancha {booking.court} · Open Play
            </div>
            <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>
              {booking.name} · {booking.hour}:00 – {booking.hour + 3}:00 · 3 horas
            </div>
          </div>
          <div style={s.revenueBlock}>
            <div style={s.revenueLabel}>Revenue sala</div>
            <div style={s.revenueAmount}>${revenue.toLocaleString('es-MX')}</div>
            {(isPlaying || isFinished) && frozenCount !== null && (
              <div style={s.frozenNote}>
                🔒 base ${(frozenCount * 200).toLocaleString('es-MX')} al check-in
              </div>
            )}
          </div>
        </div>

        <hr style={s.divider} />

        {/* ── Stats ── */}
        <div style={s.statsGrid}>
          <div style={s.stat}>
            <div style={s.statLabel}>Jugadores</div>
            <div style={s.statVal}>{total}</div>
            <div style={s.statSub}>{Math.min(Math.round(total / 8 * 100), 100)}% capacidad</div>
          </div>
          <div style={s.stat}>
            <div style={s.statLabel}>Tarifa</div>
            <div style={s.statVal}>$200</div>
            <div style={s.statSub}>MXN por persona</div>
          </div>
          <div style={s.stat}>
            <div style={s.statLabel}>{isPlaying ? 'Post check-in' : isFinished ? 'Total final' : 'Siguiente'}</div>
            <div style={s.statVal}>
              {isPlaying
                ? `+${total - (frozenCount ?? 0)}`
                : isFinished
                  ? `$${revenue.toLocaleString('es-MX')}`
                  : `$${(revenue + 200).toLocaleString('es-MX')}`}
            </div>
            <div style={s.statSub}>
              {isPlaying ? 'jugadores desde check-in' : isFinished ? 'sumado al reporte' : 'al agregar 1 más'}
            </div>
          </div>
        </div>

        {/* ── Notice según estado ── */}
        {isPlaying && (
          <div style={s.notice}>
            🔒 Base congelada en {frozenCount} jugador{frozenCount !== 1 ? 'es' : ''}
            (${(frozenCount * 200).toLocaleString('es-MX')} MXN).
            Puedes seguir sumando — ya no se puede quitar a nadie.
          </div>
        )}

        {isFinished && (
          <div style={s.finishedBox}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5b9bd5', marginBottom: 3 }}>
              ✓ Sala cerrada — revenue sumado al reporte
            </div>
            <div style={{ fontSize: 11, color: '#4a7ab5' }}>
              {total} jugadores · ${revenue.toLocaleString('es-MX')} MXN
            </div>
          </div>
        )}

        {/* ── Lista jugadores ── */}
        <div style={s.sectionLabel}>Jugadores en la sala</div>
        <div style={s.playersGrid}>
          {players.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--mt)', padding: '6px 0' }}>
              Sin jugadores — agrega el primero abajo
            </div>
          )}
          {players.map((name, i) => {
            const locked = (isPlaying || isFinished) && i < (frozenCount ?? 0)
            return (
              <div key={i} style={s.chip(locked)}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: locked ? 'var(--sf)' : '#0d2010',
                  border: '1px solid ' + (locked ? 'var(--br)' : 'var(--g)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                  color: locked ? 'var(--mt)' : 'var(--g)',
                }}>
                  {initials(name)}
                </div>
                <span style={{ fontSize: 12, color: locked ? 'var(--mt)' : 'var(--fg)', fontWeight: locked ? 400 : 500 }}>
                  {name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--g)' }}>$200</span>
                {!locked && !isFinished && (
                  <button
                    type="button"
                    onClick={() => removePlayer(i)}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: 'var(--mt)', fontSize: 13, padding: '0 2px', lineHeight: 1,
                    }}
                    aria-label={`Quitar ${name}`}
                  >
                    ×
                  </button>
                )}
                {locked && (
                  <span style={{ fontSize: 11, color: 'var(--mt)' }}>🔒</span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Campo agregar jugador ── */}
        {!isFinished && (
          <div style={s.addRow}>
            <input
              className="form-input"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  isPlaying ? handleAddWhilePlaying() : addPlayer()
                }
              }}
              placeholder={isPlaying ? 'Nombre del jugador que llega...' : 'Nombre del jugador...'}
              disabled={isFinished}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-green"
              onClick={isPlaying ? handleAddWhilePlaying : addPlayer}
              disabled={isFinished || saving}
              style={{ whiteSpace: 'nowrap' }}
            >
              + Agregar
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Acciones ── */}
        <div style={s.actionRow}>
          {/* Izquierda: acción principal según estado */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isPlaying && !isFinished && (
              <button
                type="button"
                className="btn btn-green"
                onClick={handleCheckin}
                disabled={saving || players.length === 0}
              >
                ▶ Check-in / Jugar
              </button>
            )}
            {isPlaying && (
              <button
                type="button"
                className="btn"
                style={{ background: '#2e0d0d', border: '1px solid #5a1a1a', color: 'var(--rd)' }}
                onClick={handleFinish}
                disabled={saving}
              >
                ■ Cerrar sala
              </button>
            )}
          </div>

          {/* Derecha: cancelar / guardar */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {isFinished ? 'Cerrar' : 'Cancelar'}
            </button>
            {!isPlaying && !isFinished && (
              <button
                type="button"
                className="btn btn-green"
                onClick={handleSavePending}
                disabled={saving}
                style={{ opacity: 0.85 }}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
