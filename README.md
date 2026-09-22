# My Trading

A React single-page app (Vite + React 19) that streams **live NSE stock
prices** over a WebSocket, deployed to **GitHub Pages**.

🔗 **Live site:** https://gowthamgsv32.github.io/My-Trading/

## Architecture

GitHub Pages can only host static files, and the Angel One SmartAPI is
**backend-only** (it needs your secret credentials + a 2FA TOTP, and its
feed can't be called from a browser). So the app is two parts:

```
┌─────────────────────┐        WebSocket         ┌──────────────────────┐
│  React frontend      │ ◀──────ticks───────────  │  Node relay (server/) │
│  (GitHub Pages)      │                          │  Angel One SmartAPI   │
└─────────────────────┘                          └──────────────────────┘
```

- **`src/`** — the React frontend (deployed to GitHub Pages). It connects to
  the relay's WebSocket and renders streaming quotes.
- **`server/`** — a Node relay that holds your Angel One credentials, logs
  in, seeds an accurate snapshot from the
  [Market Data REST quote API](https://smartapi.angelone.in/docs/MarketData),
  then subscribes to the live `SmartWebSocketV2` feed and re-broadcasts ticks
  to the frontend (with the REST API as a fallback for symbols the socket
  hasn't ticked recently, e.g. when the market is closed). **It must run on a
  host that can keep secrets** (your machine, Render, Railway, Fly.io, a VPS…)
  — never on GitHub Pages.

Without credentials the relay runs a **built-in simulator** (realistic
random-walk prices) so the whole app works out of the box.

## Getting started (frontend)

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build locally
npm run lint     # run oxlint
```

By default the frontend connects to `ws://localhost:8080`. To point it at a
hosted relay, set `VITE_FEED_WS_URL` (see `.env.example`). When the frontend
is served over **https** (GitHub Pages) this must be a **`wss://`** URL, or
the browser blocks it as mixed content.

## Live data backend (`server/`)

```bash
cd server
npm install
cp .env.example .env   # then fill in your Angel One SmartAPI credentials
npm start              # or: npm run dev  (auto-restart)
```

The relay listens on `http://localhost:8080` (WebSocket on the same port,
health check at `/health`).

### Getting Angel One SmartAPI credentials

1. Sign up / log in at <https://smartapi.angelbroking.com> and **enable API
   access** on your Angel One account.
2. Create an app to get your **API key** → `SMARTAPI_KEY`.
3. `SMARTAPI_CLIENT_CODE` = your Angel One client/login ID.
4. `SMARTAPI_PASSWORD` = your trading/login **PIN (MPIN)**.
5. `SMARTAPI_TOTP_SECRET` = the **base32 secret** shown when you enable TOTP
   two-factor auth (the same secret your authenticator app stores) — not a
   6-digit code. The relay generates fresh codes from it automatically.

Put these in `server/.env` (git-ignored). With them set, the status badge in
the UI flips from **"Simulated feed"** to **"Live · Angel One"**. Change the
watchlist with the `WATCHLIST` env var (comma-separated NSE symbols).

> ⚠️ These are real brokerage credentials. Keep `.env` private, never commit
> it, and run the relay only on a host you control.

### Deploy the relay to Render (one-click blueprint)

A [Render Blueprint](https://render.com/docs/blueprint-spec) is included at
`render.yaml`, so you don't have to run the relay on your own machine:

1. In the [Render dashboard](https://dashboard.render.com), click
   **New + → Blueprint** and select this repository. Render reads
   `render.yaml` and creates the `my-trading-relay` web service.
2. Open the service's **Environment** tab and set your `SMARTAPI_*` values
   (they're marked `sync: false`, so they're never stored in git). Leave them
   blank to run in simulator mode.
3. Deploy. Your relay is now at `https://my-trading-relay.onrender.com` with a
   secure WebSocket at `wss://my-trading-relay.onrender.com`.

Then tell the GitHub Pages frontend where the relay is: add a repository
**Actions variable** (or set it in the build) named `VITE_FEED_WS_URL` =
`wss://my-trading-relay.onrender.com` and re-run the deploy workflow. The
live site will then connect to your relay automatically.

> Render's free tier spins the service down after inactivity, so the first
> connection after an idle period takes a few seconds to wake it up.

## Deployment

Deployment is automated with GitHub Actions
(`.github/workflows/deploy.yml`): every push to the `main` branch builds
the app and publishes `dist/` to GitHub Pages. You can also trigger it
manually from the **Actions** tab.

### One-time setup in GitHub

Enable Pages to serve from the workflow:

1. Go to the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

After the first successful run of the "Deploy to GitHub Pages" workflow the
site will be live at the URL above.

> **Note on the base path:** `vite.config.js` sets `base: '/My-Trading/'`
> so asset URLs resolve under the repository sub-path. If you rename the
> repository, update this value to match.
