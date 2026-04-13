import type { RobotsSitemapResult } from './types'

export async function analyzeRobots(url: string): Promise<RobotsSitemapResult> {
  const origin = new URL(url).origin
  const path = url.replace(origin, '') || '/'

  const [robotsAllowed, sitemapResult] = await Promise.all([
    checkRobots(origin, path),
    checkSitemap(origin),
  ])

  const issues: string[] = []
  if (!robotsAllowed) issues.push('robots.txt 封鎖此頁面，Googlebot 無法爬取')
  if (!sitemapResult.exists) issues.push('找不到 sitemap.xml，建議建立以助於索引')

  return { robotsAllowed, sitemapExists: sitemapResult.exists, sitemapUrl: sitemapResult.url, issues }
}

async function checkRobots(origin: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return true
    const text = await res.text()
    return !isBlocked(text, path)
  } catch { return true }
}

function isBlocked(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim())
  let active = false
  const disallowed: string[] = []
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.startsWith('user-agent:')) {
      const agent = line.split(':')[1]?.trim().toLowerCase()
      active = agent === '*' || agent === 'googlebot'
    }
    if (active && lower.startsWith('disallow:')) {
      const d = line.split(':')[1]?.trim()
      if (d) disallowed.push(d)
    }
  }
  return disallowed.some(d => d !== '' && path.startsWith(d))
}

async function checkSitemap(origin: string): Promise<{ exists: boolean; url: string | null }> {
  const url = `${origin}/sitemap.xml`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    return { exists: res.ok, url: res.ok ? url : null }
  } catch { return { exists: false, url: null } }
}
