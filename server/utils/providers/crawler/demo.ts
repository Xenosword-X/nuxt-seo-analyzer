import { normalizeDomain } from '../../domain'
import { addHours } from '../shared/snapshot'
import type { SeoProviderResult } from '../shared/types'
import type { CrawlerSnapshot } from './types'

export function getDemoCrawlerSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<CrawlerSnapshot> {
  const normalized = normalizeDomain(domain)

  return {
    provider: 'crawler',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      crawledUrls: 186,
      brokenLinks: 7,
      missingTitles: 4,
      missingDescriptions: 18,
      duplicateTitles: 9,
      duplicateDescriptions: 14,
      redirectChains: 3,
      topIssues: [
        {
          type: 'broken_links',
          count: 7,
          sampleUrls: [`https://${normalized}/old-campaign`, `https://${normalized}/blog/deleted-post`],
        },
        {
          type: 'missing_descriptions',
          count: 18,
          sampleUrls: [`https://${normalized}/blog/seo-checklist`, `https://${normalized}/case-studies/client-a`],
        },
      ],
    },
  }
}
