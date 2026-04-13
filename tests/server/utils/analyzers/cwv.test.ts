import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeCWV } from '~/server/utils/analyzers/cwv'

vi.stubGlobal('useRuntimeConfig', () => ({ pagespeedApiKey: 'test-key' }))

const mockResponse = {
  lighthouseResult: {
    categories: { performance: { score: 0.72 } },
    audits: {
      'first-contentful-paint': { numericValue: 1800 },
      'largest-contentful-paint': { numericValue: 2100 },
      'total-blocking-time': { numericValue: 150 },
      'cumulative-layout-shift': { numericValue: 0.05 },
    },
  },
}

describe('analyzeCWV', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('PageSpeed API 成功：正確解析各指標', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) }))
    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBe(72)
    expect(result.fcp).toBe(1800)
    expect(result.lcp).toBe(2100)
    expect(result.tbt).toBe(150)
    expect(result.cls).toBe(0.05)
    expect(result.issues).toHaveLength(0)
  })

  it('speedScore < 50：issues 包含效能警告', async () => {
    const lowScore = { lighthouseResult: { ...mockResponse.lighthouseResult, categories: { performance: { score: 0.35 } } } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(lowScore) }))
    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBe(35)
    expect(result.issues.some(i => i.includes('效能'))).toBe(true)
  })

  it('LCP > 2500ms：issues 包含 LCP 警告', async () => {
    const slowLcp = {
      lighthouseResult: {
        categories: { performance: { score: 0.6 } },
        audits: {
          'first-contentful-paint': { numericValue: 1000 },
          'largest-contentful-paint': { numericValue: 4000 },
          'total-blocking-time': { numericValue: 100 },
          'cumulative-layout-shift': { numericValue: 0.02 },
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(slowLcp) }))
    const result = await analyzeCWV('https://example.com')
    expect(result.issues.some(i => i.includes('LCP'))).toBe(true)
  })

  it('API 請求失敗：所有指標為 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBeNull()
    expect(result.fcp).toBeNull()
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
