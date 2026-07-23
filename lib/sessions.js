/**
 * In-memory session store with lookup indices, so an inbound webhook can find
 * the session it belongs to.
 *
 * Demo-only: state is lost on restart and does not survive more than one server
 * process. Stashed on globalThis so Next's dev-mode hot reload doesn't wipe it.
 */
const g = globalThis
const store = g.__demoSessions ?? (g.__demoSessions = new Map())
const byInvitation = g.__demoByInvitation ?? (g.__demoByInvitation = new Map())
const byPresEx = g.__demoByPresEx ?? (g.__demoByPresEx = new Map())

export function createSession(session) {
  store.set(session.id, session)
  byInvitation.set(session.invitationMsgId, session)
  return session
}

export function getSession(id) {
  return store.get(id)
}

/** Used by the `connections` webhook, which carries invitation_msg_id. */
export function getSessionByInvitation(invitationMsgId) {
  return byInvitation.get(invitationMsgId)
}

/** Used by the `present_proof_v2_0` webhook, which carries pres_ex_id. */
export function getSessionByPresEx(presExId) {
  return byPresEx.get(presExId)
}

/** Call once the presentation exchange exists so webhooks can be routed to it. */
export function indexPresEx(presExId, session) {
  byPresEx.set(presExId, session)
}
