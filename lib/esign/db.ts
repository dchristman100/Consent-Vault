/**
 * E-sign records live in the AgencyOS Neon database (schema `esign`), shared with the ShiFt Sales Desk.
 * Queries go over Neon's HTTP SQL endpoint, so no driver dependency is needed.
 */
const ENV_KEYS = ['AGENCYOS_DATABASE_URL', 'AGENCYOS_POSTGRES_URL', 'ESIGN_DATABASE_URL'] as const

export function esignDbUrl(): string {
  for (const k of ENV_KEYS) {
    const v = process.env[k]
    if (v) return v
  }
  return ''
}

export class EsignDbError extends Error {}

export async function q<T = Record<string, any>>(query: string, params: unknown[] = []): Promise<T[]> {
  const url = esignDbUrl()
  if (!url) throw new EsignDbError('The e-sign database is not configured (AGENCYOS_DATABASE_URL).')
  const host = new URL(url).hostname
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
    cache: 'no-store',
  })
  const body: any = await res.json().catch(() => null)
  if (!res.ok || !body) throw new EsignDbError((body && body.message) || `Database error ${res.status}`)
  return (body.rows || []) as T[]
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for') || ''
  return (fwd.split(',')[0] || headers.get('x-real-ip') || '').trim()
}

export function validToken(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(t)
}
