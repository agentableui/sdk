import type { MetaManifest, RoleManifest } from '@agentableui/core'

export async function fetchMetaManifest(baseUrl: string, timeout?: number): Promise<MetaManifest> {
  const res = await fetch(`${baseUrl}/.well-known/agentable.json`, {
    signal: timeout ? AbortSignal.timeout(timeout) : undefined,
  })
  if (!res.ok) throw new Error(`Failed to fetch meta-manifest: ${res.status}`)
  return res.json()
}

export async function fetchRoleManifest(
  baseUrl: string,
  path: string,
  apiKey?: string,
  etag?: string,
  timeout?: number
): Promise<{ manifest: RoleManifest; etag: string } | null> {
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  if (etag) headers['If-None-Match'] = etag

  const res = await fetch(`${baseUrl}${path}`, {
    headers,
    signal: timeout ? AbortSignal.timeout(timeout) : undefined,
  })
  if (res.status === 304) return null
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)

  const manifest: RoleManifest = await res.json()
  return { manifest, etag: res.headers.get('etag') ?? '' }
}
