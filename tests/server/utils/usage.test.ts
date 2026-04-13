// tests/server/utils/usage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useServerSupabase
vi.mock('../../../server/utils/supabase', () => ({
  useServerSupabase: vi.fn(),
}))

// Mock createError (Nuxt H3 global)
vi.stubGlobal('createError', (opts: { statusCode: number; message: string }) => {
  const err = new Error(opts.message) as any
  err.statusCode = opts.statusCode
  return err
})

import { getUsage, incrementUsage } from '../../../server/utils/usage'
import { useServerSupabase } from '../../../server/utils/supabase'

function makeSupabaseMock(existingRow: any) {
  const single = vi.fn().mockResolvedValue({ data: existingRow, error: null })
  const eq2 = vi.fn().mockReturnValue({ single })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2, single })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })
  const insert = vi.fn().mockResolvedValue({})
  return { from: vi.fn().mockReturnValue({ select, update, insert }) }
}

describe('getUsage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('今日無記錄時回傳 used=0', async () => {
    const mock = makeSupabaseMock(null)
    vi.mocked(useServerSupabase).mockReturnValue(mock as any)

    const result = await getUsage('user-123', 5)
    expect(result).toEqual({ used: 0, limit: 5, remaining: 5 })
  })

  it('今日已用 3 次，remaining 正確計算', async () => {
    const mock = makeSupabaseMock({ domain_count: 3 })
    vi.mocked(useServerSupabase).mockReturnValue(mock as any)

    const result = await getUsage('user-123', 5)
    expect(result).toEqual({ used: 3, limit: 5, remaining: 2 })
  })
})

describe('incrementUsage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('今日無記錄時 insert 一筆新記錄', async () => {
    const mock = makeSupabaseMock(null)
    vi.mocked(useServerSupabase).mockReturnValue(mock as any)

    await expect(incrementUsage('user-123', 5)).resolves.toBeUndefined()
    expect(mock.from().insert).toHaveBeenCalled()
  })

  it('今日已有記錄時 update +1', async () => {
    const mock = makeSupabaseMock({ id: 'row-1', domain_count: 2 })
    vi.mocked(useServerSupabase).mockReturnValue(mock as any)

    await expect(incrementUsage('user-123', 5)).resolves.toBeUndefined()
    expect(mock.from().update).toHaveBeenCalled()
  })

  it('已達上限時拋出 429 錯誤', async () => {
    const mock = makeSupabaseMock({ id: 'row-1', domain_count: 5 })
    vi.mocked(useServerSupabase).mockReturnValue(mock as any)

    await expect(incrementUsage('user-123', 5)).rejects.toMatchObject({
      statusCode: 429,
    })
  })
})
