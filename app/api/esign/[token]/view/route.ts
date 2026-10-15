import { NextResponse, type NextRequest } from 'next/server'
import { q, clientIp, validToken } from '@/lib/esign/db'

export const dynamic = 'force-dynamic'

/** First open of the signing page: sent -> viewed, plus an audit event. Safe to call repeatedly. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  try {
    const rows = await q<{ id: string }>(
      `update esign.agreements set status = 'viewed', viewed_at = coalesce(viewed_at, now()), updated_at = now()
        where token = $1 and status = 'sent' returning id`,
      [token],
    )
    if (rows[0]) {
      await q(`insert into esign.events (agreement_id, kind, ip, user_agent) values ($1, 'viewed', $2, $3)`, [
        rows[0].id,
        clientIp(request.headers),
        (request.headers.get('user-agent') || '').slice(0, 400),
      ])
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Could not record the view' }, { status: 500 })
  }
}
