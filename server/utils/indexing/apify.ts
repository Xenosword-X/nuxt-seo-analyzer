// server/utils/indexing/apify.ts
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const APIFY_BASE = 'https://api.apify.com/v2/acts'
const GOOGLE_SEARCH_ACTOR = 'apify~google-search-scraper'
const GOOGLE_IMAGES_ACTOR = 'hooli~google-images-scraper'
const MAX_IMAGES = 100

async function runActor(actorId: string, input: any, token: string): Promise<any> {
  const runRes = await fetch(
    `${APIFY_BASE}/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  if (!runRes.ok) {
    const text = await runRes.text()
    throw new Error(`${runRes.status} ${text.slice(0, 200)}`)
  }
  return runRes.json()
}

export async function checkViaApify(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const token of keys) {
    try {
      // 網頁收錄
      const pageItems: any = await runActor(
        GOOGLE_SEARCH_ACTOR,
        { queries: `site:${domain}`, maxPagesPerQuery: 1, resultsPerPage: 10 },
        token,
      )
      const first = Array.isArray(pageItems) && pageItems[0] ? pageItems[0] : null
      const pages = Number(first?.resultsTotal ?? first?.totalResults ?? 0)

      if (pages === 0) return { pagesIndexed: 0, imagesIndexed: 0 }

      // 圖片收錄
      const imgItems: any = await runActor(
        GOOGLE_IMAGES_ACTOR,
        { queries: [`site:${domain}`], maxImages: MAX_IMAGES },
        token,
      )
      const images = Array.isArray(imgItems) ? imgItems.length : 0

      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) continue
      // 非配額錯誤（網路、認證）也切下一把 key 保守處理
      continue
    }
  }
  return null
}
