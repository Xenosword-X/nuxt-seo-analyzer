// server/utils/indexing/serpapi.ts
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const SERP_URL = 'https://serpapi.com/search.json'
const DELAY_MS = 500

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function queryPages(domain: string, key: string): Promise<number> {
  const url = `${SERP_URL}?engine=google&q=${encodeURIComponent(`site:${domain}`)}&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  const data: any = await res.json()
  return Number(data?.search_information?.total_results ?? 0)
}

async function queryImages(domain: string, key: string): Promise<number> {
  const url = `${SERP_URL}?engine=google_images&q=${encodeURIComponent(`site:${domain}`)}&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  const data: any = await res.json()
  return Array.isArray(data?.images_results) ? data.images_results.length : 0
}

export async function checkViaSerpApi(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const key of keys) {
    try {
      const pages = await queryPages(domain, key)
      await sleep(DELAY_MS)
      const images = pages > 0 ? await queryImages(domain, key) : 0
      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) {
        continue
      }
      // 非配額錯誤也切下一把（保守策略，對齊 Python 版）
      continue
    }
  }
  return null
}
