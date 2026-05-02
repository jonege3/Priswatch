import { useState } from 'react'
import styles from './BulkImport.module.css'

// Extract a Prisjakt product ID from a URL for display purposes
function extractId(url) {
  try {
    const u = new URL(url)
    const p = u.searchParams.get('p')
    if (p) return p
    const m = u.pathname.match(/[-\/](\d{5,})(?:\/|$)/)
    if (m) return m[1]
  } catch (_) {}
  return null
}

function isValidPrisjaktUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.includes('prisjakt') && extractId(url) !== null
  } catch (_) { return false }
}

// Parse a block of text into individual URLs
function parseUrls(text) {
  const lines = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
  return lines.filter(l => l.startsWith('http'))
}

const STATUS = {
  pending:  { label: 'Pending',   cls: 'pending' },
  loading:  { label: 'Looking up…', cls: 'loading' },
  done:     { label: 'Added ✓',   cls: 'done' },
  exists:   { label: 'Already tracked', cls: 'exists' },
  error:    { label: 'Failed',    cls: 'error' },
  invalid:  { label: 'Invalid URL', cls: 'error' },
}

export default function BulkImport({ categories, onAddProduct, onClose }) {
  const [text, setText]           = useState('')
  const [items, setItems]         = useState([])  // { url, categoryId, status, message }
  const [step, setStep]           = useState('paste') // paste | assign | importing | done
  const [importing, setImporting] = useState(false)
  const [defaultCat, setDefaultCat] = useState(categories[0]?.id || '')

  function handleParse() {
    const urls = parseUrls(text)
    if (!urls.length) return

    setItems(urls.map(url => ({
      url,
      categoryId: defaultCat,
      status: isValidPrisjaktUrl(url) ? 'pending' : 'invalid',
      message: null,
    })))
    setStep('assign')
  }

  function setCategory(url, categoryId) {
    setItems(prev => prev.map(i => i.url === url ? { ...i, categoryId } : i))
  }

  function setAllCategory(categoryId) {
    setItems(prev => prev.map(i => i.status !== 'invalid' ? { ...i, categoryId } : i))
  }

  function removeItem(url) {
    setItems(prev => prev.filter(i => i.url !== url))
  }

  async function startImport() {
    setImporting(true)
    setStep('importing')

    const pending = items.filter(i => i.status === 'pending')

    for (const item of pending) {
      // Mark as loading
      setItems(prev => prev.map(i => i.url === item.url ? { ...i, status: 'loading' } : i))

      try {
        const result = await onAddProduct(item.categoryId, item.url)
        const imported = result?.historyImported || 0
        setItems(prev => prev.map(i => i.url === item.url
          ? { ...i, status: 'done', message: imported > 0 ? `${imported} history pts` : null }
          : i
        ))
      } catch (err) {
        const isExists = err.message?.toLowerCase().includes('already')
        setItems(prev => prev.map(i => i.url === item.url
          ? { ...i, status: isExists ? 'exists' : 'error', message: err.message }
          : i
        ))
      }

      // Small delay between requests to be polite
      await new Promise(r => setTimeout(r, 500))
    }

    setImporting(false)
    setStep('done')
  }

  const validItems  = items.filter(i => i.status !== 'invalid')
  const pendingCount = items.filter(i => i.status === 'pending').length
  const doneCount   = items.filter(i => i.status === 'done').length
  const errorCount  = items.filter(i => i.status === 'error').length

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Bulk import</div>
            <div className={styles.modalSub}>
              {step === 'paste'     && 'Paste Prisjakt URLs — one per line, or comma/space separated'}
              {step === 'assign'    && `${validItems.length} products — assign categories then import`}
              {step === 'importing' && `Importing… ${doneCount + errorCount} / ${validItems.length}`}
              {step === 'done'      && `Done — ${doneCount} added, ${errorCount} failed`}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Step 1 — Paste */}
        {step === 'paste' && (
          <div className={styles.pasteStep}>
            <textarea
              className={styles.textarea}
              placeholder={`https://www.prisjakt.no/product.php?p=12345\nhttps://www.prisjakt.no/product.php?p=67890\nhttps://www.prisjakt.no/product.php?p=11111`}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              autoFocus
            />
            <div className={styles.pasteActions}>
              <span className={styles.urlCount}>
                {parseUrls(text).length > 0 ? `${parseUrls(text).length} URLs detected` : ''}
              </span>
              <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
              <button
                className={styles.btnPrimary}
                onClick={handleParse}
                disabled={parseUrls(text).length === 0}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Assign categories */}
        {(step === 'assign' || step === 'importing' || step === 'done') && (
          <div className={styles.assignStep}>

            {/* Apply all */}
            {step === 'assign' && (
              <div className={styles.applyAll}>
                <span className={styles.applyAllLabel}>Set all to:</span>
                <select
                  className={styles.catSelect}
                  value={defaultCat}
                  onChange={e => { setDefaultCat(e.target.value); setAllCategory(e.target.value) }}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Item list */}
            <div className={styles.itemList}>
              {items.map(item => (
                <div key={item.url} className={`${styles.item} ${styles[item.status]}`}>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemUrl}>
                      {item.url.replace('https://www.prisjakt.no', '').substring(0, 52)}…
                    </div>
                    {item.message && (
                      <div className={styles.itemMsg}>{item.message}</div>
                    )}
                  </div>

                  {item.status === 'invalid' ? (
                    <span className={`${styles.statusBadge} ${styles.badgeError}`}>Invalid URL</span>
                  ) : item.status === 'pending' || item.status === 'loading' ? (
                    <>
                      <select
                        className={styles.catSelect}
                        value={item.categoryId}
                        onChange={e => setCategory(item.url, e.target.value)}
                        disabled={item.status === 'loading'}
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {item.status === 'loading'
                        ? <span className={`${styles.statusBadge} ${styles.badgeLoading}`}>…</span>
                        : <button className={styles.removeBtn} onClick={() => removeItem(item.url)}>×</button>
                      }
                    </>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles['badge_' + item.status]}`}>
                      {STATUS[item.status]?.label}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Progress bar during import */}
            {(step === 'importing' || step === 'done') && validItems.length > 0 && (
              <div className={styles.progressWrap}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${((doneCount + errorCount) / validItems.length) * 100}%` }}
                />
              </div>
            )}

            {/* Footer actions */}
            <div className={styles.assignActions}>
              {step === 'assign' && (
                <>
                  <button className={styles.btnSecondary} onClick={() => setStep('paste')}>← Back</button>
                  <span className={styles.urlCount}>{pendingCount} to import</span>
                  <button
                    className={styles.btnPrimary}
                    onClick={startImport}
                    disabled={pendingCount === 0}
                  >
                    Import {pendingCount} products
                  </button>
                </>
              )}
              {step === 'importing' && (
                <span className={styles.urlCount}>Please wait…</span>
              )}
              {step === 'done' && (
                <button className={styles.btnPrimary} onClick={onClose}>
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
