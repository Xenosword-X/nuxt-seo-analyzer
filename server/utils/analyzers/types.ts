// server/utils/analyzers/types.ts

export interface MetaTagsResult {
  title: string | null
  description: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  canonical: string | null
  robotsMeta: string | null
  score: number        // 0-100
  issues: string[]
}

export interface CWVResult {
  fcp: number | null   // First Contentful Paint (ms)
  lcp: number | null   // Largest Contentful Paint (ms)
  tbt: number | null   // Total Blocking Time (ms)
  cls: number | null   // Cumulative Layout Shift
  speedScore: number | null  // 0-100
  issues: string[]
}

export interface RobotsSitemapResult {
  robotsAllowed: boolean
  sitemapExists: boolean
  sitemapUrl: string | null
  issues: string[]
}

export interface SchemaResult {
  types: string[]
  count: number
  issues: string[]
}

export interface HeadingsResult {
  h1: string[]
  h2Count: number
  h3Count: number
  internalLinkCount: number
  issues: string[]
}

export interface ImagesResult {
  total: number
  missingAlt: number
  missingSrcs: string[]
  issues: string[]
}

export interface IndexingResult {
  isIndexed: boolean
  resultCount: number | null
  engineUsed: 'serpapi' | 'apify' | 'scraperapi' | 'failed'
  issues: string[]
}

export interface PageAnalysisResult {
  url: string
  metaTags: MetaTagsResult
  coreWebVitals: CWVResult
  robotsSitemap: RobotsSitemapResult
  schemaData: SchemaResult
  headings: HeadingsResult
  images: ImagesResult
  indexing: IndexingResult
  /** @deprecated 2026-04-14：AI 報告改為整站一份（存於 analysis_sessions.ai_report） */
  aiReport?: string | null
}
