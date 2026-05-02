import { useState, useMemo } from 'react'
import BulkImport from './BulkImport.jsx'
import CategoryRow from './CategoryRow.jsx'
import { getStatus } from '../App.jsx'
import styles from './Dashboard.module.css'

const SORTS = [
  { key: 'alpha',    label: 'A–Z' },
  { key: 'drop',     label: 'Biggest drop' },
  { key: 'saving',   label: 'Highest saving' },
  { key: 'price_lo', label: 'Price ↑' },
  { key: 'price_hi', label: 'Price ↓' },
  { key: 'recent',   label: 'Recently updated' },
]

function sortProducts(products, sort) {
  const arr = [...products]
  switch (sort) {
    case 'drop':
      return arr.sort((a, b) => {
        const pa = a.price_30d_high ? (a.price_30d_high - a.current_price) / a.price_30d_high : -1
        const pb = b.price_30d_high ? (b.price_30d_high - b.current_price) / b.price_30d_high : -1
        return pb - pa
      })
    case 'saving':
      return arr.sort((a, b) => {
        const sa = (a.price_30d_high || 0) - (a.current_price || 0)
        const sb = (b.price_30d_high || 0) - (b.current_price || 0)
        return sb - sa
      })
    case 'price_lo':
      return arr.sort((a, b) => (a.current_price || 0) - (b.current_price || 0))
    case 'price_hi':
      return arr.sort((a, b) => (b.current_price || 0) - (a.current_price || 0))
    case 'recent':
      return arr.sort((a, b) => new Date(b.last_scraped || 0) - new Date(a.last_scraped || 0))
    default: // alpha
      return arr.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export default function Dashboard({
  categories, products, loading, error,
  scraping, lastUpdated,
  onAddCategory, onDeleteCategory,
  onAddProduct, onDeleteProduct,
  onScrapeNow, onRefresh, onMoveProduct,
}) {
  const [filter, setFilter]         = useState('all')
  const [sort, setSort]             = useState('alpha')
  const [search, setSearch]         = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat]   = useState(false)
  const [expandAll, setExpandAll]   = useState(false)
  const [bulkOpen, setBulkOpen]       = useState(false)

  const nok = n => n != null ? Number(n).toLocaleString('nb-NO') + ' kr' : '—'

  const drops    = products.filter(p => getStatus(p) === 'drop')
  const ups      = products.filter(p => getStatus(p) === 'up')
  const bestDrop = drops.reduce((best, p) => {
    const saving = (p.price_30d_high || 0) - (p.current_price || 0)
    return saving > best ? saving : best
  }, 0)

  // Apply search + filter + sort — shared across all categories
  const processedProducts = useMemo(() => {
    let list = products
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.shop?.toLowerCase().includes(q)
      )
    }
    if (filter !== 'all') list = list.filter(p => getStatus(p) === filter)
    return sortProducts(list, sort)
  }, [products, search, filter, sort])

  // Are we in search mode? If so, flatten all into one virtual "results" category
  const isSearching = search.trim().length > 0

  async function submitCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    try {
      await onAddCategory(newCatName.trim())
      setNewCatName('')
      setAddingCat(false)
    } catch (err) { alert(err.message) }
  }

  if (loading) return (
    <div className={styles.loading}><div className={styles.spinner} />Loading Prisvakt...</div>
  )

  if (error) return (
    <div className={styles.error}>
      <p>Could not connect to the server: <strong>{error}</strong></p>
      <p>Make sure the backend is running (<code>npm run server</code>)</p>
      <button onClick={onRefresh}>Try again</button>
    </div>
  )

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Priswatch</h1>
          <p className={styles.subtitle}>
            {(() => {
              const lastScrape = products
                .map(p => p.last_scraped)
                .filter(Boolean)
                .sort()
                .pop()
              if (!lastScrape) return 'Personal price tracker'
              const d = new Date(lastScrape)
              return `Last scraped ${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} at ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`
            })()}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={onScrapeNow} disabled={scraping}>
            {scraping ? 'Scraping...' : 'Refresh prices'}
          </button>
          <button className={styles.btnSecondary} onClick={() => setBulkOpen(true)}>⤓ Bulk import</button>
          <button className={styles.btnPrimary} onClick={() => setAddingCat(true)}>+ Add category</button>
        </div>
      </header>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Watching</div>
          <div className={styles.statVal}>{products.length}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Price drops</div>
          <div className={`${styles.statVal} ${styles.green}`}>{drops.length}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Price up</div>
          <div className={`${styles.statVal} ${styles.red}`}>{ups.length}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Best drop</div>
          <div className={`${styles.statVal} ${styles.green}`}>{bestDrop > 0 ? nok(bestDrop) : '—'}</div>
        </div>
      </div>

      {/* Search bar */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            placeholder="Search products or shops..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>×</button>
          )}
        </div>
      </div>

      {/* Filter + sort row */}
      <div className={styles.filterRow}>
        <div className={styles.filters}>
          {['all', 'drop', 'up', 'flat'].map(f => (
            <button key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'drop' ? 'Drop' : f === 'up' ? 'Up' : 'Stable'}
            </button>
          ))}
        </div>
        <div className={styles.sortWrap}>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <button className={styles.expandBtn} onClick={() => setExpandAll(x => !x)}>
          {expandAll ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {addingCat && (
        <form className={styles.addCatForm} onSubmit={submitCategory}>
          <input autoFocus className={styles.input} placeholder="Category name (e.g. Monitors)"
            value={newCatName} onChange={e => setNewCatName(e.target.value)} />
          <button type="submit" className={styles.btnPrimary}>Add</button>
          <button type="button" className={styles.btnSecondary} onClick={() => setAddingCat(false)}>Cancel</button>
        </form>
      )}

      <div className={styles.categories}>
        {/* Search mode — flat list across all categories */}
        {isSearching && (
          processedProducts.length === 0
            ? <div className={styles.empty}>No products match "{search}"</div>
            : <CategoryRow
                category={{ id: -1, name: `Results for "${search}" (${processedProducts.length})` }}
                products={processedProducts}
                allProducts={processedProducts}
                forceOpen={true}
                onAddProduct={() => {}}
                onDeleteProduct={onDeleteProduct}
                onMovedProduct={onMoveProduct}
                categories={categories}
                onDeleteCategory={() => {}}
                hideActions
              />
        )}

        {/* Normal category view */}
        {!isSearching && (
          <>
            {categories.length === 0 && (
              <div className={styles.empty}>No categories yet. Add one above to start tracking prices.</div>
            )}
            {categories.map(cat => {
              const allCatProducts = products.filter(p => p.category_id === cat.id)
              const catProducts = sortProducts(
                allCatProducts.filter(p => filter === 'all' || getStatus(p) === filter),
                sort
              )
              return (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  products={catProducts}
                  allProducts={allCatProducts}
                  forceOpen={expandAll}
                  onAddProduct={url => onAddProduct(cat.id, url)}
                  onDeleteProduct={onDeleteProduct}
                  onMovedProduct={onMoveProduct}
                  categories={categories}
                  onDeleteCategory={() => {
                    if (window.confirm(`Delete "${cat.name}" and all its products?`)) onDeleteCategory(cat.id)
                  }}
                />
              )
            })}
          </>
        )}
      </div>
      {bulkOpen && (
        <BulkImport
          categories={categories}
          onAddProduct={onAddProduct}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  )
}
