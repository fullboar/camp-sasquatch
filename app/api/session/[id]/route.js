import { getSession } from '../../../../lib/sessions'
import { pollTraction, TERMINAL } from '../../../../lib/flow'

export const dynamic = 'force-dynamic'

/**
 * How long we trust a webhook-driven status before falling back to polling
 * Traction. If the tunnel dies mid-demo this is the recovery window.
 */
const WEBHOOK_TRUST_MS = 6000

/** GET /api/session/:id — report status, polling Traction only when needed. */
export async function GET(_request, { params }) {
  const { id } = await params
  const session = getSession(id)

  if (!session) {
    return Response.json({ error: 'Unknown session' }, { status: 404 })
  }

  const fresh = Date.now() - (session.lastEventAt ?? 0) < WEBHOOK_TRUST_MS
  const settled = TERMINAL.has(session.status)

  // Webhooks are keeping this session current — don't bother Traction.
  if (!settled && !(session.webhookDriven && fresh)) {
    try {
      await pollTraction(session)
    } catch (err) {
      console.error('[session:poll]', err)
      return Response.json(
        { status: 'error', detail: String(err.message || err) },
        { status: 500 }
      )
    }
  }

  return Response.json({
    status: session.status ?? 'awaiting_scan',
    attributes: session.attributes ?? {},
    ...(session.detail ? { detail: session.detail } : {}),
    transport: session.webhookDriven ? 'webhook' : 'polling',
    // Note the status itself is never rewritten — a presented-but-unverified
    // credential stays `presented_unverified` on the server. This flag only tells
    // the UI it may celebrate anyway, and the UI must say so on screen.
    demoTrustPresented: process.env.DEMO_TRUST_PRESENTED === 'true',
  })
}
