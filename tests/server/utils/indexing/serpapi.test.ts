import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkViaSerpApi } from '../../../../server/utils/indexing/serpapi'

describe('checkViaSerpApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('回傳網頁收錄數（由 search_information.total_results）', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search_information: { total_results: 1250 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images_results: Array(45).fill({}) }),
      }))

    const result = await checkViaSerpApi('example.com', ['key1'])
    expect(result).toEqual({ pagesIndexed: 1250, imagesIndexed: 45 })
  })

  it('網頁為 0 時不查圖片', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_information: { total_results: 0 } }),
    }))

    const result = await checkViaSerpApi('example.com', ['key1'])
    expect(result).toEqual({ pagesIndexed: 0, imagesIndexed: 0 })
    expect(vi.mocked(fetch).mock.calls.length).toBe(1)
  })

  it('遇到 429 時切下一把金鑰', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limit' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search_information: { total_results: 500 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images_results: [] }),
      }))

    const result = await checkViaSerpApi('example.com', ['bad', 'good'])
    expect(result?.pagesIndexed).toBe(500)
  })

  it('所有金鑰失敗時回傳 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => 'quota exceeded',
    }))

    const result = await checkViaSerpApi('example.com', ['k1', 'k2'])
    expect(result).toBeNull()
  })
})
