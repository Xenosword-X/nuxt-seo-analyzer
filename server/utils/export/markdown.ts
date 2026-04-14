// server/utils/export/markdown.ts
interface MdInput {
  domain: string
  analyzedAt: string
  pageCount: number
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  aiReport: string | null
  analyses: any[]
}

function allIssues(a: any): string[] {
  return [
    ...(a.meta_tags?.issues || []),
    ...(a.core_web_vitals?.issues || []),
    ...(a.robots_sitemap?.issues || []),
    ...(a.schema_data?.issues || []),
    ...(a.headings?.issues || []),
    ...(a.images?.issues || []),
    ...(a.indexing?.issues || []),
  ]
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-US')
}

export function buildMarkdown(input: MdInput): string {
  const parts: string[] = []

  parts.push(`# SEO 分析報告：${input.domain}`)
  parts.push('')
  parts.push(`> 分析時間：${input.analyzedAt}  `)
  parts.push(`> 分析頁數：${input.pageCount} 頁`)
  parts.push('')

  parts.push('## 整站 Google 收錄')
  parts.push('')
  parts.push('| 項目 | 數量 |')
  parts.push('|------|------|')
  parts.push(`| 網頁收錄 | ${fmt(input.siteIndexing.pagesIndexed)} |`)
  parts.push(`| 圖片收錄 | ${fmt(input.siteIndexing.imagesIndexed)} |`)
  parts.push(`| 查詢引擎 | ${input.siteIndexing.engine || '—'} |`)
  parts.push('')

  if (input.aiReport) {
    parts.push('## AI 健診摘要')
    parts.push('')
    parts.push(input.aiReport)
    parts.push('')
  }

  parts.push('## 各頁指標摘要')
  parts.push('')
  parts.push('| URL | CWV 總分 | 索引 | 問題數 |')
  parts.push('|-----|---------|------|--------|')
  for (const a of input.analyses) {
    const issues = allIssues(a).length
    const indexed = a.indexing?.isIndexed ? '✅' : '❌'
    parts.push(`| ${a.url} | ${a.core_web_vitals?.speedScore ?? '—'} | ${indexed} | ${issues} |`)
  }
  parts.push('')

  parts.push('## 詳細問題清單')
  parts.push('')
  for (const a of input.analyses) {
    const issues = allIssues(a)
    if (issues.length === 0) continue
    parts.push(`### ${a.url}`)
    for (const issue of issues) parts.push(`- ⚠️ ${issue}`)
    parts.push('')
  }

  return parts.join('\n')
}
