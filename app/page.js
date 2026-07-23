'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS = 2000

const TERMINAL = new Set([
  'verified',
  'presented_unverified',
  'rejected',
  'declined',
  'error',
])

const STATUS_TEXT = {
  awaiting_scan: 'Waiting for you to scan…',
  connecting: 'Shaking hands by the campfire…',
  sending_request: 'Connected — rummaging for the paperwork…',
  awaiting_proof: 'Sent! Say yes on your phone',
  verifying: 'Checking with the ranger station…',
}

/** Campsite maths. Resident rate is the payoff for proving residency. */
const NIGHTS = 2
const SITE_FEE = 104.0
const FIREWOOD = 12.0
const BOOKING_FEE = 6.0
const RESIDENT_DISCOUNT = 26.0

const FULL_TOTAL = SITE_FEE + FIREWOOD + BOOKING_FEE
const money = (n) => `$${n.toFixed(2)}`

/** Which of the three progress steps is live for a given status. */
function stepState(status) {
  if (['awaiting_scan'].includes(status)) return 0
  if (['connecting'].includes(status)) return 1
  return 2
}

export default function BookingPage() {
  const [status, setStatus] = useState('idle')
  const [qr, setQr] = useState(null)
  const [invitationUrl, setInvitationUrl] = useState(null)
  const [attributes, setAttributes] = useState({})
  const [detail, setDetail] = useState(null)
  const [transport, setTransport] = useState(null)
  const [demoTrust, setDemoTrust] = useState(false)
  const sessionRef = useRef(null)

  const start = useCallback(async () => {
    setStatus('starting')
    setDetail(null)
    setAttributes({})
    try {
      const res = await fetch('/api/session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start verification')

      sessionRef.current = data.sessionId
      setQr(data.qrDataUrl)
      setInvitationUrl(data.invitationUrl)
      setStatus('awaiting_scan')
    } catch (err) {
      setDetail(String(err.message || err))
      setStatus('error')
    }
  }, [])

  // Poll the session until it reaches a terminal state.
  useEffect(() => {
    if (status === 'idle' || status === 'starting' || TERMINAL.has(status)) return

    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch(`/api/session/${sessionRef.current}`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return

        if (data.attributes) setAttributes(data.attributes)
        if (data.detail) setDetail(data.detail)
        if (data.transport) setTransport(data.transport)
        if (typeof data.demoTrustPresented === 'boolean') {
          setDemoTrust(data.demoTrustPresented)
        }
        if (data.status) setStatus(data.status)
      } catch {
        // Transient network hiccup — keep polling.
      }
    }

    const timer = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status])

  const reset = () => {
    sessionRef.current = null
    setQr(null)
    setInvitationUrl(null)
    setAttributes({})
    setDetail(null)
    setStatus('idle')
  }

  const step = stepState(status)

  // A real verification always earns the discount. A merely-presented credential
  // only does so when DEMO_TRUST_PRESENTED is on — and then the panel must say
  // out loud that no signature was checked, so the demo isn't quietly lying.
  const signatureChecked = status === 'verified'
  const celebrating =
    signatureChecked || (status === 'presented_unverified' && demoTrust)

  const discountUnlocked = celebrating
  const total = discountUnlocked ? FULL_TOTAL - RESIDENT_DISCOUNT : FULL_TOTAL
  const firstName = (attributes.given_names ?? '').split(' ')[0]

  return (
    <div className="page">
      <span className="page-kicker">Step 3 of 3 — nearly camping</span>
      <h1 className="page-title">Almost there, camper!</h1>
      <p className="page-lede">
        One tiny formality and site 42 is yours. We promise this is the least
        bureaucratic thing about the woods.
      </p>

      <div className="columns">
        {/* ---------- Reservation ---------- */}
        <section className="card">
          <div className="card-head">
            <h2>⛺ Your reservation</h2>
          </div>
          <div className="card-body">
            <div className="res-hero">
              <div className="site-num">42</div>
              <div>
                <h3>Mossy Nook</h3>
                <p>Lakeside-ish · shady · suspiciously large footprints nearby</p>
              </div>
            </div>

            <dl style={{ margin: 0 }}>
              <div className="order-row">
                <dt>Nights</dt>
                <dd>Fri 14 — Sun 16 Aug ({NIGHTS})</dd>
              </div>
              <div className="order-row">
                <dt>Setup</dt>
                <dd>One (1) tent, aggressively average</dd>
              </div>
              <div className="order-row">
                <dt>Campers</dt>
                <dd>2 humans, 1 excellent dog</dd>
              </div>
              <div className="order-row">
                <dt>Site fee ({NIGHTS} nights)</dt>
                <dd>{money(SITE_FEE)}</dd>
              </div>
              <div className="order-row">
                <dt>Firewood bundle ×2</dt>
                <dd>{money(FIREWOOD)}</dd>
              </div>
              <div className="order-row">
                <dt>Booking fee</dt>
                <dd>{money(BOOKING_FEE)}</dd>
              </div>
            </dl>

            <div className={`discount-row ${discountUnlocked ? 'unlocked' : ''}`}>
              <span>
                {discountUnlocked
                  ? '🎉 BC resident rate applied'
                  : '🔒 BC resident rate — not yet unlocked'}
              </span>
              <span>{discountUnlocked ? `−${money(RESIDENT_DISCOUNT)}` : '—'}</span>
            </div>

            <div className="order-total">
              <span>Total</span>
              <span className="amount">
                {discountUnlocked && (
                  <span className="was-price">{money(FULL_TOTAL)}</span>
                )}
                {money(total)}
              </span>
            </div>

            <div className="notice">
              <strong>Why we ask</strong>
              Locals camp cheaper — it&rsquo;s the law of the land (and also our
              pricing policy). Prove you live in BC and we&rsquo;ll knock{' '}
              {money(RESIDENT_DISCOUNT)} off. No forms, no photocopies, no talking to
              Gary at the front desk.
            </div>
          </div>
        </section>

        {/* ---------- Residency check ---------- */}
        <section className="card">
          <div className="card-head">
            <h2>🍁 Are you a local?</h2>
          </div>
          <div className="card-body">
            <div className="verify-panel">
              {status === 'idle' && (
                <>
                  <div className="big-emoji" aria-hidden="true">
                    🏕️
                  </div>
                  <p>
                    Tap below and your BC Services Card app will confirm you&rsquo;re a
                    British Columbian. Nothing leaves your phone until you say so.
                  </p>
                  <button className="btn" onClick={start}>
                    Prove I&rsquo;m a British Columbian
                  </button>
                </>
              )}

              {status === 'starting' && (
                <div className="status-line">
                  <span className="spinner" aria-hidden="true" />
                  Waking up the ranger…
                </div>
              )}

              {[
                'awaiting_scan',
                'connecting',
                'sending_request',
                'awaiting_proof',
                'verifying',
              ].includes(status) && (
                <>
                  {qr && (
                    <div className="qr-frame">
                      <img src={qr} alt="QR code to scan with the BC Services Card app" />
                    </div>
                  )}

                  <div className="status-line">
                    <span className="spinner" aria-hidden="true" />
                    {STATUS_TEXT[status] ?? 'Working…'}
                  </div>

                  <ol className="steps">
                    <li className={step > 0 ? 'done' : 'active'}>
                      Point your phone at that mess of squares
                    </li>
                    <li className={step > 1 ? 'done' : step === 1 ? 'active' : ''}>
                      Accept the connection request
                    </li>
                    <li className={step === 2 ? 'active' : ''}>
                      Share that you&rsquo;re a real BC human
                    </li>
                  </ol>

                  {invitationUrl && (
                    <a className="deep-link" href={invitationUrl}>
                      Already on your phone? Open the wallet here
                    </a>
                  )}

                  {/* Demo-only: shows whether ACA-Py webhooks are reaching us. */}
                  {transport && (
                    <span className={`transport ${transport}`}>
                      {transport === 'webhook' ? 'live via webhook' : 'polling'}
                    </span>
                  )}
                </>
              )}

              {celebrating && (
                <>
                  <div className="big-emoji" aria-hidden="true">
                    🎉
                  </div>
                  <h3 className="result-title">
                    {firstName ? `Welcome home, ${firstName}!` : 'Welcome home, neighbour!'}
                  </h3>

                  <div className="savings-banner">
                    Resident rate unlocked — {money(RESIDENT_DISCOUNT)} off 🔥
                  </div>

                  <div className={`identity-box ${signatureChecked ? '' : 'unverified'}`}>
                    <div className="label">
                      {signatureChecked ? 'Verified as' : 'Received as'}
                    </div>
                    <div className="value">{attributes.given_names ?? '—'}</div>
                    <div className="source">
                      {signatureChecked
                        ? 'From your Digital Services Card, issued by the Government of British Columbia. Signature checked against the ledger.'
                        : 'From your Digital Services Card — but the signature was never checked. The discount is applied for demonstration only.'}
                    </div>
                  </div>

                  <button className="btn">Lock in my spot 🏕️</button>
                </>
              )}

              {status === 'presented_unverified' && !demoTrust && (
                <>
                  <div className="big-emoji" aria-hidden="true">
                    🤔
                  </div>
                  <h3 className="result-title">Well, we got something…</h3>

                  <div className="identity-box unverified">
                    <div className="label">Received (unconfirmed)</div>
                    <div className="value">{attributes.given_names ?? '—'}</div>
                    <div className="source">
                      Your credential arrived, but the ranger couldn&rsquo;t check the
                      signature — the agent&rsquo;s verify step failed. So no resident
                      discount, and treat these values as unconfirmed.
                    </div>
                  </div>

                  <button className="btn btn-secondary" onClick={reset}>
                    Try that again
                  </button>
                </>
              )}

              {['declined', 'rejected', 'error'].includes(status) && (
                <>
                  <div className="big-emoji" aria-hidden="true">
                    🐻
                  </div>
                  <h3 className="result-title">
                    {status === 'declined'
                      ? 'You said no thanks'
                      : status === 'rejected'
                        ? "That credential didn't check out"
                        : 'A bear ate the request'}
                  </h3>
                  <p>
                    {status === 'declined'
                      ? 'No problem — the full rate still gets you the same excellent dirt. Try again whenever.'
                      : status === 'rejected'
                        ? "The presentation didn't pass verification against the ledger, so we can't apply the resident rate."
                        : "We couldn't reach the verification service. Probably raccoons."}
                  </p>
                  {detail && <p className="error-detail">{detail}</p>}
                  <button className="btn btn-secondary" onClick={reset}>
                    Try again
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
