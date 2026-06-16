export type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
export type ProviderMode = 'demo' | 'live' | 'imported'
export type ProviderStatus = 'ready' | 'failed' | 'partial'

export interface SeoProviderResult<T> {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  cached: boolean
  fetchedAt: string
  expiresAt?: string | null
  data: T
  error?: string
}

export interface ProviderSnapshotRow<T = unknown> {
  project_id: string
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: T
  error: string | null
}
