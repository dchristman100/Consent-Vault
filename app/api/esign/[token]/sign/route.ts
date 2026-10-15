import { NextResponse, type NextRequest } from 'next/server'
import { q, clientIp, validToken } from '@/lib/esign/db'
import { loadAgreement, expired, sha256 } from '@/lib/esign/agreements'
import { initialsKeys } from '@/lib/esign/markdown'

export const dynamic = 'force-dynamic'

const MAX_IMAGE = 450_000
const clean = (v: unknown, n = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '')

/**
 * Records the client's signature against the exact agreement text, then applies the provider's
 * automatic countersignature. Evidence: IP, user agent, time, Consent Vault session, browser hints,
 * and a SHA-256 over the whole record so later edits are detectable.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'This link is not valid.' }, { status: 400 })
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  try {
    const a = await loadAgreement(token)
    if (!a) return NextResponse.json({ error: 'We could not find this agreement.' }, { status: 404 })
    if (a.status === 'signed') return NextResponse.json({ error: 'This agreement is already signed.' }, { status: 409 })
    if (a.status === 'void') return NextResponse.json({ error: 'This agreement was withdrawn.' }, { status: 410 })
    if (expired(a)) return NextResponse.json({ error: 'This signing link has expired.' }, { status: 410 })
    if (sha256(a.body_md) !== a.body_sha256) return NextResponse.json({ error: 'This agreement failed an integrity check. Ask for a new link.' }, { status: 409 })

    const inputs: Record<string, string> = {}
    for (const i of a.client_inputs) {
      const v = clean(body?.inputs?.[i.key])
      if (i.required !== false && !v) return NextResponse.json({ error: `Fill in: ${i.label}.` }, { status: 400 })
      inputs[i.key] = v
    }
    const initials: Record<string, string> = {}
    for (const k of initialsKeys(a.body_md)) {
      const v = clean(body?.initials?.[k.key], 6).toUpperCase()
      if (v.replace(/[^A-Z]/g, '').length < 2) return NextResponse.json({ error: 'Add your initials to every acknowledgment.' }, { status: 400 })
      initials[k.key] = v
    }
    const method = body?.method === 'draw' ? 'draw' : 'type'
    const typed = clean(body?.typed_name, 120)
    const image = typeof body?.image === 'string' ? body.image : ''
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE) return NextResponse.json({ error: 'Add your signature.' }, { status: 400 })
    if (method === 'type' && typed.length < 2) return NextResponse.json({ error: 'Type your full name to sign.' }, { status: 400 })
    if (!body?.consent?.accepted) return NextResponse.json({ error: 'Tick both boxes to agree.' }, { status: 400 })

    const signedAt = new Date().toISOString()
    const signature = {
      method,
      typed_name: typed,
      signer_name: inputs.signer_name || typed || a.signer_name || '',
      title: inputs.title || '',
      business_name: inputs.business_name || a.company || '',
      inputs,
      initials,
      consent: { esign: clean(body?.consent?.esign, 600), agree: clean(body?.consent?.agree, 600), accepted: true },
      image,
      image_sha256: sha256(image),
    }
    const evidence = {
      ip: clientIp(request.headers),
      user_agent: (request.headers.get('user-agent') || '').slice(0, 400),
      accept_language: (request.headers.get('accept-language') || '').slice(0, 120),
      country: request.headers.get('x-vercel-ip-country') || '',
      region: request.headers.get('x-vercel-ip-country-region') || '',
      city: decodeURIComponent(request.headers.get('x-vercel-ip-city') || ''),
      cv_session_id: clean(body?.cv_session_id, 80),
      tz: clean(body?.client?.tz, 60),
      screen: clean(body?.client?.screen, 20),
      lang: clean(body?.client?.lang, 20),
      touch: !!body?.client?.touch,
      signed_at: signedAt,
      body_sha256: a.body_sha256,
    }
    const p = a.provider || {}
    const countersignature = {
      method: 'automatic',
      signer_name: p.signer_name || '',
      title: p.signer_title || '',
      company: p.legal_name || p.company || '',
      at: signedAt,
    }
    const { image: _omit, ...sigNoImage } = signature
    const record = sha256(JSON.stringify({ agreement_id: a.id, body_sha256: a.body_sha256, signature: sigNoImage, evidence, countersignature }))

    const rows = await q<{ id: string }>(
      `update esign.agreements
          set status = 'signed', signed_at = $2, signature = $3::jsonb, evidence = $4::jsonb,
              countersigned_at = $2, countersignature = $5::jsonb, record_sha256 = $6,
              viewed_at = coalesce(viewed_at, $2), updated_at = now()
        where token = $1 and status in ('sent','viewed') returning id`,
      [token, signedAt, JSON.stringify(signature), JSON.stringify(evidence), JSON.stringify(countersignature), record],
    )
    if (!rows[0]) return NextResponse.json({ error: 'This agreement was already signed or withdrawn.' }, { status: 409 })
    await q(`insert into esign.events (agreement_id, kind, ip, user_agent, detail) values ($1, 'signed', $2, $3, $4::jsonb), ($1, 'countersigned', null, null, $5::jsonb)`, [
      a.id,
      evidence.ip,
      evidence.user_agent,
      JSON.stringify({ method, record_sha256: record, cv_session_id: evidence.cv_session_id }),
      JSON.stringify({ by: countersignature.signer_name, method: 'automatic' }),
    ])
    return NextResponse.json({ ok: true, signed_at: signedAt, payment_url: a.payment_url || '' })
  } catch (e) {
    console.error('[esign] sign failed', e)
    return NextResponse.json({ error: 'We could not save your signature. Please try again.' }, { status: 500 })
  }
}
