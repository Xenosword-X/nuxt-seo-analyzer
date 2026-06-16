import { addHours } from '../shared/snapshot'
import { buildDemoUrl, normalizeProviderHost } from '../shared/url'
import type { SeoProviderResult } from '../shared/types'
import type { AhrefsSnapshot } from './types'

export function getDemoAhrefsSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<AhrefsSnapshot> {
  const host = normalizeProviderHost(domain)

  return {
    provider: 'ahrefs',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      domainRating: 46,
      backlinks: 12840,
      referringDomains: 386,
      organicKeywords: 2140,
      organicTrafficEstimate: 18400,
      topPages: [
        { url: buildDemoUrl(host, '/'), traffic: 5200, keywords: 420 },
        { url: buildDemoUrl(host, '/blog/seo-checklist'), traffic: 2600, keywords: 190 },
        { url: buildDemoUrl(host, '/services/seo'), traffic: 1800, keywords: 155 },
      ],
      competitors: [
        { domain: 'competitor-a.com', overlapScore: 72 },
        { domain: 'competitor-b.com', overlapScore: 58 },
        { domain: 'competitor-c.com', overlapScore: 41 },
      ],
    },
  }
}
