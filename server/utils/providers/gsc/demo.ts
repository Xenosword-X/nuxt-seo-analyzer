import { addHours } from '../shared/snapshot'
import { buildDemoUrl, normalizeProviderHost } from '../shared/url'
import type { SeoProviderResult } from '../shared/types'
import type { GscSnapshot } from './types'

export function getDemoGscSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<GscSnapshot> {
  const host = normalizeProviderHost(domain)
  const brand = host.split('.')[0] || 'brand'

  return {
    provider: 'gsc',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      clicks: 4820,
      impressions: 126400,
      ctr: 0.038,
      averagePosition: 12.4,
      topQueries: [
        { query: `${brand} seo`, clicks: 840, impressions: 9800, ctr: 0.086, position: 3.2 },
        { query: 'seo audit checklist', clicks: 510, impressions: 18500, ctr: 0.028, position: 8.7 },
        { query: 'technical seo tool', clicks: 270, impressions: 12100, ctr: 0.022, position: 11.9 },
      ],
      opportunities: [
        {
          query: 'seo audit checklist',
          reason: 'High impressions with low CTR; refresh title and meta description.',
          page: buildDemoUrl(host, '/blog/seo-checklist'),
        },
        {
          query: 'technical seo tool',
          reason: 'Ranking near page one; expand content depth and add FAQ schema.',
          page: buildDemoUrl(host, '/services/seo'),
        },
      ],
    },
  }
}
