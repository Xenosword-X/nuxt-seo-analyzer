import { describe, expect, it } from 'vitest'
import { isSnapshotStale, toProviderSnapshotRow } from '../../../../server/utils/providers/shared/snapshot'

describe('provider snapshot helpers', () => {
  it('marks expired snapshots as stale', () => {
    expect(isSnapshotStale('2026-06-16T00:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(true)
  })

  it('keeps future snapshots fresh', () => {
    expect(isSnapshotStale('2026-06-16T02:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(false)
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
})
