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

  it('returns a finite score for malformed numeric values', () => {
    const score = calculateProjectHealthScore({
      auditScore: Number.NaN,
      ahrefs: { domainRating: Number.NaN },
      gsc: { ctr: Number.NaN, averagePosition: Number.NaN },
      crawler: {
        brokenLinks: Number.NaN,
        missingDescriptions: Number.NaN,
        duplicateTitles: Number.NaN,
      },
    })

    expect(Number.isFinite(score)).toBe(true)
  })

  it('clamps extreme inputs into score bounds', () => {
    const score = calculateProjectHealthScore({
      auditScore: 500,
      ahrefs: { domainRating: 500 },
      gsc: { ctr: 20, averagePosition: -5 },
      crawler: { brokenLinks: -20, missingDescriptions: -100, duplicateTitles: -10 },
    })

    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
