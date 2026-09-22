// Live market feed backed by Angel One SmartAPI.
//
// Flow:
//   1. Generate a TOTP from the configured secret.
//   2. Log in (generateSession) to obtain jwtToken + feedToken.
//   3. Download the scrip master and resolve each watchlist symbol -> token.
//   4. Seed an accurate snapshot from the Market Data REST quote API
//      (https://smartapi.angelone.in/docs/MarketData).
//   5. Open SmartWebSocketV2, subscribe in Quote mode, and relay ticks, with
//      a periodic REST refresh as a fallback for stale tokens (market closed
//      or a dropped socket).
//
// All secrets come from environment variables and are never logged.

const axios = require('axios')
const { authenticator } = require('otplib')
const { SmartAPI, WebSocketV2 } = require('smartapi-javascript')

const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

// exchangeType 1 = NSE cash market (nse_cm) in SmartWebSocketV2.
const NSE_CM = 1

// How often to poll the REST quote API for tokens the websocket hasn't ticked
// recently. 0 disables the fallback (seed-once only). The quote endpoint
// batches all tokens in a single request, so this stays well within limits.
const REFRESH_MS = Number(process.env.MARKETDATA_REFRESH_MS ?? 15000)

// The SDK decodes the websocket token field via JSON.stringify, so it can come
// back wrapped in quotes and null-padded (e.g. `"3045"`). Instrument tokens
// are numeric, so reduce everything to its digits for reliable map lookups.
function cleanToken(token) {
  return String(token ?? '').replace(/\D/g, '')
}

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function getConfig() {
  const {
    SMARTAPI_KEY,
    SMARTAPI_CLIENT_CODE,
    SMARTAPI_PASSWORD,
    SMARTAPI_TOTP_SECRET,
  } = process.env
  if (
    !SMARTAPI_KEY ||
    !SMARTAPI_CLIENT_CODE ||
    !SMARTAPI_PASSWORD ||
    !SMARTAPI_TOTP_SECRET
  ) {
    return null
  }
  return {
    apiKey: SMARTAPI_KEY,
    clientCode: SMARTAPI_CLIENT_CODE,
    password: SMARTAPI_PASSWORD,
    totpSecret: SMARTAPI_TOTP_SECRET.replace(/\s+/g, ''),
  }
}

async function resolveTokens(instruments) {
  const { data } = await axios.get(SCRIP_MASTER_URL, { timeout: 30000 })
  // Index NSE equity rows (symbol looks like "RELIANCE-EQ") by base symbol.
  const byBase = new Map()
  for (const row of data) {
    if (row.exch_seg !== 'NSE') continue
    if (typeof row.symbol !== 'string' || !row.symbol.endsWith('-EQ')) continue
    const base = row.symbol.slice(0, -3).toUpperCase()
    if (!byBase.has(base)) byBase.set(base, row)
  }
  const resolved = []
  for (const inst of instruments) {
    const row = byBase.get(inst.symbol.toUpperCase())
    if (!row) {
      console.warn(`[live] could not resolve token for ${inst.symbol}; skipping`)
      continue
    }
    resolved.push({ ...inst, token: String(row.token) })
  }
  return resolved
}

// Normalize a SmartWebSocketV2 tick into { token, ltp, close }. Prices arrive
// in paise, so divide by 100. Field names match the SDK's Quote-mode parser
// (last_traded_price, close_price).
function normalizeTick(raw) {
  const token = cleanToken(raw.token ?? raw.tk)
  const rawLtp = raw.last_traded_price ?? raw.ltp ?? raw.lastTradedPrice
  const rawClose = raw.close_price ?? raw.closed_price ?? raw.close ?? raw.cp
  if (token === '' || rawLtp == null) return null
  return {
    token,
    ltp: Number(rawLtp) / 100,
    close: rawClose != null ? Number(rawClose) / 100 : undefined,
  }
}

