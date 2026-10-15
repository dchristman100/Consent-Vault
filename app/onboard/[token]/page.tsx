import type { Metadata } from 'next'
import { loadOnboarding } from '@/lib/esign/onboarding'
import { validToken } from '@/lib/esign/db'
import { BrandBar, Notice } from '../../sign/brand'
import OnboardClient from './onboard-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Client onboarding · ShiFt', robots: { index: false, follow: false } }

export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!validToken(token)) return <Notice title="This link isn't valid">Check the link in your email, or ask your ShiFt contact to send it again.</Notice>
  const o = await loadOnboarding(token).catch(() => null)
  if (!o) return <Notice title="We couldn't find your onboarding form">Check the link in your email, or ask your ShiFt contact to send it again.</Notice>
  if (o.status === 'void') return <Notice title="This form is no longer active">Your ShiFt contact will send you a new link.</Notice>
  const provider = o.config?.provider || 'ShiFt'
  return (
    <div className="sx">
      <BrandBar note="Client onboarding" />
      <main className="sx-main">
        <div className="sx-head">
          <h1>{o.status === 'submitted' ? 'Onboarding received' : `Welcome${o.client?.company ? ', ' + o.client.company : ''}`}</h1>
          <p>
            {o.status === 'submitted'
              ? 'Thank you. Your answers and access are with our team, and we will be ready for your kickoff call.'
              : `Your answers and access let the ${provider} team prepare your campaign before the kickoff call. There are 4 steps, and your answers save as you go, so you can come back to finish.`}
          </p>
        </div>
        <OnboardClient token={o.token} status={o.status} config={o.config || {}} client={o.client || {}} answers={o.answers || {}} />
      </main>
    </div>
  )
}
