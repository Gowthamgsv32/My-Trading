// Simulated market feed. Used when Angel One credentials are not configured so
// the app is fully functional out of the box. Emits random-walk ticks in the
// exact same shape the live feed produces, so the frontend can't tell the
// difference apart from the reported `mode`.

function startSimFeed({ instruments, onTick, onStatus, intervalMs = 1000 }) {
  // Each instrument keeps a reference "close" (previous day) and a live price.
  const state = instruments.map((i) => ({
    symbol: i.symbol,
    name: i.name,
    close: i.seed,
    ltp: i.seed,
  }))

  onStatus({ mode: 'simulated', connected: true })

  const timer = setInterval(() => {
    for (const s of state) {
      // Small random walk: +/- up to ~0.15% per tick, gently mean-reverting.
      const drift = (s.close - s.ltp) * 0.02
      const shock = (Math.random() - 0.5) * s.ltp * 0.003
      s.ltp = Math.max(1, s.ltp + drift + shock)
      onTick({
        symbol: s.symbol,
        name: s.name,
        ltp: Number(s.ltp.toFixed(2)),
        close: Number(s.close.toFixed(2)),
        ts: Date.now(),
      })
    }
  }, intervalMs)

  // Returned stop() lets index.js tear the feed down cleanly.
  return () => clearInterval(timer)
}

module.exports = { startSimFeed }
