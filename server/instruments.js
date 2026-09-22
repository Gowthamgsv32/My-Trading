// The default watchlist. `symbol` is the Angel One NSE trading symbol WITHOUT
// the `-EQ` suffix; the live feed resolves it to an instrument token via the
// SmartAPI scrip master. `seed` is a plausible starting price used only by the
// simulator (no-credentials) mode and as a display fallback before the first
// live tick arrives.
//
// Override the list at runtime with the WATCHLIST env var, e.g.
//   WATCHLIST=RELIANCE,TCS,INFY,HDFCBANK
const INSTRUMENTS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', seed: 2930.0 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', seed: 3900.0 },
  { symbol: 'INFY', name: 'Infosys', seed: 1560.0 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', seed: 1660.0 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', seed: 1240.0 },
  { symbol: 'SBIN', name: 'State Bank of India', seed: 830.0 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', seed: 990.0 },
  { symbol: 'WIPRO', name: 'Wipro', seed: 540.0 },
]

function resolveWatchlist() {
  const env = process.env.WATCHLIST
  if (!env) return INSTRUMENTS
  const wanted = env
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const bySymbol = new Map(INSTRUMENTS.map((i) => [i.symbol, i]))
  return wanted.map(
    (sym) => bySymbol.get(sym) || { symbol: sym, name: sym, seed: 1000.0 },
  )
}

module.exports = { INSTRUMENTS, resolveWatchlist }
