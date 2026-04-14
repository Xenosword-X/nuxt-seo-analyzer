import { describe, it, expect } from 'vitest'
import { formatSseEvent } from '../../../server/utils/sse'

describe('formatSseEvent', () => {
  it('格式化為 SSE 標準格式', () => {
    const out = formatSseEvent('page_done', { url: 'x', index: 1 })
    expect(out).toBe(`event: page_done\ndata: {"url":"x","index":1}\n\n`)
  })

  it('data 可為字串', () => {
    const out = formatSseEvent('ping', 'hello')
    expect(out).toBe(`event: ping\ndata: "hello"\n\n`)
  })
})
