import { describe, expect, it } from 'vitest'
import { calculateProjectHealthScore } from '../../../../server/utils/projects/score'

describe('calculateProjectHealthScore', () => {
  it('returns a weighted score from provider snapshots', () => {
    const score = calculateProjectHealthScore({
      auditScore: 82,
      ahrefs: { domainRating: 46 },
      gsc: { ctr: 0.038, averagePosition: 12.4 },
      crawler: { brokenLinks: 7, missingDescriptions: 18, duplicateTitles: 9 },
    })

    expect(score).toBe(69)
  })

  it('uses demo-safe defaults when audit score is missing', () => {
    const score = calculateProjectHealthScore({
      ahrefs: { domainRating: 46 },
      gsc: { ctr: 0.038, averagePosition: 12.4 },
      crawler: { brokenLinks: 7, missingDescriptions: 18, duplicateTitles: 9 },
    })

    expect(score).toBe(68)
  })
})
