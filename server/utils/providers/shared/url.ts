import { normalizeDomain } from '../../domain'

export function normalizeProviderHost(domain: string): string {
  const trimmed = domain.trim()

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return normalizeDomain(parsed.hostname)
  } catch {
    return normalizeDomain(domain.split('#')[0])
  }
}

export function buildDemoUrl(host: string, path: string): string {
  return new URL(path, `https://${host}`).href
}
