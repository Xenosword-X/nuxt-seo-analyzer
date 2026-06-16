import type { ProviderSnapshotRow, SeoProviderResult } from './types'

export function isSnapshotStale(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime()
}

export function toProviderSnapshotRow<T>(
  projectId: string,
  result: SeoProviderResult<T>,
): ProviderSnapshotRow<T> {
  return {
    project_id: projectId,
    provider: result.provider,
    mode: result.mode,
    status: result.status,
    fetched_at: result.fetchedAt,
    expires_at: result.expiresAt ?? null,
    data: result.data,
    error: result.error ?? null,
  }
}

export function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString()
}
