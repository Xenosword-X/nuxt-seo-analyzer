import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../server/utils/indexing/serpapi')
vi.mock('../../../../server/utils/indexing/scraperapi')
vi.mock('../../../../server/utils/indexing/apify')

import { checkDomainIndexing } from '../../../../server/utils/indexing/engine'
import { checkViaSerpApi } from '../../../../server/utils/indexing/serpapi'
import { checkViaScraperApi } from '../../../../server/utils/indexing/scraperapi'
import { checkViaApify } from '../../../../server/utils/indexing/apify'

describe('checkDomainIndexing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('SerpApi 成功時不呼叫其他引擎', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue({ pagesIndexed: 100, imagesIndexed: 10 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r).toEqual({
      pagesIndexed: 100, imagesIndexed: 10, engineUsed: 'serpapi',
    })
    expect(checkViaScraperApi).not.toHaveBeenCalled()
    expect(checkViaApify).not.toHaveBeenCalled()
  })

  it('SerpApi 失敗降級到 ScraperAPI', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue(null)
    vi.mocked(checkViaScraperApi).mockResolvedValue({ pagesIndexed: 50, imagesIndexed: 5 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r.engineUsed).toBe('scraperapi')
  })

  it('三引擎全失敗回傳 null 數值', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue(null)
    vi.mocked(checkViaScraperApi).mockResolvedValue(null)
    vi.mocked(checkViaApify).mockResolvedValue(null)
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r).toEqual({
      pagesIndexed: null, imagesIndexed: null, engineUsed: null,
      error: 'all engines exhausted',
    })
  })

  it('沒設定金鑰的引擎自動跳過', async () => {
    vi.mocked(checkViaScraperApi).mockResolvedValue({ pagesIndexed: 10, imagesIndexed: 1 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: [], scraperapi: ['b'], apify: [],
    })
    expect(r.engineUsed).toBe('scraperapi')
    expect(checkViaSerpApi).not.toHaveBeenCalled()
  })
})
