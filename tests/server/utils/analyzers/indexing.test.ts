import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeIndexing } from '~/server/utils/analyzers/indexing'

vi.stubGlobal('useRuntimeConfig', () => ({
  serpApiKeys: '["serpkey1"]',
  apifyKeys: '["apifykey1"]',
  scraperApiKeys: '["scraperkey1"]',
}))

describe('analyzeIndexing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('SerpApi 成功且有索引結果：engineUsed=serpapi，isIndexed=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ search_information: { total_results: '1,230' } }),
    }))
    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('serpapi')
    expect(result.isIndexed).toBe(true)
    expect(result.resultCount).toBeGreaterThan(0)
    expect(result.issues).toHaveLength(0)
  })

  it('SerpApi 回傳 0 結果：isIndexed=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ search_information: { total_results: '0' } }),
    }))
    const result = await analyzeIndexing('https://example.com/page')
    expect(result.isIndexed).toBe(false)
    expect(result.issues.some(i => i.includes('索引'))).toBe(true)
  })

  it('SerpApi 有 error 欄位 → 降級到 Apify', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'credit limit reached' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ resultsTotal: 500 }]),
      })
    )
    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('apify')
    expect(result.isIndexed).toBe(true)
  })

  it('所有引擎都失敗：engineUsed=failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('failed')
    expect(result.issues.some(i => i.includes('失敗'))).toBe(true)
  })
})
