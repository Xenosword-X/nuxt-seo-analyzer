// server/utils/indexing/engine.ts
import type { DomainIndexingResult } from './types'
import { checkViaSerpApi } from './serpapi'
import { checkViaScraperApi } from './scraperapi'
import { checkViaApify } from './apify'

export interface EngineKeys {
  serpapi: string[]
  scraperapi: string[]
  apify: string[]
}

export async function checkDomainIndexing(
  domain: string,
  keys: EngineKeys,
): Promise<DomainIndexingResult> {
  if (keys.serpapi.length > 0) {
    const r = await checkViaSerpApi(domain, keys.serpapi)
    if (r) return { ...r, engineUsed: 'serpapi' }
  }
  if (keys.scraperapi.length > 0) {
    const r = await checkViaScraperApi(domain, keys.scraperapi)
    if (r) return { ...r, engineUsed: 'scraperapi' }
  }
  if (keys.apify.length > 0) {
    const r = await checkViaApify(domain, keys.apify)
    if (r) return { ...r, engineUsed: 'apify' }
  }
  return {
    pagesIndexed: null,
    imagesIndexed: null,
    engineUsed: null,
    error: 'all engines exhausted',
  }
}
