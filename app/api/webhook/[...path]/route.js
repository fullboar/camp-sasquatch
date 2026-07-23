/**
 * ACA-Py webhook receiver.
 *
 * ACA-Py POSTs to `{webhook_url}/topic/{topic}/` — note the trailing slash. This
 * is a catch-all so the slash (and any future path shape) still matches instead
 * of bouncing through a redirect.
 *
 * If the configured webhook URL carries a `#fragment`, ACA-Py sends it as the
 * `x-api-key` header. Set WEBHOOK_API_KEY to require it — the tunnel is public,
 * so without this anyone could POST a forged "verified" event.
 */
import {
  getSessionByInvitation,
  getSessionByPresEx,
} from '../../../../lib/sessions'
import { applyConnection, applyPresEx } from '../../../../lib/flow'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  const expectedKey = process.env.WEBHOOK_API_KEY
  if (expectedKey && request.headers.get('x-api-key') !== expectedKey) {
    return new Response('unauthorized', { status: 401 })
  }

  const { path = [] } = await params
  const topic = path.filter(Boolean).pop()

  let payload
  try {
    payload = await request.json()
  } catch {
    return new Response('bad payload', { status: 400 })
  }

  try {
    if (topic === 'connections') {
      const session = getSessionByInvitation(payload.invitation_msg_id)
      if (session) {
        console.log(`[webhook] connections ${payload.state} -> session ${session.id}`)
        session.webhookDriven = true
        await applyConnection(session, payload)
      }
    } else if (topic === 'present_proof_v2_0') {
      const session = getSessionByPresEx(payload.pres_ex_id)
      if (session) {
        console.log(`[webhook] present_proof ${payload.state} -> session ${session.id}`)
        session.webhookDriven = true
        applyPresEx(session, payload)
      }
    }
    // Every other topic (ping, out_of_band, basicmessages…) is ignored.
  } catch (err) {
    // Never let a handler error make ACA-Py retry forever.
    console.error('[webhook] handler failed', err)
  }

  // ACA-Py only cares that it got a 2xx.
  return new Response(null, { status: 204 })
}
