import { useMemo, useState } from 'react'
import './App.css'

const WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 228.52, change: 1.34 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 421.18, change: 0.87 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 178.44, change: -2.15 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 251.09, change: 3.42 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 197.63, change: -0.54 },
  { symbol: 'BTC', name: 'Bitcoin', price: 63120.0, change: 4.11 },
]

function App() {
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return WATCHLIST
    return WATCHLIST.filter(
      (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
    )
  }, [query])

  const gainers = WATCHLIST.filter((r) => r.change > 0).length
  const losers = WATCHLIST.length - gainers

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ▲
          </span>
          <h1>My Trading</h1>
        </div>
        <p className="tagline">A React dashboard, live on GitHub Pages.</p>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat__label">Symbols</span>
          <span className="stat__value">{WATCHLIST.length}</span>
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
                Price
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td className="sym">{r.symbol}</td>
                <td>{r.name}</td>
                <td className="num">${r.price.toLocaleString()}</td>
                <td
                  className={`num ${r.change >= 0 ? 'up' : 'down'}`}
                >
                  {r.change >= 0 ? '+' : ''}
                  {r.change.toFixed(2)}%
                </td>
              </tr>
            ))}
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
          Prices shown are sample data. Built with React + Vite. Not investment
          advice.
        </p>
      </footer>
    </div>
  )
}

export default App
