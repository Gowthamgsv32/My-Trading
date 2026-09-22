require('dotenv').config()

const http = require('http')
const express = require('express')
const cors = require('cors')
const { WebSocketServer } = require('ws')

const { resolveWatchlist } = require('./instruments')
const { startSimFeed } = require('./simFeed')
const { startLiveFeed, getConfig } = require('./liveFeed')

const PORT = Number(process.env.PORT) || 8080
const instruments = resolveWatchlist()

// ---- shared state -------------------------------------------------------
// Latest quote per symbol, so a newly connected browser gets an instant
// snapshot instead of waiting for the next tick.
const latest = new Map(
  instruments.map((i) => [
    i.symbol,
    { symbol: i.symbol, name: i.name, ltp: null, close: i.seed, ts: null },
  ]),
)
let feedStatus = { mode: getConfig() ? 'live' : 'simulated', connected: false }

// ---- http + websocket server -------------------------------------------
const app = express()
app.use(cors())
app.get('/health', (_req, res) =>
  res.json({ ok: true, ...feedStatus, symbols: instruments.length }),
)

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

function broadcast(obj) {
  const data = JSON.stringify(obj)
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data)
  }
}

wss.on('connection', (ws) => {
  // Greet the new client with current status + a full snapshot.
  send(ws, { type: 'status', ...feedStatus })
  send(ws, { type: 'snapshot', quotes: Array.from(latest.values()) })
})

// ---- feed wiring --------------------------------------------------------
function onTick(tick) {
  const prev = latest.get(tick.symbol) || {}
  latest.set(tick.symbol, { ...prev, ...tick })
  broadcast({ type: 'tick', ...tick })
}

function onStatus(status) {
  feedStatus = { ...feedStatus, ...status }
  broadcast({ type: 'status', ...feedStatus })
}

async function startFeed() {
  if (getConfig()) {
    try {
      const stop = await startLiveFeed({ instruments, onTick, onStatus })
      if (stop) {
        console.log('[feed] Angel One live feed started')
        return
      }
    } catch (err) {
      console.error(
        '[feed] live feed failed, falling back to simulator:',
        err?.message || err,
      )
    }
  } else {
    console.log(
      '[feed] no SmartAPI credentials found — starting simulator. ' +
        'Set SMARTAPI_* env vars for live Angel One data.',
    )
  }
  feedStatus = { mode: 'simulated', connected: false }
  startSimFeed({ instruments, onTick, onStatus })
}

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
  console.log(`[server] watchlist: ${instruments.map((i) => i.symbol).join(', ')}`)
  startFeed()
})
