import { useState, useEffect } from 'react'
import ProductRow from './ProductRow.jsx'
import { getStatus } from '../App.jsx'
import styles from './CategoryRow.module.css'


function FolderIcon() {
  return (
    <svg className={styles.folderIcon} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H6.086a1 1 0 0 1 .707.293L7.914 3.9A1 1 0 0 0 8.621 4.2H13.5c.552 0 1 .448 1 1v7.3c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V3.5z" fill="currentColor" opacity="0.15"/>
      <path d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H6.086a1 1 0 0 1 .707.293L7.914 3.9A1 1 0 0 0 8.621 4.2H13.5c.552 0 1 .448 1 1v7.3c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V3.5z" stroke="currentColor" strokeWidth="1"/>
    </svg>
  )
}

export default function CategoryRow({
  category, products, allProducts, forceOpen,
  onAddProduct, onDeleteProduct, onDeleteCategory, onMovedProduct,
  hideActions = false, categories = [],
}) {
  const [open, setOpen]         = useState(false)
  const [adding, setAdding]     = useState(false)
  const [url, setUrl]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [addError, setAddError] = useState(null)
  const [addMsg, setAddMsg]     = useState(null)

  useEffect(() => { setOpen(forceOpen) }, [forceOpen])

  // Pills use allProducts (unfiltered) so counts don't change when filter active
  const dropCnt = allProducts.filter(p => getStatus(p) === 'drop').length
  const upCnt   = allProducts.filter(p => getStatus(p) === 'up').length

  async function handleAdd(e) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setAddError(null)
    setAddMsg(null)
    try {
      const product = await onAddProduct(url.trim())
      const imported = product?.historyImported || 0
      setAddMsg(imported > 0
        ? `Added — imported ${imported} historical prices from Prisjakt`
        : 'Added — price history will build up over time')
      setUrl('')
      setAdding(false)
      setTimeout(() => setAddMsg(null), 5000)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.cat}>
      <div className={styles.header} onClick={() => setOpen(o => !o)}>
        <span className={`${styles.arrow} ${open ? styles.open : ''}`}>▶</span>
        <span className={styles.name}>{category.name}</span>
        <div className={styles.pills}>
          <span className={styles.pillTotal}>{allProducts.length}</span>
          {dropCnt > 0 && <span className={styles.pillDrop}>↓ {dropCnt}</span>}
          {upCnt   > 0 && <span className={styles.pillUp}>↑ {upCnt}</span>}
        </div>
        {!hideActions && (
          <div className={styles.catActions} onClick={e => e.stopPropagation()}>
            <button className={styles.addBtn} onClick={() => { setOpen(true); setAdding(a => !a) }}>+ Add</button>
            <button className={styles.delBtn} onClick={onDeleteCategory} title="Delete category">×</button>
          </div>
        )}
      </div>

      {open && (
        <div className={styles.body}>
          {adding && (
            <form className={styles.addForm} onSubmit={handleAdd}>
              <input
                autoFocus
                className={styles.input}
                placeholder="Paste Prisjakt URL (e.g. https://www.prisjakt.no/produkt/...)"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={loading}
              />
              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? 'Looking up...' : 'Track'}
              </button>
              <button type="button" className={styles.btnSecondary}
                onClick={() => { setAdding(false); setAddError(null); setUrl('') }}>
                Cancel
              </button>
              {addError && <span className={styles.addError}>{addError}</span>}
            </form>
          )}
          {addMsg && <div className={styles.addMsg}>{addMsg}</div>}
          {products.length === 0 && !adding ? (
            <div className={styles.emptyBody}>
              No products here —{' '}
              <button className={styles.inlineLink} onClick={() => setAdding(true)}>add one</button>
            </div>
          ) : (
            products.map(product => (
              <ProductRow key={product.id} product={product} onDelete={() => onDeleteProduct(product.id)} onMoved={onMovedProduct} categories={categories} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
