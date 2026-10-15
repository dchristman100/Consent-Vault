import type { Metadata } from 'next'
import Script from 'next/script'
import { Dancing_Script } from 'next/font/google'
import { loadAgreement, expired, fmtStamp } from '@/lib/esign/agreements'
import { segments } from '@/lib/esign/markdown'
import { validToken } from '@/lib/esign/db'
import { BrandBar, Notice } from '../brand'
import SignClient from './sign-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Review and sign · ShiFt', robots: { index: false, follow: false } }

const script = Dancing_Script({ subsets: ['latin'], weight: ['600'], display: 'swap' })

export default async function SignPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params
  const sp = await searchParams
  if (!validToken(token)) return <Notice title="This link isn't valid">Check the link in your email, or ask your ShiFt contact to send it again.</Notice>
  let a
  try {
    a = await loadAgreement(token)
  } catch {
    return <Notice title="We couldn't load your agreement">Please try again in a minute. If it keeps happening, reply to the email you received.</Notice>
  }
  if (!a) return <Notice title="We couldn't find this agreement">Check the link in your email, or ask your ShiFt contact to send it again.</Notice>
  if (a.status === 'void') return <Notice title="This agreement was withdrawn">Your ShiFt contact will send you an updated agreement.</Notice>
  if (expired(a)) return <Notice title="This signing link has expired">Ask your ShiFt contact to send a new one.</Notice>

  const siteKey = process.env.NEXT_PUBLIC_ESIGN_SITE_KEY || ''
  const signed = a.status === 'signed'
  return (
    <div className="sx">
      {siteKey && !signed ? <Script src="/recorder.js" data-site-key={siteKey} strategy="afterInteractive" /> : null}
      <BrandBar note="Secure e-signature" />
      <main className="sx-main">
        <div className="sx-head">
          <h1>{a.title}</h1>
          <p>
            {a.company ? <>Prepared for {a.company}{a.signer_name ? `, attention ${a.signer_name}` : ''}. </> : null}
            {signed ? `Signed ${fmtStamp(a.signed_at)}.` : 'Read the agreement, initial each acknowledgment, then sign at the bottom.'}
          </p>
        </div>
        <SignClient
          token={a.token}
          status={a.status}
          paid={sp.paid === '1'}
          segments={segments(a.body_md)}
          inputs={a.client_inputs.map((i) => ({
            ...i,
            value: i.value || (i.key === 'business_name' ? a.company || '' : i.key === 'signer_name' ? a.signer_name || '' : ''),
          }))}
          provider={a.provider || {}}
          paymentUrl={a.payment_url || ''}
          amountCents={a.amount_cents || 0}
          scriptFont={script.style.fontFamily}
          signedAt={a.signed_at || ''}
          signerName={(a.signature && a.signature.signer_name) || a.signer_name || ''}
        />
        <p className="sx-foot">
          Signed electronically under the U.S. ESIGN Act and UETA. Your IP address, browser and the time of signing are recorded with your
          signature and the exact text of this agreement.
        </p>
      </main>
      <style>{`.sx-script{font-family:${script.style.fontFamily};}`}</style>
    </div>
  )
}
