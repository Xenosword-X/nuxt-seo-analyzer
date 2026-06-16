import type { SeoProviderResult } from '../../../../server/utils/providers/shared/types'
import { toProviderSnapshotRow } from '../../../../server/utils/providers/shared/snapshot'

interface NamedSnapshot {
  domainRating: number
  topPages: Array<{ url: string, traffic: number }>
}

const result: SeoProviderResult<NamedSnapshot> = {
  provider: 'ahrefs',
  mode: 'demo',
  status: 'ready',
  cached: false,
  fetchedAt: '2026-06-16T00:00:00.000Z',
  data: { domainRating: 42, topPages: [{ url: 'https://example.com', traffic: 100 }] },
}

const row = toProviderSnapshotRow<NamedSnapshot>('project-1', result)
row.data.domainRating.toFixed(0)

interface InvalidSnapshot {
  generatedAt: Date
}

const invalidResult: SeoProviderResult<InvalidSnapshot> = {
  provider: 'ahrefs',
  mode: 'demo',
  status: 'ready',
  cached: false,
  fetchedAt: '2026-06-16T00:00:00.000Z',
  // @ts-expect-error Date is not JSON-compatible
  data: { generatedAt: new Date('2026-06-16T00:00:00.000Z') },
}

void invalidResult
