/**
 * The connect -> prove -> verify state machine.
 *
 * Shared by two drivers so the demo degrades gracefully:
 *   - webhooks  (instant, needs a public tunnel URL)
 *   - polling   (always works, 2s granularity)
 *
 * Both call into the same functions, so whichever arrives first wins and the
 * other becomes a no-op. If the tunnel dies mid-demo, polling silently resumes.
 */
import { indexPresEx } from './sessions'
import { buildProofRequest } from './proofRequest'
import {
  findConnection,
  sendProofRequest,
  getPresentationExchange,
  RecordGoneError,
} from './traction'

/** didexchange settles on "completed"; connections/1.0 on "active". Accept both. */
const CONNECTED_STATES = new Set(['active', 'completed'])

export const TERMINAL = new Set([
  'verified',
  'presented_unverified',
  'rejected',
  'declined',
  'error',
])

/**
 * How long to wait for ACA-Py to turn `presentation-received` into `done`.
 *
 * This is not hypothetical: verifying a PersonSIT presentation on this tenant
 * returns HTTP 500 and the record stalls at `presentation-received` forever.
 * The credential uses unqualified did:sov identifiers and carries a revocation
 * registry, while the tenant runs an askar-anoncreds profile.
 *
 * The presentation itself is intact — revealed attributes and identifiers are
 * all present — so rather than spin on a spinner we surface what was presented
 * and label it as signature-unconfirmed.
 */
const VERIFY_GRACE_MS = 10_000

/** Pull every revealed attribute out of a verified indy presentation. */
export function extractRevealed(record) {
  const proof =
    record?.by_format?.pres?.indy ?? record?.by_format?.pres?.anoncreds
  const requested = proof?.requested_proof
  if (!requested) return {}

  const out = {}

  // Single-attribute requests land here.
  for (const [name, value] of Object.entries(requested.revealed_attrs ?? {})) {
    if (value?.raw !== undefined) out[name] = value.raw
  }

  // `names: [...]` group requests land here — this is the shape our request uses.
  for (const group of Object.values(requested.revealed_attr_groups ?? {})) {
    for (const [attrName, value] of Object.entries(group?.values ?? {})) {
      out[attrName] = value?.raw
    }
  }

  return out
}

function set(session, status, extra = {}) {
  // Never walk backwards out of a terminal state.
  if (TERMINAL.has(session.status)) return session
  Object.assign(session, { status, lastEventAt: Date.now() }, extra)
  return session
}

/**
 * Send the proof request — guarded so the webhook and the poller can both try.
 */
export async function ensureProofRequestSent(session) {
  if (session.presExId || session.sendingProof) return
  session.sendingProof = true
  set(session, 'sending_request')
  try {
    const pres = await sendProofRequest(session.connectionId, buildProofRequest())
    session.presExId = pres.pres_ex_id
    indexPresEx(pres.pres_ex_id, session)
    set(session, 'awaiting_proof')
  } catch (err) {
    session.sendingProof = false
    throw err
  }
}

/** Apply a connection record (from a webhook or a poll) to the session. */
export async function applyConnection(session, record) {
  // We are the inviter, so the record we care about has the holder as invitee.
  if (record.their_role !== 'invitee') return

  if (!CONNECTED_STATES.has(record.state)) {
    if (['request', 'response'].includes(record.state)) set(session, 'connecting')
    return
  }

  if (!session.connectionId) session.connectionId = record.connection_id
  await ensureProofRequestSent(session)
}

/** Apply a presentation-exchange record to the session. */
export function applyPresEx(session, record) {
  if (record.state === 'done') {
    const verified = record.verified === 'true'
    return set(session, verified ? 'verified' : 'rejected', {
      attributes: verified ? extractRevealed(record) : {},
    })
  }

  if (record.state === 'abandoned') {
    return set(session, 'declined', {
      detail: record.error_msg || 'The request was declined in the wallet.',
    })
  }

  if (record.state === 'presentation-received') {
    // Hold the attributes as soon as they arrive — verification may never land.
    const attributes = extractRevealed(record)
    session.presentedAt ??= Date.now()

    if (Date.now() - session.presentedAt > VERIFY_GRACE_MS) {
      return set(session, 'presented_unverified', { attributes })
    }
    return set(session, 'verifying', { attributes })
  }

  if (record.state === 'request-sent') return set(session, 'awaiting_proof')

  // ACA-Py emits this when auto_remove destroys the record. With
  // auto_remove:false it shouldn't fire, but a record created before that
  // change still can — degrade to whatever the holder already sent us.
  if (record.state === 'deleted' && Object.keys(session.attributes ?? {}).length) {
    return set(session, 'presented_unverified', {
      detail: 'The exchange record was removed before verification completed.',
    })
  }

  return session
}

/**
 * Fallback driver: ask Traction directly. Used when webhooks aren't configured
 * or haven't arrived.
 */
export async function pollTraction(session) {
  if (!session.connectionId) {
    const { results = [] } = await findConnection(session.invitationMsgId)
    for (const record of results) await applyConnection(session, record)
    if (!session.connectionId) return
  }

  if (!session.presExId) {
    await ensureProofRequestSent(session)
    if (!session.presExId) return
  }

  try {
    applyPresEx(session, await getPresentationExchange(session.presExId))
  } catch (err) {
    if (!(err instanceof RecordGoneError)) throw err

    // ACA-Py destroyed the record. If the presentation already reached us we
    // still have its attributes, so report those rather than a hard error —
    // the holder did their part and the page shouldn't look broken.
    if (Object.keys(session.attributes ?? {}).length) {
      set(session, 'presented_unverified', {
        detail: 'The exchange record was removed before verification completed.',
      })
    } else {
      set(session, 'error', {
        detail:
          'The presentation exchange record was removed before a result was recorded.',
      })
    }
  }
}
