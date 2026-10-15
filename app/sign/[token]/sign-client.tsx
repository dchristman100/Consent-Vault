'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Segment } from '@/lib/esign/markdown'

type Input = { key: string; label: string; required?: boolean; value?: string }
type Props = {
  token: string
  status: string
  paid: boolean
  segments: Segment[]
  inputs: Input[]
  provider: { company?: string; signer_name?: string; signer_title?: string }
  paymentUrl: string
  amountCents: number
  scriptFont: string
  signedAt: string
  signerName: string
}

const CONSENT_ESIGN =
  'I agree to sign electronically. My electronic signature is the legal equivalent of my handwritten signature, and I consent to receive this agreement and related records electronically.'
const CONSENT_AGREE = 'I have read this agreement and agree to its terms on behalf of the business named below.'

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function SignClient(p: Props) {
  const [done, setDone] = useState(p.status === 'signed')
  const [signedAt, setSignedAt] = useState(p.signedAt)
  const [initials, setInitials] = useState<Record<string, string>>({})
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.inputs.map((i) => [i.key, i.value || ''])))
  const [mode, setMode] = useState<'draw' | 'type'>('type')
  const [typed, setTyped] = useState('')
  const [drawn, setDrawn] = useState(false)
  const [c1, setC1] = useState(false)
  const [c2, setC2] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const initialsList = useMemo(() => p.segments.filter((s) => s.type === 'initials') as Extract<Segment, { type: 'initials' }>[], [p.segments])
  const initialsDone = initialsList.every((s) => (initials[s.key] || '').trim().length >= 2)

  useEffect(() => {
    if (p.status === 'sent') fetch(`/api/esign/${p.token}/view`, { method: 'POST' }).catch(() => {})
  }, [p.status, p.token])

  useEffect(() => {
    const n = (vals.signer_name || '').trim()
    if (!typed && n) setTyped(n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.6
    ctx.strokeStyle = '#1A1A18'
    setDrawn(false)
  }, [])

  useEffect(() => {
    if (mode === 'draw') sizeCanvas()
  }, [mode, sizeCanvas])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const pt = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    last.current = pt
    if (!drawn) setDrawn(true)
  }
  const up = () => {
    drawing.current = false
    last.current = null
  }

  async function typedPng(text: string): Promise<string> {
    const fam = p.scriptFont
    try {
      await (document as any).fonts.load(`600 64px ${fam}`)
    } catch {}
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 220
    const ctx = c.getContext('2d')!
    let size = 92
    ctx.font = `600 ${size}px ${fam}`
    while (ctx.measureText(text).width > 840 && size > 30) {
      size -= 4
      ctx.font = `600 ${size}px ${fam}`
    }
    ctx.fillStyle = '#1A1A18'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 30, 115)
    return c.toDataURL('image/png')
  }

  function trimmedDrawPng(): string {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const { width, height } = c
    const data = ctx.getImageData(0, 0, width, height).data
    let minX = width, minY = height, maxX = 0, maxY = 0
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
    }
    if (maxX <= minX) return c.toDataURL('image/png')
    const pad = 16
    const w = Math.min(width, maxX - minX + pad * 2), h = Math.min(height, maxY - minY + pad * 2)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    out.getContext('2d')!.drawImage(c, Math.max(0, minX - pad), Math.max(0, minY - pad), w, h, 0, 0, w, h)
    return out.toDataURL('image/png')
  }

  const missing = p.inputs.filter((i) => i.required !== false && !(vals[i.key] || '').trim())
  const sigReady = mode === 'draw' ? drawn : typed.trim().length >= 2
  const ready = initialsDone && !missing.length && sigReady && c1 && c2

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!ready) {
      setErr(!initialsDone ? 'Add your initials to every acknowledgment above.' : missing.length ? `Fill in: ${missing.map((m) => m.label).join(', ')}.` : !sigReady ? 'Add your signature.' : 'Tick both boxes to agree.')
      return
    }
    setBusy(true)
    try {
      const image = mode === 'draw' ? trimmedDrawPng() : await typedPng(typed.trim())
      const cv = (window as any).ConsentVault
      const res = await fetch(`/api/esign/${p.token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: vals,
          initials,
          method: mode,
          typed_name: mode === 'type' ? typed.trim() : '',
          image,
          consent: { esign: CONSENT_ESIGN, agree: CONSENT_AGREE, accepted: true },
          cv_session_id: cv && cv.getSessionId ? cv.getSessionId() || '' : '',
          client: {
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            screen: `${window.screen.width}x${window.screen.height}`,
            lang: navigator.language || '',
            touch: 'ontouchstart' in window,
          },
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'We could not save your signature. Please try again.')
      setSignedAt(out.signed_at || new Date().toISOString())
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (x: any) {
      setErr(x.message || 'We could not save your signature. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const steps = (
    <ol className="sx-steps" aria-label="Progress">
      <li className={done ? 'done' : 'on'}><b>{done ? '✓' : '1'}</b>Review and initial</li>
      <li className={done ? 'done' : ''}><b>{done ? '✓' : '2'}</b>Sign</li>
      <li className={p.paid ? 'done' : done ? 'on' : ''}><b>{p.paid ? '✓' : '3'}</b>{p.paymentUrl ? 'Pay' : 'Done'}</li>
    </ol>
  )

  if (done) {
    return (
      <>
        {steps}
        <section className="sx-card">
          <h2>{p.paid ? 'Payment received. Thank you!' : 'Signed. Thank you!'}</h2>
          <p className="sub">
            {p.paid
              ? 'Your agreement is signed and your payment went through. We will email you the onboarding form next.'
              : `Your signature was recorded${signedAt ? ' on ' + new Date(signedAt).toLocaleString() : ''}${p.provider.signer_name ? ` and countersigned by ${p.provider.signer_name}` : ''}.`}
          </p>
          <div className="sx-row">
            {!p.paid && p.paymentUrl ? (
              <a className="sx-btn" href={p.paymentUrl}>
                Continue to payment{p.amountCents ? ` (${usd(p.amountCents)})` : ''}
              </a>
            ) : null}
            <a className="sx-btn ghost" href={`/sign/${p.token}/copy`}>View your signed copy</a>
          </div>
          {!p.paid && p.paymentUrl ? <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>Payment is handled securely by Stripe.</p> : null}
        </section>
      </>
    )
  }

  return (
    <>
      {steps}
      <section className="sx-card" aria-label="Agreement">
        <div className="sx-doc">
          {p.segments.map((s, i) =>
            s.type === 'html' ? (
              <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
            ) : (
              <div key={i} className={'sx-init' + ((initials[s.key] || '').trim().length >= 2 ? ' ok' : '')}>
                <label htmlFor={'ini-' + s.key}>{s.label}</label>
                <input
                  id={'ini-' + s.key}
                  type="text"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="AB"
                  value={initials[s.key] || ''}
                  onChange={(e) => setInitials({ ...initials, [s.key]: e.target.value.replace(/[^A-Za-z.]/g, '').toUpperCase() })}
                />
              </div>
            ),
          )}
        </div>
      </section>

      <form className="sx-card" onSubmit={submit} noValidate>
        <h2>Sign</h2>
        <p className="sub">
          {initialsList.length ? `Initials: ${initialsList.filter((s) => (initials[s.key] || '').trim().length >= 2).length} of ${initialsList.length} added. ` : ''}
          Today's date is added automatically.
        </p>
        <div className="sx-grid" style={{ marginBottom: 18 }}>
          {p.inputs.map((i) => (
            <div className="sx-field" key={i.key}>
              <label htmlFor={'in-' + i.key}>
                {i.label} {i.required !== false ? <span className="sx-req">*</span> : null}
              </label>
              <input id={'in-' + i.key} type="text" value={vals[i.key] || ''} onChange={(e) => setVals({ ...vals, [i.key]: e.target.value })} autoComplete={i.key === 'signer_name' ? 'name' : i.key === 'business_name' ? 'organization' : i.key === 'title' ? 'organization-title' : 'off'} />
            </div>
          ))}
        </div>

        <div className="sx-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="sx-label">Your signature <span className="sx-req">*</span></span>
          <div className="sx-tabs" role="group" aria-label="How to sign" data-cv-ignore>
            <button type="button" data-cv-ignore aria-pressed={mode === 'type'} onClick={() => setMode('type')}>Type</button>
            <button type="button" data-cv-ignore aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>Draw</button>
          </div>
        </div>
        {mode === 'type' ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="text" aria-label="Type your full name to sign" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name" />
            <div className="sx-typed sx-script" aria-hidden="true">{typed || ' '}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="sx-pad">
              <canvas
                ref={canvasRef}
                aria-label="Draw your signature with your finger or mouse"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerLeave={up}
              />
              <span className="line" />
              <span className="x">×</span>
              {!drawn ? <span className="ph">Sign here with your finger or mouse</span> : null}
            </div>
            <div>
              <button type="button" className="sx-btn ghost small" data-cv-ignore onClick={sizeCanvas}>Clear</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, margin: '20px 0' }}>
          <label className="sx-check"><input type="checkbox" checked={c1} onChange={(e) => setC1(e.target.checked)} /><span>{CONSENT_ESIGN}</span></label>
          <label className="sx-check"><input type="checkbox" checked={c2} onChange={(e) => setC2(e.target.checked)} /><span>{CONSENT_AGREE}</span></label>
        </div>

        {err ? <p className="sx-msg err" role="alert">{err}</p> : null}
        <div className="sx-row" style={{ marginTop: 12 }}>
          <button type="submit" className="sx-btn" disabled={busy}>{busy ? 'Signing…' : 'Sign agreement'}</button>
          {p.paymentUrl ? <span className="sub" style={{ margin: 0 }}>Next: secure payment{p.amountCents ? ` of ${usd(p.amountCents)}` : ''}.</span> : null}
        </div>
      </form>
    </>
  )
}
