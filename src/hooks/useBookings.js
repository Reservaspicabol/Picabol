import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useBookings(date) {
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    if (!date) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', date)
      .order('hour')
    if (!error) setBookings(data || [])
    setLoading(false)
  }, [date])

  useEffect(() => {
    fetch()
    const channel = supabase
      .channel('bookings-' + date)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `date=eq.${date}`
      }, () => fetch())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [date, fetch])

  async function createBooking(payload) {
    function calcRevenue(modality, durationHours, people) {
      if (modality === 'openplay') return 200 * (people || 1)
      const mins = Math.round(durationHours * 60)
      if (mins <= 60)  return 400
      if (mins <= 90)  return 600
      if (mins <= 120) return 750
      if (mins <= 150) return 950
      return 400 + Math.ceil((mins - 60) / 30) * 200
    }
    const revenue = calcRevenue(payload.modality, payload.duration || 1, payload.people)
    const isWalkin = !!payload.scheduled_at

    const insertPayload = {
      date:         payload.date,
      hour:         payload.hour,
      court:        payload.court,
      modality:     payload.modality,
      name:         payload.name,
      city:         payload.city || null,
      people:       payload.people,
      gender_m:     payload.gender_m || 0,
      gender_f:     payload.gender_f || 0,
      gender_k:     payload.gender_k || 0,
      notes:        payload.notes || null,
      duration:     parseFloat(payload.duration || 1),
      revenue,
      status:       'reserved',
      scheduled_at: isWalkin ? payload.scheduled_at : null,
      created_by:   payload.created_by || null,
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select()
      .single()

    if (!error) setBookings(prev => [...prev, data])
    return { data, error }
  }

  async function updateBooking(id, updates) {
    const { data, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (!error) setBookings(prev => prev.map(b => b.id === id ? data : b))
    return { data, error }
  }

  async function deleteBooking(id) {
    const { error } = await supabase.from('bookings').delete().eq('id', id)
    if (!error) setBookings(prev => prev.filter(b => b.id !== id))
    return { error }
  }

  async function startPlay(id) {
    const booking = bookings.find(b => b.id === id)
    const updates = {
      status:     'playing',
      started_at: new Date().toISOString(),
    }
    if (!booking?.scheduled_at) {
      updates.scheduled_at = new Date().toISOString()
    }
    return updateBooking(id, updates)
  }

  async function finishPlay(id) {
    return updateBooking(id, { status: 'finished', finished_at: new Date().toISOString() })
  }

  async function cancelBooking(id) {
    return updateBooking(id, { status: 'cancelled' })
  }

  async function expireBooking(id) {
    return updateBooking(id, { status: 'expired' })
  }

  async function addTime(id, minutes) {
    const booking = bookings.find(b => b.id === id)
    if (!booking) return
    const extraRevenue = minutes === 30 ? 200 : minutes === 60 ? 400 : 0
    return updateBooking(id, {
      extra_minutes: (booking.extra_minutes || 0) + minutes,
      revenue:       Number(booking.revenue || 0) + extraRevenue
    })
  }

  async function setWaiting(id) {
    return updateBooking(id, {
      status:       'waiting',
      scheduled_at: new Date().toISOString()
    })
  }

  // Agrega un jugador a una sala open play (pending o playing).
  // Solo suma, nunca resta. Actualiza people + revenue + notes_players.
  async function addOpenPlayPlayer(id, playerName) {
    const booking = bookings.find(b => b.id === id)
    if (!booking) return { error: { message: 'Reserva no encontrada' } }
    let players = []
    try { players = JSON.parse(booking.notes_players || '[]') } catch { players = [] }
    players.push(playerName)
    return updateBooking(id, {
      people:        players.length,
      revenue:       players.length * 200,
      notes_players: JSON.stringify(players),
    })
  }

  return {
    bookings, loading, refetch: fetch,
    createBooking, updateBooking, deleteBooking,
    startPlay, finishPlay, cancelBooking, expireBooking,
    addTime, setWaiting,
    addOpenPlayPlayer,
  }
}

// Fetch bookings for a date range (for calendar/reports)
export async function fetchBookingsRange(from, to) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('hour')
  return { data: data || [], error }
}
