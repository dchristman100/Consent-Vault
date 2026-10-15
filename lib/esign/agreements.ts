import { createHash } from 'crypto'
import { q } from './db'

export type ClientInput = { key: string; label: string; required?: boolean; value?: string }
export type Agreement = {
  id: string
  token: string
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'void'
  title: string
  body_md: string
  body_sha256: string
  terms: Record<string, any>
  client_inputs: ClientInput[]
  provider: { company?: string; signer_name?: string; signer_title?: string; legal_name?: string }
  signer_name: string | null
  signer_email: string | null
  company: string | null
  payment_url: string | null
  amount_cents: number | null
  created_at: string
  viewed_at: string | null
  signed_at: string | null
  void_at: string | null
  expires_at: string | null
  signature: any
  evidence: any
  countersigned_at: string | null
  countersignature: any
  record_sha256: string | null
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')

export const DEFAULT_INPUTS: ClientInput[] = [
  { key: 'business_name', label: 'Business name', required: true },
  { key: 'signer_name', label: 'Your full name', required: true },
  { key: 'title', label: 'Your title', required: true },
]

export async function loadAgreement(token: string): Promise<Agreement | null> {
  const rows = await q<Agreement>(
    `select id, token, status, title, body_md, body_sha256, terms, client_inputs, provider, signer_name, signer_email, company,
            payment_url, amount_cents, created_at, viewed_at, signed_at, void_at, expires_at, signature, evidence,
            countersigned_at, countersignature, record_sha256
       from esign.agreements where token = $1 limit 1`,
    [token],
  )
  const a = rows[0]
  if (!a) return null
  if (!Array.isArray(a.client_inputs) || !a.client_inputs.length) a.client_inputs = DEFAULT_INPUTS
  return a
}

export function expired(a: Agreement): boolean {
  return !!a.expires_at && new Date(a.expires_at).getTime() < Date.now() && a.status !== 'signed'
}

export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'long' })
}
