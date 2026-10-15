import type { Metadata } from 'next'
import { Dancing_Script } from 'next/font/google'
import { loadAgreement, fmtStamp } from '@/lib/esign/agreements'
import { mdToHtml } from '@/lib/esign/markdown'
import { validToken } from '@/lib/esign/db'
import { BrandBar, Notice } from '../../brand'
import PrintButton from './print-button'

const script = Dancing_Script({ subsets: ['latin'], weight: ['600'], display: 'swap' })

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Signed agreement · ShiFt', robots: { index: false, follow: false } }

/** The client's signed copy: agreement text with their initials, both signatures, and the audit certificate. */
export default async function CopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return <Notice title="This link isn't valid" />
  const a = await loadAgreement(token).catch(() => null)
  if (!a) return <Notice title="We couldn't find this agreement" />
  if (a.status !== 'signed' || !a.signature) return <Notice title="Not signed yet">Open the signing link from your email to sign.</Notice>
  const s = a.signature
  const ev = a.evidence || {}
  const cs = a.countersignature || {}
  const body = a.body_md.replace(/\[\[initials:([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi, (_m, k, label) => `**${label || 'Initials'}: ${(s.initials && s.initials[String(k).toLowerCase()]) || ''}**`)
  return (
    <div className="sx">
      <BrandBar note="Signed copy" />
      <main className="sx-main">
        <div className="sx-row sx-noprint" style={{ justifyContent: 'space-between' }}>
          <a className="sx-link" href={`/sign/${a.token}`}>Back</a>
          <PrintButton />
        </div>
        <section className="sx-card">
          <div className="sx-head" style={{ marginBottom: 12 }}>
            <h1>{a.title}</h1>
          </div>
          <div className="sx-doc" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '24px 0' }} />
          <div className="sx-sigs">
            <div className="sx-sig">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sx-sigimg" src={s.image} alt={`Signature of ${s.signer_name}`} />
              <div className="who">{s.signer_name}</div>
              <div>{s.title}{s.business_name ? `, ${s.business_name}` : ''}</div>
              <div>Signed {fmtStamp(a.signed_at)}</div>
            </div>
            <div className="sx-sig">
              <div className={script.className} style={{ fontSize: 36, lineHeight: '64px' }}>{cs.signer_name}</div>
              <div className="who">{cs.signer_name}</div>
              <div>{cs.title}{cs.company ? `, ${cs.company}` : ''}</div>
              <div>Countersigned {fmtStamp(a.countersigned_at)}</div>
            </div>
          </div>
        </section>
        <section className="sx-card sx-cert">
          <h2>Signature certificate</h2>
          <dl className="sx-kv">
            <dt>Agreement ID</dt><dd><code>{a.id}</code></dd>
            <dt>Signer</dt><dd>{s.signer_name}{a.signer_email ? ` (${a.signer_email})` : ''}</dd>
            <dt>Method</dt><dd>{s.method === 'draw' ? 'Drawn signature' : 'Typed signature'}, electronic consent accepted</dd>
            <dt>Opened</dt><dd>{fmtStamp(a.viewed_at) || 'Not recorded'}</dd>
            <dt>Signed</dt><dd>{fmtStamp(a.signed_at)}</dd>
            <dt>IP address</dt><dd>{ev.ip || 'Not recorded'}{ev.city || ev.region || ev.country ? ` (${[ev.city, ev.region, ev.country].filter(Boolean).join(', ')})` : ''}</dd>
            <dt>Browser</dt><dd>{ev.user_agent || 'Not recorded'}</dd>
            <dt>Time zone</dt><dd>{ev.tz || 'Not recorded'}</dd>
            {ev.cv_session_id ? <><dt>Consent Vault session</dt><dd><code>{ev.cv_session_id}</code></dd></> : null}
            <dt>Agreement text SHA-256</dt><dd><code>{a.body_sha256}</code></dd>
            <dt>Record SHA-256</dt><dd><code>{a.record_sha256}</code></dd>
          </dl>
        </section>
      </main>
    </div>
  )
}
