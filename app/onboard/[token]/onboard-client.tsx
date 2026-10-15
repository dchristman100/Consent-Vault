'use client'

import { useEffect, useRef, useState } from 'react'
import type { OnboardingConfig } from '@/lib/esign/onboarding'

type A = Record<string, any>
type Props = { token: string; status: string; config: OnboardingConfig; client: { name?: string; email?: string; mobile?: string; company?: string }; answers: A }

const STEPS = ['GHL account and A2P', 'Meta ads access', 'Campaign details', 'Funnel design']

type Ctx = { a: A; set: (k: string, v: any) => void; later: string }

function Text({ c, k, label, req, hint, type = 'text', ph }: { c: Ctx; k: string; label: string; req?: boolean; hint?: string; type?: string; ph?: string }) {
return (
  <div className="sx-field">
    <label htmlFor={'f-' + k}>{label} {req ? <span className="sx-req">*</span> : null}</label>
    {hint ? <span className="hint">{hint}</span> : null}
    <input id={'f-' + k} type={type} value={c.a[k] || ''} placeholder={ph} onChange={(e) => c.set(k, e.target.value)} />
  </div>
)
}
function Area({ c, k, label, req, hint }: { c: Ctx; k: string; label: string; req?: boolean; hint?: string }) {
return (
  <div className="sx-field">
    <label htmlFor={'f-' + k}>{label} {req ? <span className="sx-req">*</span> : null}</label>
    {hint ? <span className="hint">{hint}</span> : null}
    <textarea id={'f-' + k} value={c.a[k] || ''} onChange={(e) => c.set(k, e.target.value)} />
  </div>
)
}
function Choice({ c, k, label, req, opts }: { c: Ctx; k: string; label: string; req?: boolean; opts: [string, string][] }) {
return (
  <fieldset className="sx-field" style={{ border: 0, padding: 0, margin: 0 }}>
    <legend className="sx-label" style={{ marginBottom: 6 }}>{label} {req ? <span className="sx-req">*</span> : null}</legend>
    <div className="sx-opts">
      {opts.map(([v, l]) => (
        <label className="sx-opt" key={v}><input type="radio" name={k} checked={c.a[k] === v} onChange={() => c.set(k, v)} />{l}</label>
      ))}
    </div>
  </fieldset>
)
}
function Confirm({ c, k, children }: { c: Ctx; k: string; children: React.ReactNode }) {
return (
  <label className="sx-check"><input type="checkbox" checked={!!c.a[k]} onChange={(e) => c.set(k, e.target.checked)} /><span>{children} <span className="sx-req">*</span></span></label>
)
}
function Asset({ c, k, label, none, hint }: { c: Ctx; k: string; label: string; none: string; hint?: string }) {
return (
  <div className="sx-field">
    <label htmlFor={'f-' + k}>{label}</label>
    {hint ? <span className="hint">{hint}</span> : null}
    <input id={'f-' + k} type="text" value={c.a[k] || ''} disabled={!!c.a[k + '_none']} onChange={(e) => c.set(k, e.target.value)} />
    <label className="sx-check" style={{ fontSize: 14 }}><input type="checkbox" checked={!!c.a[k + '_none']} onChange={(e) => c.set(k + '_none', e.target.checked)} /><span>{none}</span></label>
  </div>
)
}
function Lnk({ c, href, children }: { c: Ctx; href?: string; children: React.ReactNode }) {
return href ? <a className="sx-link" href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <em>({c.later})</em>
}


