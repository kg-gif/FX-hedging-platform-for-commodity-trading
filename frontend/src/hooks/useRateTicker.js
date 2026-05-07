/**
 * useRateTicker
 *
 * Connects to the backend WebSocket ticker and returns live rate data.
 * Automatically falls back to 5-second HTTP polling after MAX_RECONNECTS
 * failed WebSocket attempts.
 *
 * Returns { rates, connected, fallback }
 * where rates is { [pair]: { rate, change_pct, direction } }
 *
 * ── Why functions are defined inside useEffect ───────────────────────────────
 * The previous version used useCallback for connect/startPoll/stopPoll and
 * listed them as useEffect dependencies.  This created two bugs:
 *
 * 1. The `alive` guard was a shared useRef.  When the effect re-ran (because
 *    a useCallback reference changed), cleanup set alive.current = false, then
 *    the new effect immediately set it back to true.  The old connection's
 *    ws.onclose fired asynchronously AFTER alive was already true — so it
 *    scheduled another reconnect.  Result: ~8 overlapping connections.
 *
 * 2. connect → startPoll → companyId formed an unstable reference chain,
 *    so the effect re-ran on every render where companyId was passed in.
 *
 * Fix: all socket logic lives inside the effect as plain functions.  `alive`
 * is a local boolean captured in each effect's closure — each effect run has
 * its own private `alive`, so an old onclose can never interfere with a new
 * effect instance.  The effect depends only on [companyId].
 */
import { useEffect, useReducer, useRef } from 'react'
import { wsRates, fxRatesTicker } from '../utils/api'

const BROADCAST_INTERVAL_MS = 5_000
const RECONNECT_DELAY_MS     = 3_000
const MAX_RECONNECTS         = 5

function reducer(state, action) {
  switch (action.type) {
    case 'rates':
      return { ...state, rates: { ...state.rates, ...action.payload }, connected: true, fallback: false }
    case 'connected':
      return { ...state, connected: action.payload }
    case 'fallback':
      return { ...state, fallback: action.payload, connected: false }
    default:
      return state
  }
}

const INITIAL = { rates: {}, connected: false, fallback: false }

export function useRateTicker(companyId) {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  // Stable refs — survive re-renders without triggering the effect
  const wsRef        = useRef(null)
  const pollRef      = useRef(null)
  const prevRatesRef = useRef({})

  useEffect(() => {
    if (!companyId) return

    // Local boolean — each effect run owns its own `alive`.
    // onclose/setTimeout callbacks close over this, so an old connection
    // can never interfere with a new effect instance.
    let alive         = true
    let reconnectCount = 0

    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }

    function startPoll() {
      if (pollRef.current) return
      console.log('[rate-ticker] falling back to HTTP polling')
      dispatch({ type: 'fallback', payload: true })

      pollRef.current = setInterval(async () => {
        if (!alive) return
        try {
          const token = localStorage.getItem('auth_token')
          const res   = await fetch(fxRatesTicker(companyId), {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) return
          const body = await res.json()
          if (!body.rates) return

          const enriched = {}
          for (const [pair, info] of Object.entries(body.rates)) {
            const prev = prevRatesRef.current[pair]
            let change_pct = 0, direction = 'flat'
            if (prev && prev !== 0) {
              change_pct = parseFloat((((info.rate - prev) / prev) * 100).toFixed(4))
              direction  = change_pct > 0 ? 'up' : change_pct < 0 ? 'down' : 'flat'
            }
            enriched[pair]             = { rate: info.rate, change_pct, direction }
            prevRatesRef.current[pair] = info.rate
          }
          dispatch({ type: 'rates', payload: enriched })
        } catch (_) {}
      }, BROADCAST_INTERVAL_MS)
    }

    function openSocket() {
      if (!alive) return
      const token = localStorage.getItem('auth_token')
      if (!token) { startPoll(); return }

      console.log('[rate-ticker] connecting, company:', companyId)
      const ws = new WebSocket(`${wsRates()}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[rate-ticker] connected')
        reconnectCount = 0
        stopPoll()
        dispatch({ type: 'connected', payload: true })
      }

      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data)
          console.log('[rate-ticker] message:', msg.type,
            msg.type === 'rates' ? Object.keys(msg.data || {}).join(', ') : '')
          if (msg.type === 'rates') dispatch({ type: 'rates', payload: msg.data })
        } catch (_) {}
      }

      ws.onclose = (evt) => {
        console.log('[rate-ticker] closed — code:', evt.code, ' alive:', alive)
        dispatch({ type: 'connected', payload: false })
        if (!alive) return  // this effect instance was cleaned up — do not reconnect
        if (reconnectCount < MAX_RECONNECTS) {
          reconnectCount++
          console.log('[rate-ticker] reconnect attempt', reconnectCount, 'of', MAX_RECONNECTS)
          setTimeout(openSocket, RECONNECT_DELAY_MS)
        } else {
          console.log('[rate-ticker] max reconnects reached, switching to polling')
          startPoll()
        }
      }

      ws.onerror = (err) => {
        console.error('[rate-ticker] socket error:', err)
        ws.close()
      }
    }

    openSocket()

    return () => {
      console.log('[rate-ticker] cleanup, company:', companyId)
      alive = false          // marks THIS effect instance as dead
      wsRef.current?.close()
      wsRef.current = null
      stopPoll()
    }
  }, [companyId]) // only re-run when the viewed company changes

  return state
}
