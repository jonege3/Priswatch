import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard.jsx'
import { get, post, del } from './hooks/api.js'

// A product counts as a "price drop" if current price is at least 3% below
// the 30-day high. This uses our own scraped history, not Prisjakt's marketing.
export const DROP_THRESHOLD = 0.03

export function getStatus(product) {
  const cur  = product.current_price
  const high = product.price_30d_high
  if (!cur || !high) return 'flat'
  const dropPct = (high - cur) / high
  if (dropPct >= DROP_THRESHOLD) return 'drop'
  if (cur > high) return 'up'   // shouldn't happen often but covers edge case
  return 'flat'
}

export default function App() {
  const [categories, setCategories] = useState([])
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [scraping, setScraping]     = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([get('/categories'), get('/products')])
      setCategories(cats)
      setProducts(prods)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addCategory(name) {
    const cat = await post('/categories', { name })
    setCategories(prev => [...prev, { ...cat, product_count: 0 }])
  }

  async function deleteCategory(id) {
    await del(`/categories/${id}`)
    setCategories(prev => prev.filter(c => c.id !== id))
    setProducts(prev => prev.filter(p => p.category_id !== id))
  }

  async function addProduct(categoryId, url) {
    const product = await post('/products', { category_id: categoryId, url })
    setProducts(prev => [...prev, product])
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, product_count: c.product_count + 1 } : c))
    return product
  }

  async function deleteProduct(id) {
    await del(`/products/${id}`)
    const product = products.find(p => p.id === id)
    setProducts(prev => prev.filter(p => p.id !== id))
    if (product) {
      setCategories(prev => prev.map(c => c.id === product.category_id ? { ...c, product_count: Math.max(0, c.product_count - 1) } : c))
    }
  }

  async function moveProduct(id, newCategoryId) {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, category_id: newCategoryId } : p
    ))
    // Update category product counts
    const product = products.find(p => p.id === id)
    if (product) {
      setCategories(prev => prev.map(c => {
        if (c.id === product.category_id) return { ...c, product_count: Math.max(0, c.product_count - 1) }
        if (c.id === newCategoryId)       return { ...c, product_count: c.product_count + 1 }
        return c
      }))
    }
  }

  async function triggerScrape() {
    setScraping(true)
    try {
      await post('/products/scrape', {})
      setTimeout(() => { load(); setScraping(false) }, 8000)
    } catch (e) { setScraping(false) }
  }

  return (
    <Dashboard
      categories={categories}
      products={products}
      loading={loading}
      error={error}
      scraping={scraping}
      lastUpdated={lastUpdated}
      onAddCategory={addCategory}
      onDeleteCategory={deleteCategory}
      onAddProduct={addProduct}
      onDeleteProduct={deleteProduct}
      onScrapeNow={triggerScrape}
      onRefresh={load}
      onMoveProduct={moveProduct}
    />
  )
}
