import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { createInvitation } from '../../../lib/traction'
import { createSession } from '../../../lib/sessions'

export const dynamic = 'force-dynamic'

/** POST /api/session — mint an OOB invitation and return it as a scannable QR. */
export async function POST() {
  try {
    const label = process.env.VERIFIER_LABEL || 'BC Registry Services'
    const id = randomUUID()

    const invitation = await createInvitation({ label, alias: `demo-${id.slice(0, 8)}` })

    const qrDataUrl = await QRCode.toDataURL(invitation.invitation_url, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'L',
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })

    createSession({
      id,
      invitationMsgId: invitation.invi_msg_id,
      invitationUrl: invitation.invitation_url,
      connectionId: null,
      presExId: null,
      sendingProof: false,
      status: 'awaiting_scan',
      attributes: {},
      webhookDriven: false,
      lastEventAt: 0,
      createdAt: Date.now(),
    })

    return Response.json({
      sessionId: id,
      qrDataUrl,
      invitationUrl: invitation.invitation_url,
    })
  } catch (err) {
    console.error('[session:create]', err)
    return Response.json({ error: String(err.message || err) }, { status: 500 })
  }
}
