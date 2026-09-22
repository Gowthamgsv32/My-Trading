import { useCallback, useEffect, useState } from 'react'

// Paper-trading portfolio persisted per-viewer in localStorage. No real money
// or broker orders — trades execute against the live (or simulated) price shown
// in the UI. Starting balance is virtual practice cash.
const STORAGE_KEY = 'mytrading.portfolio.v1'
export const STARTING_CASH = 1_000_000 // ₹10,00,000 practice money

const EMPTY = { cash: STARTING_CASH, positions: {}, trades: [] }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    if (typeof parsed.cash !== 'number' || typeof parsed.positions !== 'object') {
      return EMPTY
    }
    return { trades: [], ...parsed }
  } catch {
    return EMPTY
  }
}

export function usePortfolio() {
  const [state, setState] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable (private mode etc.) — keep working in memory */
    }
  }, [state])

  // Returns { ok, error } so the UI can surface validation messages.
  const buy = useCallback((symbol, name, qty, price) => {
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'No live price yet' }
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'Enter a valid quantity' }
    const cost = qty * price
    let result = { ok: true }
    setState((prev) => {
      if (cost > prev.cash) {
        result = { ok: false, error: 'Not enough cash' }
        return prev
      }
      const pos = prev.positions[symbol] || { qty: 0, avgPrice: 0, name }
      const newQty = pos.qty + qty
      const newAvg = (pos.avgPrice * pos.qty + cost) / newQty
      return {
        ...prev,
        cash: prev.cash - cost,
        positions: {
          ...prev.positions,
          [symbol]: { qty: newQty, avgPrice: newAvg, name: name ?? pos.name },
        },
        trades: [
          { id: Date.now(), side: 'BUY', symbol, qty, price, ts: Date.now() },
          ...prev.trades,
        ].slice(0, 100),
      }
    })
    return result
  }, [])

  const sell = useCallback((symbol, name, qty, price) => {
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'No live price yet' }
    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'Enter a valid quantity' }
    let result = { ok: true }
    setState((prev) => {
      const pos = prev.positions[symbol]
      if (!pos || qty > pos.qty) {
        result = { ok: false, error: 'Not enough holdings' }
        return prev
      }
      const proceeds = qty * price
      const remaining = pos.qty - qty
      const positions = { ...prev.positions }
      if (remaining === 0) delete positions[symbol]
      else positions[symbol] = { ...pos, qty: remaining }
      return {
        ...prev,
        cash: prev.cash + proceeds,
        positions,
        trades: [
          { id: Date.now(), side: 'SELL', symbol, qty, price, ts: Date.now() },
          ...prev.trades,
        ].slice(0, 100),
      }
    })
    return result
  }, [])

  const reset = useCallback(() => setState(EMPTY), [])

  return { ...state, buy, sell, reset }
}