async function startLiveFeed({ instruments, onTick, onStatus }) {
  const cfg = getConfig()
  if (!cfg) return null // caller falls back to the simulator

  onStatus({ mode: 'live', connected: false })

  const smartApi = new SmartAPI({ api_key: cfg.apiKey })
  const totp = authenticator.generate(cfg.totpSecret)
  const session = await smartApi.generateSession(
    cfg.clientCode,
    cfg.password,
    totp,
  )
  const jwtToken = session?.data?.jwtToken
  const feedToken = session?.data?.feedToken
  if (!jwtToken || !feedToken) {
    throw new Error('SmartAPI login did not return jwt/feed tokens')
  }

  const resolved = await resolveTokens(instruments)
  if (resolved.length === 0) {
    throw new Error('No watchlist symbols could be resolved to tokens')
  }
  const tokens = resolved.map((r) => r.token)
  const tokenToInst = new Map(resolved.map((r) => [r.token, r]))
  // Timestamp of the last websocket tick per token, so the REST fallback only
  // fills in tokens the stream has gone quiet on.
  const lastTickAt = new Map()

  const emit = (inst, ltp, close) =>
    onTick({
      symbol: inst.symbol,
      name: inst.name,
      ltp: Number(ltp.toFixed(2)),
      close: close != null ? Number(close.toFixed(2)) : inst.seed,
      ts: Date.now(),
    })

  // --- Market Data REST quote API ---------------------------------------
  // POST /rest/secure/angelbroking/market/v1/quote via the SDK, which applies
  // the session auth headers. `mode` is LTP | OHLC | FULL. Returns
  // data.fetched[] with { symbolToken, ltp, close, open, high, low, ... }.
  async function fetchQuoteSnapshot(mode = 'FULL', staleOnly = false) {
    const res = await smartApi.marketData({
      mode,
      exchangeTokens: { NSE: tokens },
    })
    const fetched = res?.data?.fetched
    if (!Array.isArray(fetched)) return 0
    const now = Date.now()
    let emitted = 0
    for (const q of fetched) {
      const inst = tokenToInst.get(cleanToken(q.symbolToken))
      if (!inst) continue
      if (staleOnly && now - (lastTickAt.get(inst.token) || 0) < REFRESH_MS) {
        continue // websocket is keeping this one fresh; don't fight it
      }
      const ltp = toNumber(q.ltp)
      if (ltp == null) continue
      emit(inst, ltp, toNumber(q.close))
      emitted += 1
    }
    return emitted
  }

  // Seed accurate prices before the first websocket tick arrives. Non-fatal:
  // if it fails, the websocket still populates the UI shortly after.
  try {
    await fetchQuoteSnapshot('FULL')
  } catch (err) {
    console.warn('[live] initial quote snapshot failed:', err?.message || err)
  }

  // --- SmartWebSocketV2 live stream -------------------------------------
  const ws = new WebSocketV2({
    jwttoken: jwtToken,
    apikey: cfg.apiKey,
    clientcode: cfg.clientCode,
    feedtype: feedToken,
  })

  await ws.connect()
  onStatus({ mode: 'live', connected: true })

  ws.fetchData({
    correlationID: 'my-trading',
    action: 1, // subscribe
    mode: 2, // Quote (includes close price for change %)
    exchangeType: NSE_CM,
    tokens,
  })

  ws.on('tick', (payload) => {
    const ticks = Array.isArray(payload) ? payload : [payload]
    for (const raw of ticks) {
      if (!raw || typeof raw !== 'object') continue
      const t = normalizeTick(raw)
      if (!t) continue
      const inst = tokenToInst.get(t.token)
      if (!inst) continue
      lastTickAt.set(t.token, Date.now())
      emit(inst, t.ltp, t.close)
    }
  })

  ws.on('error', (err) => {
    console.error('[live] websocket error:', err?.message || err)
    onStatus({ mode: 'live', connected: false })
  })

  // Periodic REST fallback for tokens the socket hasn't ticked recently.
  let refreshTimer = null
  if (REFRESH_MS > 0) {
    refreshTimer = setInterval(() => {
      fetchQuoteSnapshot('FULL', true).catch((err) =>
        console.warn('[live] quote refresh failed:', err?.message || err),
      )
    }, REFRESH_MS)
    if (refreshTimer.unref) refreshTimer.unref()
  }

  // Best-effort teardown.
  return () => {
    if (refreshTimer) clearInterval(refreshTimer)
    try {
      ws.close?.()
    } catch {
      /* ignore */
    }
  }
}

module.exports = { startLiveFeed, getConfig }
