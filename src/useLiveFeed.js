import { useEffect, useRef, useState } from 'react'

// Backend relay URL. In local dev the default works; for a production build
// served over https (GitHub Pages) set VITE_FEED_WS_URL to a wss:// endpoint,
// otherwise the browser blocks the insecure ws:// connection (mixed content).
const WS_URL = import.meta.env.VITE_FEED_WS_URL || 'ws://localhost:8080'

// How many recent prices to retain per symbol for the chart.
const HISTORY_LIMIT = 180

// Connects to the backend WebSocket relay and returns live quotes.
// Reconnects automatically with exponential backoff.
export function useLiveFeed() {
  const [status, setStatus] = useState({ state: 'connecting', mode: null })
  // symbol -> { symbol, name, ltp, close, change, ts, dir }
  const [quotes, setQuotes] = useState({})
  // symbol -> [{ t, p }] rolling price history for charts
  const [histories, setHistories] = useState({})
  const retryRef = useRef(0)

  useEffect(() => {
    let closed = false
    let ws
    let reconnectTimer

    const pushHistory = (symbol, price, ts) =>
      setHistories((prev) => {
        const series = prev[symbol] || []
        const next = series.concat({ t: ts ?? Date.now(), p: price })
        if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT)
        return { ...prev, [symbol]: next }
      })

    const applyTick = (msg) => {
      setQuotes((prev) => {
        const cur = prev[msg.symbol] || { symbol: msg.symbol, name: msg.name }
        const close = msg.close ?? cur.close
        const change = close ? ((msg.ltp - close) / close) * 100 : cur.change
        const dir =
          cur.ltp == null ? 0 : Math.sign(msg.ltp - cur.ltp) || cur.dir || 0
        return {
          ...prev,
          [msg.symbol]: {
            ...cur,
            name: msg.name ?? cur.name,
            ltp: msg.ltp,
            close,
            change,
            ts: msg.ts,
            dir,
          },
        }
      })
      if (msg.ltp != null) pushHistory(msg.symbol, msg.ltp, msg.ts)
    }

    const connect = () => {
      setStatus((s) => ({ ...s, state: 'connecting' }))
      try {
        ws = new WebSocket(WS_URL)
      } catch {
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        retryRef.current = 0
        setStatus((s) => ({ ...s, state: 'open' }))
      }

      ws.onmessage = (ev) => {
        let msg
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (msg.type === 'status') {
          setStatus({ state: 'open', mode: msg.mode })
        } else if (msg.type === 'snapshot') {
          setQuotes(() => {
            const next = {}
            for (const q of msg.quotes) {
              const change = q.close && q.ltp ? ((q.ltp - q.close) / q.close) * 100 : 0
              next[q.symbol] = { ...q, change, dir: 0 }
            }
            return next
          })
          for (const q of msg.quotes) {
            if (q.ltp != null) pushHistory(q.symbol, q.ltp, q.ts)
          }
        } else if (msg.type === 'tick') {
          applyTick(msg)
        }
      }

      ws.onerror = () => ws && ws.close()
      ws.onclose = () => {
        if (!closed) scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      setStatus((s) => ({ ...s, state: 'disconnected' }))
      const delay = Math.min(1000 * 2 ** retryRef.current, 15000)
      retryRef.current += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    connect()
    return () => {
      closed = true
      clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [])

  return { status, quotes, histories }
}
