// Lightweight dependency-free live line chart. Renders a rolling series of
// prices as an SVG area+line, colored green/red by net direction over the
// window. Scales to its container via viewBox.
function PriceChart({ data, height = 140 }) {
  const width = 600
  const pad = { top: 10, right: 8, bottom: 10, left: 8 }

  const points = (data || []).map((d) => d.p)
  if (points.length < 2) {
    return (
      <div className="chart chart--empty" style={{ height }}>
        Waiting for price data…
      </div>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const up = points[points.length - 1] >= points[0]
  const color = up ? '#16c784' : '#ea3943'

  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const x = (i) => pad.left + (i / (points.length - 1)) * innerW
  const y = (p) => pad.top + (1 - (p - min) / span) * innerH

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const area = `${pad.left},${(height - pad.bottom).toFixed(1)} ${line} ${(width - pad.right).toFixed(1)},${(height - pad.bottom).toFixed(1)}`
  const gradId = up ? 'g-up' : 'g-down'
  const lastX = x(points.length - 1)
  const lastY = y(points[points.length - 1])

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Live price chart"
      style={{ height }}
    >
      <defs>
        <linearGradient id="g-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16c784" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#16c784" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="g-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ea3943" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#ea3943" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r="3.5" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default PriceChart
