// server/utils/indexing/cache.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IndexingEngine } from './types'

export interface CachedEntry {
  pagesIndexed: number | null
  imagesIndexed: number | null
  engineUsed: IndexingEngine | null
  checkedAt: string
}

export async function readCache(
  supabase: SupabaseClient,
  domain: string,
): Promise<CachedEntry | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('domain_indexing_cache')
    .select('*')
    .eq('domain', domain)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (error || !data) return null

  return {
    pagesIndexed: data.pages_indexed,
    imagesIndexed: data.images_indexed,
    engineUsed: data.engine_used as IndexingEngine | null,
    checkedAt: data.checked_at,
  }
}

export async function writeCache(
  supabase: SupabaseClient,
  domain: string,
  data: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engineUsed: IndexingEngine | null
  },
  ttlHours: number,
): Promise<void> {
  const now = new Date()
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000)

  await supabase.from('domain_indexing_cache').upsert({
    domain,
    pages_indexed: data.pagesIndexed,
    images_indexed: data.imagesIndexed,
    engine_used: data.engineUsed,
    checked_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }, { onConflict: 'domain' })
}
