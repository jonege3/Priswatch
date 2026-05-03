import { useState, useEffect, useCallback } from 'react'
import Dashboard from './components/Dashboard.jsx'
import { get, post, del } from './hooks/api.js'

// Compare current price to price 7 days ago — what's happening RIGHT NOW
// Threshold: 2% move is meaningful, less than that is noise
export const THRESHOLD = 0.02

export function getStatus(product) {
  const cur  = product.current_price
  const ago  = product.price_7d_ago
  if (!cur || !ago) return 'flat'
  const change = (ago - cur) / ago
  if (change >= THRESHOLD)  return 'drop' // cheaper than 7 days ago
  if (change <= -THRESHOLD) return 'up'   // more expensive than 7 days ago
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
    // Reload full product list so 30d stats and all fields are populated correctly
    const prods = await get('/products')
    setProducts(prods)
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
