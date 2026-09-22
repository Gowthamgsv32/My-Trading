import { useMemo, useState } from 'react'
import { useLiveFeed } from './useLiveFeed'
import { usePortfolio, STARTING_CASH } from './usePortfolio'
import PriceChart from './PriceChart'
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

const inr = (n, dp = 2) =>
  n == null || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })

const signed = (n) => (n >= 0 ? `+${inr(n)}` : inr(n))

function StatusBadge({ status }) {
  let label = 'Connecting…'
  let cls = 'badge--wait'
  if (status.state === 'disconnected') {
    label = 'Reconnecting…'
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
  const { status, quotes, histories } = useLiveFeed()
  const portfolio = usePortfolio()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('RELIANCE')
  const [qty, setQty] = useState(1)
  const [flash, setFlash] = useState(null) // { ok, text }

  const rows = useMemo(() => {
    const merged = INSTRUMENTS.map((i) => ({ ...i, ...(quotes[i.symbol] || {}) }))
    const q = query.trim().toUpperCase()
    if (!q) return merged
    return merged.filter(
      (r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q),
    )
  }, [quotes, query])

  const selInstrument = INSTRUMENTS.find((i) => i.symbol === selected)
  const selQuote = { ...selInstrument, ...(quotes[selected] || {}) }
  const selChange = selQuote.change ?? 0

  // Live holdings with mark-to-market P&L.
  const holdings = useMemo(
    () =>
      Object.entries(portfolio.positions).map(([symbol, pos]) => {
        const ltp = quotes[symbol]?.ltp ?? null
        const value = ltp != null ? ltp * pos.qty : null
        const invested = pos.avgPrice * pos.qty
        const pnl = value != null ? value - invested : null
        const pnlPct = pnl != null && invested ? (pnl / invested) * 100 : null
        return { symbol, ...pos, ltp, value, invested, pnl, pnlPct }
      }),
    [portfolio.positions, quotes],
  )

  const holdingsValue = holdings.reduce((s, h) => s + (h.value ?? h.invested), 0)
  const equity = portfolio.cash + holdingsValue
  const totalPnl = equity - STARTING_CASH

  const showFlash = (res, verb) =>
    setFlash(
      res.ok
        ? { ok: true, text: `${verb} ${qty} ${selected} @ ₹${inr(selQuote.ltp)}` }
        : { ok: false, text: res.error },
    )

  const doBuy = () => showFlash(portfolio.buy(selected, selInstrument.name, Number(qty), selQuote.ltp), 'Bought')
  const doSell = () => showFlash(portfolio.sell(selected, selInstrument.name, Number(qty), selQuote.ltp), 'Sold')

  const heldQty = portfolio.positions[selected]?.qty ?? 0

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">▲</span>
          <h1>My Trading</h1>
          <StatusBadge status={status} />
        </div>
        <p className="tagline">Live NSE prices · paper trading</p>
      </header>

      {/* Portfolio summary */}
      <section className="stats">
        <div className="stat">
          <span className="stat__label">Equity</span>
          <span className="stat__value">₹{inr(equity, 0)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Cash</span>
          <span className="stat__value">₹{inr(portfolio.cash, 0)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Total P&amp;L</span>
          <span className={`stat__value ${totalPnl >= 0 ? 'stat__value--up' : 'stat__value--down'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{inr(totalPnl, 0)}
          </span>
        </div>
      </section>

      {/* Chart + trade panel for the selected symbol */}
      <section className="trade-card">
        <div className="trade-card__head">
          <div>
            <h2>{selected}</h2>
            <span className="muted">{selQuote.name}</span>
          </div>
          <div className="trade-card__price">
            <span className="ltp">₹{inr(selQuote.ltp)}</span>
            <span className={selChange >= 0 ? 'up' : 'down'}>
              {selQuote.ltp == null ? '—' : `${selChange >= 0 ? '+' : ''}${selChange.toFixed(2)}%`}
            </span>
          </div>
        </div>

        <PriceChart data={histories[selected]} />

        <div className="trade-controls">
          <label className="qty">
            Qty
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              aria-label="Quantity"
            />
          </label>
          <button type="button" className="btn btn--buy" onClick={doBuy} disabled={selQuote.ltp == null}>
            Buy
          </button>
          <button
            type="button"
            className="btn btn--sell"
            onClick={doSell}
            disabled={selQuote.ltp == null || heldQty === 0}
          >
            Sell
          </button>
        </div>
        <div className="trade-meta">
          <span>Est. ₹{inr((selQuote.ltp ?? 0) * qty)}</span>
          <span>Holding: {heldQty}</span>
          {flash && (
            <span className={`trade-flash ${flash.ok ? 'ok' : 'err'}`}>{flash.text}</span>
          )}
        </div>
      </section>

      {/* Watchlist */}
      <section className="watchlist">
        <div className="watchlist__toolbar">
          <h2>Watchlist</h2>
          <input
            type="search"
            className="search"
            placeholder="Filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter watchlist"
          />
        </div>
        <table className="quote-table">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col" className="num">LTP (₹)</th>
              <th scope="col" className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const change = r.change ?? 0
              const dirClass = r.dir > 0 ? 'flash-up' : r.dir < 0 ? 'flash-down' : ''
              return (
                <tr
                  key={r.symbol}
                  className={r.symbol === selected ? 'row--selected' : ''}
                  onClick={() => setSelected(r.symbol)}
                >
                  <td className="sym">{r.symbol}</td>
                  <td key={r.ts || 'na'} className={`num price ${dirClass}`}>{inr(r.ltp)}</td>
                  <td className={`num ${change >= 0 ? 'up' : 'down'}`}>
                    {r.ltp == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="empty">No matches for “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Holdings */}
      <section className="watchlist">
        <div className="watchlist__toolbar">
          <h2>Holdings</h2>
          <button type="button" className="link-btn" onClick={portfolio.reset}>
            Reset portfolio
          </button>
        </div>
        {holdings.length === 0 ? (
          <p className="empty">No positions yet — select a symbol above and hit Buy.</p>
        ) : (
          <table className="quote-table">
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col" className="num">Qty</th>
                <th scope="col" className="num">Avg</th>
                <th scope="col" className="num">LTP</th>
                <th scope="col" className="num">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol} onClick={() => setSelected(h.symbol)}>
                  <td className="sym">{h.symbol}</td>
                  <td className="num">{h.qty}</td>
                  <td className="num">{inr(h.avgPrice)}</td>
                  <td className="num">{inr(h.ltp)}</td>
                  <td className={`num ${(h.pnl ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {h.pnl == null ? '—' : `${signed(h.pnl)}`}
                    {h.pnlPct != null && (
                      <span className="pnl-pct"> ({h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(1)}%)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="app__footer">
        <p>
          <strong>Paper trading</strong> with virtual cash — no real orders are placed.{' '}
          {status.mode === 'live' ? 'Prices via Angel One SmartAPI.' : 'Prices are a simulated feed.'}{' '}
          Not investment advice.
        </p>
      </footer>
    </div>
  )
}

export default App
