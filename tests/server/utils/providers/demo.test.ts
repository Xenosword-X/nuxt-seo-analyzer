import { describe, expect, it } from 'vitest'
import { getDemoAhrefsSnapshot } from '../../../../server/utils/providers/ahrefs/demo'
import { getDemoGscSnapshot } from '../../../../server/utils/providers/gsc/demo'
import { getDemoCrawlerSnapshot } from '../../../../server/utils/providers/crawler/demo'
import { isSnapshotStale, toProviderSnapshotRow } from '../../../../server/utils/providers/shared/snapshot'

interface NamedSnapshot {
  domainRating: number
  topPages: Array<{ url: string, traffic: number }>
}

describe('provider snapshot helpers', () => {
  it('marks expired snapshots as stale', () => {
    expect(isSnapshotStale('2026-06-16T00:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(true)
  })

  it('keeps future snapshots fresh', () => {
    expect(isSnapshotStale('2026-06-16T02:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(false)
  })

  it('treats invalid expiry timestamps as stale', () => {
    expect(isSnapshotStale('not-a-date', new Date('2026-06-16T01:00:00.000Z'))).toBe(true)
  })

  it('converts provider results into insertable rows', () => {
    const row = toProviderSnapshotRow('project-1', {
      provider: 'ahrefs',
      mode: 'demo',
      status: 'ready',
      cached: false,
      fetchedAt: '2026-06-16T00:00:00.000Z',
      expiresAt: '2026-06-17T00:00:00.000Z',
      data: { domainRating: 42 },
    })

    expect(row).toEqual({
      project_id: 'project-1',
      provider: 'ahrefs',
      mode: 'demo',
      status: 'ready',
      fetched_at: '2026-06-16T00:00:00.000Z',
      expires_at: '2026-06-17T00:00:00.000Z',
      data: { domainRating: 42 },
      error: null,
    })
  })

  it('accepts named JSON-compatible provider payload interfaces', () => {
    const row = toProviderSnapshotRow<NamedSnapshot>('project-1', {
      provider: 'ahrefs',
      mode: 'demo',
      status: 'ready',
      cached: false,
      fetchedAt: '2026-06-16T00:00:00.000Z',
      data: { domainRating: 42, topPages: [{ url: 'https://example.com', traffic: 100 }] },
    })

    expect(row.data.domainRating).toBe(42)
  })
})

describe('demo providers', () => {
  it('returns deterministic Ahrefs demo data', () => {
    const result = getDemoAhrefsSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('ahrefs')
    expect(result.mode).toBe('demo')
    expect(result.status).toBe('ready')
    expect(result.data.domainRating).toBeGreaterThan(0)
    expect(result.data.topPages[0].url).toContain('example.com')
  })

  it('returns deterministic GSC demo data', () => {
    const result = getDemoGscSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('gsc')
    expect(result.data.topQueries[0].query).toContain('example')
    expect(result.data.ctr).toBeGreaterThan(0)
  })

  it('returns deterministic crawler demo data', () => {
    const result = getDemoCrawlerSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('crawler')
    expect(result.data.crawledUrls).toBeGreaterThan(0)
    expect(result.data.topIssues.length).toBeGreaterThan(0)
  })
})
