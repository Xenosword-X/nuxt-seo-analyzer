import type { CWVResult } from './types'

export async function analyzeCWV(url: string): Promise<CWVResult> {
  const config = useRuntimeConfig()
  const apiKey = config.pagespeedApiKey as string

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return empty(['PageSpeed API 請求失敗（HTTP ' + res.status + '）'])

    const data = await res.json()
    const audits = data?.lighthouseResult?.audits
    const categories = data?.lighthouseResult?.categories

    const fcp = audits?.['first-contentful-paint']?.numericValue ?? null
    const lcp = audits?.['largest-contentful-paint']?.numericValue ?? null
    const tbt = audits?.['total-blocking-time']?.numericValue ?? null
    const cls = audits?.['cumulative-layout-shift']?.numericValue ?? null
    const speedScore = categories?.performance?.score != null
      ? Math.round(categories.performance.score * 100)
      : null

    const issues: string[] = []
    if (speedScore !== null && speedScore < 50) issues.push(`效能分數偏低（${speedScore}/100，建議 > 50）`)
    if (lcp !== null && lcp > 2500) issues.push(`LCP 過慢（${Math.round(lcp)}ms，建議 < 2500ms）`)
    if (cls !== null && cls > 0.1) issues.push(`CLS 過高（${cls.toFixed(3)}，建議 < 0.1）`)

    return { fcp, lcp, tbt, cls, speedScore, issues }
  } catch {
    return empty(['PageSpeed API 請求失敗'])
  }
}

function empty(issues: string[]): CWVResult {
  return { fcp: null, lcp: null, tbt: null, cls: null, speedScore: null, issues }
}
