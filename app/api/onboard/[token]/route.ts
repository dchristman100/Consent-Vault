import { NextResponse, type NextRequest } from 'next/server'
import { q, clientIp, validToken } from '@/lib/esign/db'
import { loadOnboarding, missingRequired } from '@/lib/esign/onboarding'

export const dynamic = 'force-dynamic'

const MAX = 60_000

function sanitize(answers: unknown): Record<string, any> {
  const out: Record<string, any> = {}
  if (!answers || typeof answers !== 'object') return out
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    if (!/^[a-z0-9_]{1,60}$/.test(k)) continue
    if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'number' && isFinite(v)) out[k] = v
    else if (typeof v === 'string') out[k] = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 4000)
  }
  return out
}

/** action=save: autosave (sent -> started). action=submit: validate required answers and lock the form. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return NextResponse.json({ error: 'This link is not valid.' }, { status: 400 })
  let body: any
  try {
    const raw = await request.text()
    if (raw.length > MAX) return NextResponse.json({ error: 'Too much data.' }, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  try {
    const o = await loadOnboarding(token)
    if (!o) return NextResponse.json({ error: 'We could not find this form.' }, { status: 404 })
    if (o.status === 'submitted') return NextResponse.json({ error: 'This form was already submitted.' }, { status: 409 })
    if (o.status === 'void') return NextResponse.json({ error: 'This form is no longer active.' }, { status: 410 })
    const answers = sanitize(body?.answers)
    if (body?.action === 'submit') {
      const miss = missingRequired(answers)
      if (miss.length) return NextResponse.json({ error: 'Still needed: ' + miss.join('; ') + '.', missing: miss }, { status: 400 })
      const ev = { ip: clientIp(request.headers), user_agent: (request.headers.get('user-agent') || '').slice(0, 400), at: new Date().toISOString() }
      const due = answers.has_offer === 'yes' ? new Date(Date.now() + 7 * 864e5).toISOString() : null
      const rows = await q<{ id: string }>(
        `update esign.onboarding set status = 'submitted', answers = $2::jsonb, submitted_at = now(), due_at = coalesce($4::timestamptz, due_at),
                started_at = coalesce(started_at, now()), evidence = $3::jsonb, updated_at = now()
          where token = $1 and status in ('sent','started') returning id`,
        [token, JSON.stringify(answers), JSON.stringify(ev), due],
      )
      if (!rows[0]) return NextResponse.json({ error: 'This form was already submitted.' }, { status: 409 })
      await q(`insert into esign.events (onboarding_id, kind, ip, user_agent) values ($1, 'onboarding_submitted', $2, $3)`, [rows[0].id, ev.ip, ev.user_agent])
      return NextResponse.json({ ok: true })
    }
    await q(
      `update esign.onboarding set answers = $2::jsonb, status = case when status = 'sent' then 'started' else status end,
              started_at = coalesce(started_at, now()), updated_at = now()
        where token = $1 and status in ('sent','started')`,
      [token, JSON.stringify(answers)],
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[onboard] save failed', e)
    return NextResponse.json({ error: 'We could not save. Please try again.' }, { status: 500 })
  }
}
