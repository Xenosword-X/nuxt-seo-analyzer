interface ScoreInput {
  auditScore?: number | null
  ahrefs?: { domainRating?: number | null } | null
  gsc?: { ctr?: number | null; averagePosition?: number | null } | null
  crawler?: {
    brokenLinks?: number | null
    missingDescriptions?: number | null
    duplicateTitles?: number | null
  } | null
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function calculateProjectHealthScore(input: ScoreInput): number {
  const audit = finiteOr(input.auditScore, 78)
  const ahrefs = clamp(finiteOr(input.ahrefs?.domainRating, 40) * 1.4)
  const gscCtr = finiteOr(input.gsc?.ctr, 0.03) * 100
  const gscPosition = finiteOr(input.gsc?.averagePosition, 15)
  const gsc = clamp(50 + gscCtr * 5 - Math.max(0, gscPosition - 10) * 1.5)
  const crawlerIssues =
    finiteOr(input.crawler?.brokenLinks, 0) * 2
    + finiteOr(input.crawler?.missingDescriptions, 0) * 0.8
    + finiteOr(input.crawler?.duplicateTitles, 0) * 1
  const crawler = clamp(90 - crawlerIssues)

  return clamp(audit * 0.4 + ahrefs * 0.2 + gsc * 0.2 + crawler * 0.2)
}
