import { describe, it, expect, vi } from 'vitest'
import { readCache, writeCache } from '../../../../server/utils/indexing/cache'

function mockSupabase(selectRow: any | null) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: selectRow, error: null }),
  } as any
}

describe('readCache', () => {
  it('命中未過期快取時回傳資料', async () => {
    const sb = mockSupabase({
      domain: 'example.com',
      pages_indexed: 1250,
      images_indexed: 45,
      engine_used: 'serpapi',
      checked_at: '2026-04-14T10:00:00Z',
    })
    const result = await readCache(sb, 'example.com')
    expect(result?.pagesIndexed).toBe(1250)
    expect(result?.imagesIndexed).toBe(45)
    expect(result?.engineUsed).toBe('serpapi')
  })

  it('未命中回傳 null', async () => {
    const sb = mockSupabase(null)
    const result = await readCache(sb, 'example.com')
    expect(result).toBeNull()
  })
})

describe('writeCache', () => {
  it('呼叫 upsert 並帶入 expires_at', async () => {
    const sb = mockSupabase(null)
    await writeCache(sb, 'example.com', {
      pagesIndexed: 100, imagesIndexed: 5, engineUsed: 'serpapi',
    }, 24)
    expect(sb.upsert).toHaveBeenCalledTimes(1)
    const arg = (sb.upsert as any).mock.calls[0][0]
    expect(arg.domain).toBe('example.com')
    expect(arg.pages_indexed).toBe(100)
    expect(arg.expires_at).toBeDefined()
  })
})
