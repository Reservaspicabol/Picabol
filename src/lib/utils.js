import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

export const HOURS = Array.from({ length: 15 }, (_, i) => i + 7)   // 7–21
export const COURTS = [1, 2, 3, 4]
export const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
export const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
export const TOLERANCE_MS   = 10 * 60 * 1000   // 10 min
export const WARN_BEFORE_MS = 10 * 60 * 1000   // aviso a 10 min del fin
export const HOUR_MS        = 60 * 60 * 1000
export const OPENPLAY_HOURS = 3

export function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function ymd(date) {
  return format(date, 'yyyy-MM-dd')
}

export function pad(n) {
  return String(n).padStart(2, '0')
}

export function fmtMs(ms) {
  if (ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return h > 0
    ? `${h}:${pad(m % 60)}:${pad(s % 60)}`
    : `${pad(m % 60)}:${pad(s % 60)}`
}

export function fmtMXN(n) {
  return '$' + Number(n).toLocaleString('es-MX')
}

export function getWeekDays(weekOffset = 0) {
  const today = new Date()
  const mon = startOfWeek(today, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i + weekOffset * 7))
}

// Cuántos ms faltan para que termine una sesión en estado 'playing'
export function remainingMs(booking) {
  if (!booking.started_at) return 0
  const durationHours = booking.modality === 'openplay'
    ? 3
    : (parseFloat(booking.duration) || 1)
  const durationMs = durationHours * HOUR_MS
    + (booking.extra_minutes || 0) * 60 * 1000
  const elapsed = Date.now() - new Date(booking.started_at).getTime()
  return durationMs - elapsed
}

// Cuántos ms quedan en la ventana de tolerancia de 10 min
export function toleranceMs(booking) {
  if (!booking.scheduled_at) return TOLERANCE_MS
  const elapsed = Date.now() - new Date(booking.scheduled_at).getTime()
  return TOLERANCE_MS - elapsed
}

// Revenue esperado según modalidad y duración
export function revenueForBooking(booking) {
  if (booking.modality === 'openplay') return 200 * (booking.people || 1)
  const mins = Math.round((parseFloat(booking.duration) || 1) * 60)
  if (mins <= 60)  return 400
  if (mins <= 90)  return 600
  if (mins <= 120) return 750
  if (mins <= 150) return 950
  return 400
}

// Checks if a slot (date, court, hour) is blocked by an existing booking
export function isSlotBlocked(bookings, date, court, hour) {
  for (const b of bookings) {
    if (b.date !== date || b.court !== court) continue
    const slots = b.modality === 'openplay' ? OPENPLAY_HOURS : 1
    if (hour >= b.hour && hour < b.hour + slots) return b
  }
  return null
}
