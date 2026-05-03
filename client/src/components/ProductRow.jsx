import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { get, patch } from '../hooks/api.js'
import { getStatus, THRESHOLD } from '../App.jsx'
import styles from './ProductRow.module.css'

const nok = n => n != null ? Number(n).toLocaleString('nb-NO') + ' kr' : '—'

const RANGES = [
  { label: '3M',  days: 90 },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
  { label: 'All', days: null },
]

function getBadge(product) {
  const status = getStatus(product)
  const cur = product.current_price
  const ago = product.price_7d_ago
  if (status === 'drop') {
    const pct = (((ago - cur) / ago) * 100).toFixed(0)
    return { label: `↓ ${pct}% this week`, cls: 'drop' }
  }
  if (status === 'up') {
    const pct = (((cur - ago) / ago) * 100).toFixed(0)
    return { label: `↑ ${pct}% this week`, cls: 'up' }
  }
  return { label: 'Stable', cls: 'flat' }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipPrice}>{nok(d.price)}</div>
      <div className={styles.tooltipDate}>{d.fullDate}</div>
      {d.shop && <div className={styles.tooltipShop}>{d.shop}</div>}
    </div>
  )
}

export default function ProductRow({ product, onDelete, onMoved, categories = [] }) {
  const [expanded, setExpanded]             = useState(false)
  const [allHistory, setAllHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError]     = useState(null)
  const [moving, setMoving]                 = useState(false)
  const [rangeIdx, setRangeIdx]             = useState(0) // default 3M

  const { label, cls } = getBadge(product)

  async function handleMove(newCategoryId) {
    if (!newCategoryId || newCategoryId == product.category_id) return
    setMoving(true)
    try {
      await patch(`/products/${product.id}`, { category_id: parseInt(newCategoryId) })
      onMoved && onMoved(product.id, parseInt(newCategoryId))
    } catch (e) {
      alert('Failed to move: ' + e.message)
    } finally {
      setMoving(false)
    }
  }
  const lineColor = cls === 'drop' ? 'var(--green)' : cls === 'up' ? 'var(--red)' : 'var(--text2)'

  useEffect(() => {
    if (!expanded || allHistory.length) return
    setLoadingHistory(true)
    setHistoryError(null)
    get(`/products/${product.id}/history`)
      .then(rows => {
        if (!rows.length) { setHistoryError('no_data'); return }
        setAllHistory(rows.map(r => {
          const d = new Date(r.scraped_at)
          return {
            price:    r.price,
            shop:     r.shop,
            ts:       d.getTime(),
            fullDate: d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }),
            date:     d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
          }
        }))
      })
      .catch(e => setHistoryError(e.message))
      .finally(() => setLoadingHistory(false))
  }, [expanded, product.id])

  // Filter history to selected range
  const history = useMemo(() => {
    const days = RANGES[rangeIdx].days
    if (!days) return allHistory
    const cutoff = Date.now() - days * 86400000
    return allHistory.filter(h => h.ts >= cutoff)
  }, [allHistory, rangeIdx])



  const lo  = history.length ? Math.min(...history.map(h => h.price)) : null
  const hi  = history.length ? Math.max(...history.map(h => h.price)) : null
  const avg = history.length ? Math.round(history.reduce((s, h) => s + h.price, 0) / history.length) : null

  const xAxisInterval = history.length > 180 ? Math.floor(history.length / 8)
                      : history.length > 60  ? Math.floor(history.length / 6)
                      : 'preserveStartEnd'

  return (
    <>
      <div
        className={`${styles.row} ${expanded ? styles.expanded : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={styles.imgWrap}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name} className={styles.img} loading="lazy" />
            : <div className={styles.imgPlaceholder} />}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{product.name}</div>
          <div className={styles.shop}>{product.shop || 'Prisjakt'}</div>
        </div>
        <div className={styles.right}>
          <div className={styles.price}>{nok(product.current_price)}</div>
          {product.price_last_different ? (
            <div className={`${styles.prevPrice} ${product.current_price < product.price_last_different ? styles.prevDown : styles.prevUp}`}>
              prev {nok(product.price_last_different)} {product.current_price < product.price_last_different ? '↓' : '↑'}
            </div>
          ) : (
            <div className={styles.prevPrice} style={{color:'var(--text3)'}}>stable</div>
          )}
          {product.price_all_time_low && product.current_price <= product.price_all_time_low * 1.05 && (
            <div className={`${styles.high30} ${styles.green}`}>Near all-time low</div>
          )}
          <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
        </div>
      </div>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.detailTop}>
            {product.image_url && (
              <img src={product.image_url} alt={product.name} className={styles.detailImg} />
            )}
            <div className={styles.detailStats}>
              <div className={styles.dstat}><div className={styles.dstatLabel}>Current</div><div className={styles.dstatVal}>{nok(product.current_price)}</div></div>
              <div className={styles.dstat}><div className={styles.dstatLabel}>30d high</div><div className={`${styles.dstatVal} ${styles.red}`}>{nok(product.price_30d_high)}</div></div>
              <div className={styles.dstat}><div className={styles.dstatLabel}>30d low</div><div className={`${styles.dstatVal} ${styles.green}`}>{nok(product.price_30d_low)}</div></div>
              {lo != null && <div className={styles.dstat}><div className={styles.dstatLabel}>Period low</div><div className={`${styles.dstatVal} ${styles.green}`}>{nok(lo)}</div></div>}
              {avg != null && <div className={styles.dstat}><div className={styles.dstatLabel}>Period avg</div><div className={styles.dstatVal}>{nok(avg)}</div></div>}
            </div>
          </div>

          <div className={styles.chartArea}>
            {/* Range selector */}
            <div className={styles.rangeBar}>
              {RANGES.map((r, i) => {
                // Disable ranges with no data
                const days = r.days
                const hasData = !days || allHistory.some(h => h.ts >= Date.now() - days * 86400000)
                return (
                  <button
                    key={r.label}
                    className={`${styles.rangeBtn} ${rangeIdx === i ? styles.rangeActive : ''} ${!hasData ? styles.rangeDisabled : ''}`}
                    onClick={e => { e.stopPropagation(); if (hasData) setRangeIdx(i) }}
                  >
                    {r.label}
                  </button>
                )
              })}
              <span className={styles.rangePts}>{history.length} pts</span>
            </div>

            <div className={styles.chartWrap}>
              {loadingHistory && <div className={styles.chartMsg}>Loading history...</div>}

              {!loadingHistory && historyError === 'no_data' && (
                <div className={styles.chartMsg}>
                  No price history yet — hit "Refresh prices" or wait for the next scheduled scrape.
                  <br /><small style={{marginTop:'6px',display:'block',opacity:0.6}}>
                    Prisjakt history import may have been blocked — check the server console.
                  </small>
                </div>
              )}

              {!loadingHistory && historyError && historyError !== 'no_data' && (
                <div className={styles.chartMsg}>Error: {historyError}</div>
              )}

              {!loadingHistory && !historyError && history.length < 2 && (
                <div className={styles.chartMsg}>No data in this range — try a wider period.</div>
              )}

              {!loadingHistory && !historyError && history.length >= 2 && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--text3)' }}
                      tickLine={false}
                      axisLine={false}
                      interval={xAxisInterval}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--text3)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => v.toLocaleString('nb-NO')}
                      domain={['auto', 'auto']}
                      width={72}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {lo && (
                      <ReferenceLine
                        y={lo}
                        stroke="var(--green)"
                        strokeDasharray="4 3"
                        strokeOpacity={0.5}
                        label={{ value: `Low ${nok(lo)}`, fill: 'var(--green)', fontSize: 10, position: 'insideTopLeft' }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={lineColor}
                      strokeWidth={2}
                      dot={history.length <= 30 ? { r: 3, fill: lineColor } : false}
                      activeDot={{ r: 5 }}
                      isAnimationActive={history.length < 200}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className={styles.detailActions}>
            <a href={product.url} target="_blank" rel="noopener noreferrer"
              className={styles.btnLink} onClick={e => e.stopPropagation()}>
              View on Prisjakt ↗
            </a>
            {categories.length > 1 && (
              <select
                className={styles.moveSelect}
                value={product.category_id}
                onChange={e => { e.stopPropagation(); handleMove(e.target.value) }}
                disabled={moving}
                onClick={e => e.stopPropagation()}
              >
                <option value="" disabled>Move to…</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button className={styles.btnDelete} onClick={e => { e.stopPropagation(); onDelete() }}>
              Stop tracking
            </button>
          </div>
        </div>
      )}
    </>
  )
}
