export type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
export type ProviderMode = 'demo' | 'live' | 'imported'
export type ProviderStatus = 'ready' | 'failed' | 'partial'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject { [key: string]: JsonValue }
export type JsonCompatible<T> =
  T extends JsonPrimitive ? T
    : T extends Date ? never
      : T extends (...args: any[]) => any ? never
        : T extends Map<any, any> ? never
          : T extends Set<any> ? never
            : T extends Array<infer U> ? JsonCompatible<U>[]
              : T extends object ? { [K in keyof T]: JsonCompatible<T[K]> }
                : never

export interface SeoProviderResult<T = JsonObject> {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  cached: boolean
  fetchedAt: string
  expiresAt?: string | null
  data: JsonCompatible<T>
  error?: string
}

export interface ProviderSnapshotRow<T = JsonValue> {
  project_id: string
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: JsonCompatible<T>
  error: string | null
}
