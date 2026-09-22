// Live market feed backed by Angel One SmartAPI.
//
// Flow:
//   1. Generate a TOTP from the configured secret.
//   2. Log in (generateSession) to obtain jwtToken + feedToken.
//   3. Download the scrip master and resolve each watchlist symbol -> token.
//   4. Open SmartWebSocketV2, subscribe in Quote mode, and relay ticks.
//
// All secrets come from environment variables and are never logged.

const axios = require('axios')
const { authenticator } = require('otplib')
const { SmartAPI, WebSocketV2 } = require('smartapi-javascript')

const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

// exchangeType 1 = NSE cash market (nse_cm) in SmartWebSocketV2.
const NSE_CM = 1

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

// Normalize a SmartWebSocketV2 tick (fields/paise vary by SDK build) into
// { token, ltp, close }. Prices arrive in paise, so divide by 100.
function normalizeTick(raw) {
  const token = String(raw.token ?? raw.tk ?? '')
  const rawLtp = raw.last_traded_price ?? raw.ltp ?? raw.lastTradedPrice
  const rawClose = raw.closed_price ?? raw.close_price ?? raw.close ?? raw.cp
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
  const tokenToInst = new Map(resolved.map((r) => [r.token, r]))

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
    tokens: resolved.map((r) => r.token),
  })

  ws.on('tick', (payload) => {
    const ticks = Array.isArray(payload) ? payload : [payload]
    for (const raw of ticks) {
      if (!raw || typeof raw !== 'object') continue
      const t = normalizeTick(raw)
      if (!t) continue
      const inst = tokenToInst.get(t.token)
      if (!inst) continue
      onTick({
        symbol: inst.symbol,
        name: inst.name,
        ltp: Number(t.ltp.toFixed(2)),
        close: t.close != null ? Number(t.close.toFixed(2)) : inst.seed,
        ts: Date.now(),
      })
    }
  })

  ws.on('error', (err) => {
    console.error('[live] websocket error:', err?.message || err)
    onStatus({ mode: 'live', connected: false })
  })

  // Best-effort teardown.
  return () => {
    try {
      ws.close?.()
    } catch {
      /* ignore */
    }
  }
}

module.exports = { startLiveFeed, getConfig }
