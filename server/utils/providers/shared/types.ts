export type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
export type ProviderMode = 'demo' | 'live' | 'imported'
export type ProviderStatus = 'ready' | 'failed' | 'partial'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }

export interface SeoProviderResult<T extends JsonValue = JsonObject> {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  cached: boolean
  fetchedAt: string
  expiresAt?: string | null
  data: T
  error?: string
}

export interface ProviderSnapshotRow<T extends JsonValue = JsonValue> {
  project_id: string
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: T
  error: string | null
}
