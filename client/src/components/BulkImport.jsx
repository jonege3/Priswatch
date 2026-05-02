import { useState } from 'react'
import { get } from '../hooks/api.js'
import styles from './BulkImport.module.css'

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

function parseUrls(text) {
  return text.split(/[\n,\s]+/).map(s => s.trim()).filter(s => s.startsWith('http'))
}

const STATUS = {
  pending:  'Pending',
  fetching: 'Looking up…',
  loading:  'Adding…',
  done:     'Added ✓',
  exists:   'Already tracked',
  error:    'Failed',
  invalid:  'Invalid URL',
}

export default function BulkImport({ categories, onAddProduct, onClose }) {
  const [text, setText]             = useState('')
  const [items, setItems]           = useState([])
  const [step, setStep]             = useState('paste')
  const [importing, setImporting]   = useState(false)
  const [defaultCat, setDefaultCat] = useState(categories[0]?.id || '')

  const nok = n => n != null ? Number(n).toLocaleString('nb-NO') + ' kr' : null

  async function handleParse() {
    const urls = parseUrls(text)
    if (!urls.length) return

    // Build initial items
    const initial = urls.map(url => ({
      url,
      categoryId: defaultCat,
      status: isValidPrisjaktUrl(url) ? 'fetching' : 'invalid',
      name: null,
      imageUrl: null,
      price: null,
      message: null,
    }))
    setItems(initial)
    setStep('assign')

    // Fetch names in parallel (but cap concurrency at 3)
    const valid = initial.filter(i => i.status === 'fetching')
    const chunks = []
    for (let i = 0; i < valid.length; i += 3) chunks.push(valid.slice(i, i + 3))

    for (const chunk of chunks) {
      await Promise.all(chunk.map(async item => {
        try {
          const preview = await get(`/products/preview?url=${encodeURIComponent(item.url)}`)
          setItems(prev => prev.map(i => i.url === item.url
            ? { ...i, status: 'pending', name: preview.name, imageUrl: preview.image_url, price: preview.price }
            : i
          ))
        } catch (_) {
          setItems(prev => prev.map(i => i.url === item.url
            ? { ...i, status: 'pending', name: null }
            : i
          ))
        }
      }))
    }
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
      await new Promise(r => setTimeout(r, 500))
    }

    setImporting(false)
    setStep('done')
  }

  const validItems   = items.filter(i => i.status !== 'invalid')
  const pendingCount = items.filter(i => i.status === 'pending').length
  const fetchingCount = items.filter(i => i.status === 'fetching').length
  const doneCount    = items.filter(i => i.status === 'done').length
  const errorCount   = items.filter(i => i.status === 'error').length

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>

        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Bulk import</div>
            <div className={styles.modalSub}>
              {step === 'paste'     && 'Paste Prisjakt URLs — one per line, or comma/space separated'}
              {step === 'assign'    && (fetchingCount > 0 ? `Looking up ${fetchingCount} products…` : `${validItems.length} products ready — assign categories`)}
              {step === 'importing' && `Importing… ${doneCount + errorCount} / ${validItems.length}`}
              {step === 'done'      && `Done — ${doneCount} added${errorCount > 0 ? `, ${errorCount} failed` : ''}`}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Step 1 — Paste */}
        {step === 'paste' && (
          <div className={styles.pasteStep}>
            <textarea
              className={styles.textarea}
              placeholder={`https://www.prisjakt.no/product.php?p=12345\nhttps://www.prisjakt.no/product.php?p=67890`}
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
              <button className={styles.btnPrimary} onClick={handleParse} disabled={parseUrls(text).length === 0}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Assign + Step 3 — Importing + Step 4 — Done */}
        {(step === 'assign' || step === 'importing' || step === 'done') && (
          <div className={styles.assignStep}>

            {step === 'assign' && (
              <div className={styles.applyAll}>
                <span className={styles.applyAllLabel}>Set all to:</span>
                <select className={styles.catSelect} value={defaultCat}
                  onChange={e => { setDefaultCat(e.target.value); setAllCategory(e.target.value) }}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className={styles.itemList}>
              {items.map(item => (
                <div key={item.url} className={`${styles.item} ${styles['item_' + item.status]}`}>

                  {/* Thumbnail */}
                  <div className={styles.itemThumb}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" className={styles.itemImg} />
                      : <div className={styles.itemImgPlaceholder} />}
                  </div>

                  {/* Info */}
                  <div className={styles.itemInfo}>
                    {item.status === 'fetching' ? (
                      <div className={styles.itemFetching}>Looking up…</div>
                    ) : (
                      <>
                        <div className={styles.itemName}>
                          {item.name || item.url.replace('https://www.prisjakt.no', '').substring(0, 40) + '…'}
                        </div>
                        {item.price && (
                          <div className={styles.itemPrice}>{nok(item.price)}</div>
                        )}
                        {item.message && <div className={styles.itemMsg}>{item.message}</div>}
                      </>
                    )}
                  </div>

                  {/* Right side */}
                  {item.status === 'invalid' ? (
                    <span className={`${styles.statusBadge} ${styles.badgeError}`}>Invalid</span>
                  ) : item.status === 'fetching' ? (
                    <span className={`${styles.statusBadge} ${styles.badgeLoading}`}>…</span>
                  ) : item.status === 'pending' ? (
                    <>
                      <select className={styles.catSelect} value={item.categoryId}
                        onChange={e => setCategory(item.url, e.target.value)}>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className={styles.removeBtn} onClick={() => removeItem(item.url)}>×</button>
                    </>
                  ) : item.status === 'loading' ? (
                    <span className={`${styles.statusBadge} ${styles.badgeLoading}`}>…</span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles['badge_' + item.status]}`}>
                      {STATUS[item.status]}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {(step === 'importing' || step === 'done') && validItems.length > 0 && (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}
                  style={{ width: `${((doneCount + errorCount) / validItems.length) * 100}%` }} />
              </div>
            )}

            <div className={styles.assignActions}>
              {step === 'assign' && (
                <>
                  <button className={styles.btnSecondary} onClick={() => setStep('paste')}>← Back</button>
                  <span className={styles.urlCount}>
                    {fetchingCount > 0 ? `Looking up ${fetchingCount}…` : `${pendingCount} to import`}
                  </span>
                  <button className={styles.btnPrimary} onClick={startImport}
                    disabled={pendingCount === 0 || fetchingCount > 0}>
                    Import {pendingCount} products
                  </button>
                </>
              )}
              {step === 'importing' && <span className={styles.urlCount}>Please wait…</span>}
              {step === 'done' && <button className={styles.btnPrimary} onClick={onClose}>Done</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
