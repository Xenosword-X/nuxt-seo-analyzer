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

export const QUOTA_KEYWORDS = [
  '429', 'quota', 'limit', '403', '402', '401',
  'unauthorized', 'not-enough-usage', 'token',
]

export function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return QUOTA_KEYWORDS.some((kw) => lower.includes(kw))
}
