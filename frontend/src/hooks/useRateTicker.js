/**
 * useRateTicker
 *
 * Connects to the backend WebSocket ticker and returns live rate data.
 * Automatically falls back to 5-second HTTP polling after MAX_RECONNECTS
 * failed WebSocket attempts (e.g. corporate proxies that strip upgrade headers).
 *
 * In polling mode the hook computes directional change client-side by
 * comparing each poll response against the previous one, so the returned
 * shape is identical regardless of transport.
 *
 * Returns
 * -------
 * {
 *   rates:     { [pair]: { rate: number, change_pct: number, direction: 'up'|'down'|'flat' } }
 *   connected: boolean   — true when the WebSocket is open
 *   fallback:  boolean   — true when using HTTP polling instead of WebSocket
 * }
 */
import { useCallback, useEffect, useReducer, useRef } from 'react'
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

  const wsRef        = useRef(null)
  const pollRef      = useRef(null)
  const reconnectN   = useRef(0)
  const alive        = useRef(true)
  const prevRatesRef = useRef({})  // tracks last poll values for change_pct computation

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPoll = useCallback(() => {
    if (pollRef.current || !companyId) return
    dispatch({ type: 'fallback', payload: true })

    pollRef.current = setInterval(async () => {
      if (!alive.current) return
      try {
        const token = localStorage.getItem('auth_token')
        const res   = await fetch(fxRatesTicker(companyId), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const body = await res.json()
        if (!body.rates) return

        // Enrich with directional change by diffing against previous poll
        const enriched = {}
        for (const [pair, info] of Object.entries(body.rates)) {
          const prev = prevRatesRef.current[pair]
          let change_pct = 0, direction = 'flat'
          if (prev && prev !== 0) {
            change_pct = parseFloat((((info.rate - prev) / prev) * 100).toFixed(4))
            direction  = change_pct > 0 ? 'up' : change_pct < 0 ? 'down' : 'flat'
          }
          enriched[pair]              = { rate: info.rate, change_pct, direction }
          prevRatesRef.current[pair]  = info.rate
        }
        dispatch({ type: 'rates', payload: enriched })
      } catch (_) { /* ignore transient network errors */ }
    }, BROADCAST_INTERVAL_MS)
  }, [companyId])

  const connect = useCallback(() => {
    if (!alive.current || !companyId) return
    const token = localStorage.getItem('auth_token')
    if (!token) { startPoll(); return }

    const ws = new WebSocket(`${wsRates()}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectN.current = 0
      stopPoll()
      dispatch({ type: 'connected', payload: true })
    }

    ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'rates') dispatch({ type: 'rates', payload: msg.data })
      } catch (_) {}
    }

    ws.onclose = () => {
      dispatch({ type: 'connected', payload: false })
      if (!alive.current) return
      if (reconnectN.current < MAX_RECONNECTS) {
        reconnectN.current++
        setTimeout(connect, RECONNECT_DELAY_MS)
      } else {
        startPoll()
      }
    }

    ws.onerror = () => ws.close()
  }, [companyId, startPoll, stopPoll])

  useEffect(() => {
    alive.current = true
    if (companyId) connect()
    return () => {
      alive.current = false
      wsRef.current?.close()
      stopPoll()
    }
  }, [companyId, connect, stopPoll])

  return state
}
