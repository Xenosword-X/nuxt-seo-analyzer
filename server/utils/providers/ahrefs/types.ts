export interface AhrefsSnapshot {
  domainRating: number
  backlinks: number
  referringDomains: number
  organicKeywords: number
  organicTrafficEstimate: number
  topPages: Array<{
    url: string
    traffic: number
    keywords: number
  }>
  competitors: Array<{
    domain: string
    overlapScore: number
  }>
}
