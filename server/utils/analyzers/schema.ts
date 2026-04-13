import * as cheerio from 'cheerio'
import type { SchemaResult } from './types'

export async function analyzeSchema(url: string): Promise<SchemaResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { types: [], count: 0, issues: ['頁面無法訪問'] }
    const html = await res.text()
    return parseSchema(html)
  } catch {
    return { types: [], count: 0, issues: ['頁面載入失敗'] }
  }
}

function parseSchema(html: string): SchemaResult {
  const $ = cheerio.load(html)
  const types: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type']) {
          const t = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
          types.push(...t.filter(Boolean))
        }
      }
    } catch { }
  })
  const issues = types.length === 0 ? ['未偵測到結構化資料（JSON-LD），建議加入 Schema 標記'] : []
  return { types, count: types.length, issues }
}
