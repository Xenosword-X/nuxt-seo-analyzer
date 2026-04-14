import type { IndexingResult } from './types'
import { parseKeys } from '../indexing/parse-keys'

interface CheckResult {
  isIndexed: boolean
  resultCount: number
}

export async function analyzeIndexing(url: string): Promise<IndexingResult> {
  const config = useRuntimeConfig()
  const domain = new URL(url).hostname

  const serpKeys = parseKeys(config.serpApiKeys)
  const apifyKeys = parseKeys(config.apifyKeys)
  const scraperKeys = parseKeys(config.scraperApiKeys)

  if (serpKeys.length > 0) {
    const r = await checkViaSerpApi(domain, serpKeys)
    if (r) return toResult(r, 'serpapi')
  }

  if (apifyKeys.length > 0) {
    const r = await checkViaApify(domain, apifyKeys)
    if (r) return toResult(r, 'apify')
  }

  if (scraperKeys.length > 0) {
    const r = await checkViaScraperApi(domain, scraperKeys)
    if (r) return toResult(r, 'scraperapi')
  }

  return {
    isIndexed: false,
    resultCount: null,
    engineUsed: 'failed',
    issues: ['所有索引檢查引擎均失敗，請檢查 API 金鑰設定'],
  }
}

function toResult(r: CheckResult, engine: IndexingResult['engineUsed']): IndexingResult {
  return {
    isIndexed: r.isIndexed,
    resultCount: r.resultCount,
    engineUsed: engine,
    issues: r.isIndexed ? [] : ['頁面未被 Google 索引，建議提交至 Google Search Console'],
  }
}

async function checkViaSerpApi(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const query = encodeURIComponent(`site:${domain}`)
      const res = await fetch(
        `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${key}&num=1`,
        { signal: AbortSignal.timeout(15_000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue
      const count = Number(String(data.search_information?.total_results ?? '0').replace(/,/g, ''))
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}

async function checkViaApify(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries: `site:${domain}`, resultsPerPage: 1, maxPagesPerQuery: 1 }),
          signal: AbortSignal.timeout(60_000),
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      const count = data?.[0]?.resultsTotal ?? 0
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}

async function checkViaScraperApi(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const query = encodeURIComponent(`site:${domain}`)
      const targetUrl = encodeURIComponent(`https://www.google.com/search?q=${query}&num=1&hl=zh-TW`)
      const res = await fetch(
        `http://api.scraperapi.com/?api_key=${key}&url=${targetUrl}`,
        { signal: AbortSignal.timeout(30_000) }
      )
      if (!res.ok) continue
      const html = await res.text()
      const match = html.match(/約有\s*([\d,]+)\s*項/) || html.match(/([\d,]+)\s*results/)
      const count = match ? parseInt(match[1].replace(/,/g, '')) : 0
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}
