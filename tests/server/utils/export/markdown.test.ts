import { describe, it, expect } from 'vitest'
import { buildMarkdown } from '../../../../server/utils/export/markdown'

describe('buildMarkdown', () => {
  const input = {
    domain: 'example.com',
    analyzedAt: '2026-04-14 10:32',
    pageCount: 2,
    siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
    aiReport: '## 整體摘要\n這個站表現不錯。',
    analyses: [
      {
        url: 'https://example.com/',
        meta_tags: { title: '首頁', issues: ['缺少 description'] },
        core_web_vitals: { speedScore: 85, issues: [] },
        headings: { h1: ['首頁'], issues: [] },
        indexing: { isIndexed: true, issues: [] },
        schema_data: { types: ['Article'], issues: [] },
        images: { missingAlt: 0, issues: [] },
        robots_sitemap: { issues: [] },
      },
      {
        url: 'https://example.com/blog',
        meta_tags: { title: '部落格', issues: [] },
        core_web_vitals: { speedScore: 72, issues: ['LCP > 4s'] },
        headings: { h1: [], issues: ['缺少 H1'] },
        indexing: { isIndexed: true, issues: [] },
        schema_data: { types: [], issues: [] },
        images: { missingAlt: 3, issues: ['3 張圖片缺 alt'] },
        robots_sitemap: { issues: [] },
      },
    ],
  }

  it('輸出包含網域與分析時間', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('# SEO 分析報告：example.com')
    expect(out).toContain('分析時間：2026-04-14 10:32')
  })

  it('包含整站收錄表格', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('| 網頁收錄 | 1,250 |')
    expect(out).toContain('| 圖片收錄 | 45 |')
  })

  it('嵌入 AI 報告原文', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('這個站表現不錯')
  })

  it('列出每頁問題', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('https://example.com/blog')
    expect(out).toContain('3 張圖片缺 alt')
    expect(out).toContain('缺少 H1')
  })
})
