import { useMemo, useState } from 'react'
import { useLiveFeed } from './useLiveFeed'
import './App.css'

// Static list drives row order and shows names before the first tick arrives.
// Keep in sync with server/instruments.js.
const INSTRUMENTS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'INFY', name: 'Infosys' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors' },
  { symbol: 'WIPRO', name: 'Wipro' },
]

const fmt = (n) =>
  n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function StatusBadge({ status }) {
  let label = 'Connecting…'
  let cls = 'badge--wait'
  if (status.state === 'disconnected' || status.state === 'connecting') {
    label = status.state === 'disconnected' ? 'Reconnecting…' : 'Connecting…'
    cls = 'badge--wait'
  } else if (status.state === 'open') {
    if (status.mode === 'live') {
      label = 'Live · Angel One'
      cls = 'badge--live'
    } else if (status.mode === 'simulated') {
      label = 'Simulated feed'
      cls = 'badge--sim'
    } else {
      label = 'Connected'
      cls = 'badge--live'
    }
  }
  return (
    <span className={`badge ${cls}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

function App() {
  const { status, quotes } = useLiveFeed()
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const merged = INSTRUMENTS.map((i) => ({ ...i, ...(quotes[i.symbol] || {}) }))
    const q = query.trim().toUpperCase()
    if (!q) return merged
    return merged.filter(
      (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
    )
  }, [quotes, query])

  const live = Object.values(quotes).filter((q) => q.ltp != null)
  const gainers = live.filter((q) => (q.change ?? 0) > 0).length
  const losers = live.filter((q) => (q.change ?? 0) < 0).length

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ▲
          </span>
          <h1>My Trading</h1>
          <StatusBadge status={status} />
        </div>
        <p className="tagline">Live NSE prices, streamed over WebSocket.</p>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat__label">Symbols</span>
          <span className="stat__value">{INSTRUMENTS.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Gainers</span>
          <span className="stat__value stat__value--up">{gainers}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Losers</span>
          <span className="stat__value stat__value--down">{losers}</span>
        </div>
      </section>

      <section className="watchlist">
        <div className="watchlist__toolbar">
          <h2>Watchlist</h2>
          <input
            type="search"
            className="search"
            placeholder="Filter by symbol or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter watchlist"
          />
        </div>

        <table className="quote-table">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Name</th>
              <th scope="col" className="num">
                LTP (₹)
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const change = r.change ?? 0
              const dirClass = r.dir > 0 ? 'flash-up' : r.dir < 0 ? 'flash-down' : ''
              return (
                <tr key={r.symbol}>
                  <td className="sym">{r.symbol}</td>
                  <td>{r.name}</td>
                  <td key={r.ts || 'na'} className={`num price ${dirClass}`}>
                    {fmt(r.ltp)}
                  </td>
                  <td className={`num ${change >= 0 ? 'up' : 'down'}`}>
                    {r.ltp == null
                      ? '—'
                      : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No matches for “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="app__footer">
        <p>
          {status.mode === 'live'
            ? 'Live market data via Angel One SmartAPI.'
            : 'Showing a simulated feed — add Angel One credentials to the backend for live data.'}{' '}
          Not investment advice.
        </p>
      </footer>
    </div>
  )
}

export default App