export default function OnboardClient(p: Props) {
  const key = 'shift-onboard-' + p.token
  const [a, setA] = useState<A>(() => ({ name: p.client.name || '', email: p.client.email || '', mobile: p.client.mobile || '', company_name: p.client.company || '', ...p.answers }))
  const loaded = useRef(false)
  useEffect(() => {
    // Resume answers saved on this device (merged over what the server has).
    try {
      const local = JSON.parse(localStorage.getItem(key) || '{}')
      if (local && typeof local === 'object' && Object.keys(local).length) setA((x) => ({ ...x, ...local }))
    } catch {}
    loaded.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(p.status === 'submitted')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prov = p.config.provider || 'ShiFt'
  const later = `your ${prov} contact will send this`

  const set = (k: string, v: any) => setA((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (done || !loaded.current) return
    try { localStorage.setItem(key, JSON.stringify(a)) } catch {}
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      fetch(`/api/onboard/${p.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', answers: a }) })
        .then((r) => (r.ok ? setSaved('Saved') : setSaved('Saved on this device')))
        .catch(() => setSaved('Saved on this device'))
    }, 1200)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a])

  async function submit() {
    setErr('')
    setBusy(true)
    try {
      const r = await fetch(`/api/onboard/${p.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', answers: a }) })
      const out = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(out.error || 'We could not submit your form. Please try again.')
      try { localStorage.removeItem(key) } catch {}
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (x: any) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="sx-card">
        <h2>Thank you!</h2>
        <p className="sub" style={{ marginBottom: 0 }}>Once your access is confirmed, we will be ready for your kickoff call. You can close this page.</p>
      </section>
    )
  }

  const c: Ctx = { a, set, later }

  const screens = [
    <div key="s1" style={{ display: 'grid', gap: 16 }}>
      <h3 style={{ margin: 0 }}>About you</h3>
      <div className="sx-grid">
        <Text c={c} k="name" label="Your name" req />
        <Text c={c} k="email" label="Best email" req type="email" />
        <Text c={c} k="mobile" label="Mobile for text updates" req type="tel" ph="+15555550123" />
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <Choice c={c} k="has_ghl" label="Do you have a GHL (GoHighLevel) account?" req opts={[['yes', 'Yes'], ['no', 'No']]} />
      {a.has_ghl === 'no' ? <p className="sx-note">Get two weeks of GHL free using this link: <Lnk c={c} href={p.config.ghl_trial_link}>GHL free trial</Lnk>. Then continue with the rest of this step.</p> : null}
      <p style={{ margin: 0 }}><strong>Give us access (required):</strong> give <strong>Agency Admin Access</strong> to {p.config.ghl_access_email ? <strong>{p.config.ghl_access_email}</strong> : <em>({later})</em>}.</p>
      <Confirm c={c} k="ghl_access_given">I&apos;ve given Agency Admin Access to {p.config.ghl_access_email || `the ${prov} team email`}.</Confirm>
      <Text c={c} k="ghl_account_name" label="What is the name of the GHL Agency or sub-account we will be working in?" req />
      <Choice c={c} k="a2p_verified" label="Is the GHL sub-account we are working in A2P verified?" req opts={[['yes', 'Yes'], ['no', 'No']]} />
      {a.a2p_verified === 'no' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p className="sx-note">We will submit and manage your A2P approval for you. <strong>Please do not submit the A2P approval yourself.</strong> Before continuing, complete your business information in GHL and purchase a GHL phone number. The help video shows how: <Lnk c={c} href={p.config.a2p_help_video}>A2P help video</Lnk>.</p>
          <Confirm c={c} k="a2p_prereqs_done">Yes, my business information is complete and I purchased my GHL phone number.</Confirm>
        </div>
      ) : null}
    </div>,
    <div key="s2" style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0 }}><strong>Give us access to your Meta account (required):</strong> in Meta Business Suite, add {p.config.meta_access_emails ? <strong>{p.config.meta_access_emails}</strong> : <em>({later})</em>} with <strong>Full Control</strong>, and make sure your Facebook Page is connected. The help video shows how: <Lnk c={c} href={p.config.meta_help_video}>Meta access help video</Lnk>.</p>
      <Confirm c={c} k="meta_access_given">I&apos;ve given {p.config.meta_access_emails || `the ${prov} team emails`} Full Control and connected my Facebook Page.</Confirm>
      <Text c={c} k="meta_business_name" label="What is your Meta Business Suite name?" req />
      <Text c={c} k="meta_ad_account_link" label="What is the link to your Meta ad account?" type="url" />
      <Text c={c} k="daily_ad_spend" label="What is your daily ad spend? ($)" type="number" />
    </div>,
    <div key="s3" style={{ display: 'grid', gap: 16 }}>
      <Choice c={c} k="meeting_location" label="What is your preferred meeting location? (for the meetings we book for you)" opts={[['google_meet', 'Google Meet'], ['zoom', 'Zoom'], ['phone', 'Phone'], ['teams', 'Microsoft Teams']]} />
      <Area c={c} k="services" label="What services do you offer?" />
      <Text c={c} k="drive_folder" label="What is your Google Drive folder link?" type="url" />
      <Choice c={c} k="has_offer" label="Do you have a specific niche and offer you want to use?" opts={[['yes', 'Yes, I will fill out Offer Info'], ['no', 'No']]} />
      {a.has_offer === 'no' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <Area c={c} k="target_market_ideas" label="Is there a specific target market you only want to target or are thinking of targeting?" hint="Example: Open to any niche, or list your niche ideas here." />
          <Area c={c} k="offer_ideas" label="Do you have any ideas for the offer you would like us to help build?" hint="Example: Open to our recommendation, or list your offer ideas here." />
        </div>
      ) : null}
      {a.has_offer === 'yes' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <h3 style={{ margin: '6px 0 0' }}>Offer Info</h3>
          <p className="sub" style={{ margin: 0 }}>Tell us the niche and offer you already want to use. The due date is set automatically to 7 days after you submit.</p>
          <Text c={c} k="offer_target_location" label="What is the Target Location?" req hint="e.g., Local - 30 mile radius, National - USA only" />
          <Area c={c} k="offer_target_audience" label="What is the Target Audience?" hint="Describe the exact target audience" />
          <Area c={c} k="offer_offer" label="What is the Offer?" req hint="Describe the offer clearly and simply" />
          <Choice c={c} k="offer_results_promised" label="Is there results promised/guaranteed?" opts={[['yes', 'Yes'], ['no', 'No']]} />
          {a.offer_results_promised === 'yes' ? <Text c={c} k="offer_results_detail" label="What results and timeframe are you promising/guaranteeing?" hint="Example: 15-25 booked appointments in 30 days" /> : null}
          <Text c={c} k="offer_pricing" label="What is the pricing structure?" req hint="e.g., $2,000/mo retainer + $100/shown appointment" />
          <Text c={c} k="offer_delivery" label="How are you delivering these results?" req hint="e.g., Facebook Ads + AI follow-up sequences" />
          <Area c={c} k="offer_survey_requirements" label="Are there any specific requirements for the survey?" hint="e.g., Must have $5k+ monthly budget, must be in the US" />
        </div>
      ) : null}
    </div>,
    <div key="s4" style={{ display: 'grid', gap: 16 }}>
      <p className="sub" style={{ margin: 0 }}>Add any assets and design preferences our team should use when building your funnel. Tick &quot;I don&apos;t have this yet&quot; for anything you can&apos;t provide.</p>
      <Text c={c} k="company_name" label="Company Name" />
      <Asset c={c} k="logo_link" label="What is the link to your logo?" none="I don't have a logo yet." />
      <Asset c={c} k="website" label="What is your website?" none="I don't have a website yet." />
      <Asset c={c} k="brand_colors" label="What are your branding colors?" hint="Hex codes, brand colors, or notes" none="I don't have branding colors yet." />
      <Asset c={c} k="video_testimonials" label="What is the link to your video testimonials?" none="I don't have video testimonials yet." />
      <Asset c={c} k="picture_testimonials" label="What is the link to your picture testimonials?" none="I don't have picture testimonials yet." />
      <Asset c={c} k="extra_assets" label="Is there anything else we need? Add a link here." none="I don't have any extra assets to provide." />
      <Area c={c} k="funnel_requests" label="Do you have any funnel design requests?" hint="Add any requests, notes, must-haves, or things to avoid" />
    </div>,
  ]

  const pct = Math.round(((step + 1) / STEPS.length) * 100)
  return (
    <>
      <ol className="sx-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>
            <b>{i < step ? '✓' : i + 1}</b>
            <button type="button" onClick={() => setStep(i)} style={{ all: 'unset', cursor: 'pointer' }}>{s}</button>
          </li>
        ))}
      </ol>
      <div className="sx-progress" aria-hidden="true"><span style={{ width: pct + '%' }} /></div>
      <section className="sx-card">
        <h2>Step {step + 1} of {STEPS.length}: {STEPS[step]}</h2>
        <p className="sub">Questions marked <span className="sx-req">*</span> are required. {saved ? <span style={{ color: 'var(--good)' }}>{saved}.</span> : null}</p>
        {screens[step]}
        {err ? <p className="sx-msg err" role="alert" style={{ marginTop: 16 }}>{err}</p> : null}
        <div className="sx-row" style={{ marginTop: 22, justifyContent: 'space-between' }}>
          {step > 0 ? <button type="button" className="sx-btn ghost" onClick={() => { setStep(step - 1); window.scrollTo({ top: 0 }) }}>Back</button> : <span />}
          {step < STEPS.length - 1 ? (
            <button type="button" className="sx-btn" onClick={() => { setStep(step + 1); window.scrollTo({ top: 0 }) }}>Next</button>
          ) : (
            <button type="button" className="sx-btn" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit onboarding'}</button>
          )}
        </div>
      </section>
    </>
  )
}
