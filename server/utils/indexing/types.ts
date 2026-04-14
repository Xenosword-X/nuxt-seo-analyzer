// server/utils/indexing/types.ts
export type IndexingEngine = 'serpapi' | 'scraperapi' | 'apify'

export interface DomainIndexingResult {
  pagesIndexed: number | null
  imagesIndexed: number | null
  engineUsed: IndexingEngine | null
  error?: string
}

export interface EngineCheckResult {
  pagesIndexed: number
  imagesIndexed: number
}

// 配額耗盡的關鍵字（觸發下一把 key）。不含 'token' / '401' / 'unauthorized'，避免
// 一般認證設定錯誤被靜默當成配額問題；真正配額錯誤通常含 429 / quota / limit / 402 / 403。
export const QUOTA_KEYWORDS = [
  '429', 'quota', 'limit', '402', '403',
  'not-enough-usage', 'rate limit', 'rate_limit', 'rate-limited',
]

export function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return QUOTA_KEYWORDS.some((kw) => lower.includes(kw))
}
