/**
 * Minimal Traction (ACA-Py v1.6) tenant client.
 * Caches the bearer token in module scope — fine for a single-process demo.
 */

const BASE = process.env.TRACTION_BASE_URL
const TENANT_ID = process.env.TRACTION_TENANT_ID
const API_KEY = process.env.TRACTION_API_KEY

let cachedToken = null
let cachedTokenExpiry = 0

async function getToken() {
  // Tokens are good for 24h; refresh 5 minutes early.
  if (cachedToken && Date.now() < cachedTokenExpiry - 5 * 60_000) {
    return cachedToken
  }

  const res = await fetch(`${BASE}/multitenancy/tenant/${TENANT_ID}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY }),
  })

  if (!res.ok) {
    throw new Error(`Traction auth failed: ${res.status} ${await res.text()}`)
  }

  const { token } = await res.json()
  cachedToken = token

  // Trust the JWT's own exp rather than assuming a fixed TTL.
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
  cachedTokenExpiry = claims.exp * 1000

  return cachedToken
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Traction ${method} ${path} -> ${res.status}: ${text}`)
  }
  return text ? JSON.parse(text) : {}
}

/** Create an out-of-band invitation the wallet can scan to form a DIDComm connection. */
export function createInvitation({ label, alias }) {
  return api('/out-of-band/create-invitation?auto_accept=true', {
    method: 'POST',
    body: {
      alias,
      my_label: label,
      // didexchange/1.0 is what BC Wallet / BCSC negotiates.
      handshake_protocols: ['https://didcomm.org/didexchange/1.0'],
      // Tells the wallet this connection exists to satisfy a verification.
      goal_code: 'aries.vc.verify',
      goal: 'Verify your Digital Services Card',
      protocol_version: '1.1',
    },
  })
}

/** Find the connection (if any) that grew out of a given invitation. */
export function findConnection(invitationMsgId) {
  return api(`/connections?invitation_msg_id=${encodeURIComponent(invitationMsgId)}`)
}

/**
 * Which attachment format to send the proof request in.
 *
 * `indy` (hlindy/proof-req@v2.0) is the default — it's what BC Wallet expects and
 * the only format we've seen actually return a presentation, even though this
 * tenant's verifier then 500s on it.
 *
 * `anoncreds` (anoncreds/proof-request@v1.0) matches the tenant's askar-anoncreds
 * profile and was tried as a fix; it did not work against a real wallet. The
 * payload shape is identical either way, so PROOF_FORMAT=anoncreds flips back.
 */
const PROOF_FORMAT = process.env.PROOF_FORMAT === 'anoncreds' ? 'anoncreds' : 'indy'

/** Send the proof request over an established connection. */
export function sendProofRequest(connectionId, proofRequest) {
  return api('/present-proof-2.0/send-request', {
    method: 'POST',
    body: {
      connection_id: connectionId,
      auto_verify: true,
      // This tenant defaults auto_remove ON, so ACA-Py destroys the exchange
      // record the moment the exchange finishes — the next poll then 404s with
      // "Record not found: pres_ex_v20/…". Keeping the record is also the only
      // way to inspect why a verification failed.
      auto_remove: false,
      comment: 'BC residency check for your campsite booking',
      presentation_request: { [PROOF_FORMAT]: proofRequest },
    },
  })
}

/** Raised when a presentation exchange record no longer exists. */
export class RecordGoneError extends Error {}

/** Poll a presentation exchange record. */
export async function getPresentationExchange(presExId) {
  try {
    return await api(`/present-proof-2.0/records/${encodeURIComponent(presExId)}`)
  } catch (err) {
    // Older sessions (or any record created before auto_remove:false) can vanish
    // mid-flight. That's not a service failure — don't surface it as one.
    if (/-> 404/.test(String(err.message))) {
      throw new RecordGoneError(`presentation exchange ${presExId} no longer exists`)
    }
    throw err
  }
}
