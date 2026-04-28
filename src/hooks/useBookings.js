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
    // Calculate revenue
    const revenue = payload.modality === 'openplay'
      ? 200 * (payload.people || 1)
      : payload.duration === 2 ? 750 : 400

    // For walkin: status = 'reserved' with scheduled_at set (tolerance starts immediately)
    // For reserva: status = 'reserved' without scheduled_at (tolerance only starts on arrival)
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
      duration:     payload.duration || 1,
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
    // When play starts, set scheduled_at if not already set (for reserva mode)
    const booking = bookings.find(b => b.id === id)
    const updates = {
      status: 'playing',
      started_at: new Date().toISOString(),
    }
    // If no scheduled_at was set (reserva), set it now so tolerance calc works
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
    return updateBooking(id, { extra_minutes: (booking.extra_minutes || 0) + minutes })
  }

  async function setWaiting(id) {
    return updateBooking(id, {
      status: 'waiting',
      scheduled_at: new Date().toISOString()
    })
  }

  return {
    bookings, loading, refetch: fetch,
    createBooking, updateBooking, deleteBooking,
    startPlay, finishPlay, cancelBooking, expireBooking, addTime, setWaiting
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
