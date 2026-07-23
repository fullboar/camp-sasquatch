/**
 * The proof request presented to the wallet.
 *
 * Requesting the Digital Services Card is what triggers BCSC v4.1 to automatically
 * fetch/issue the credential if the holder does not already have it.
 *
 * NOTE ON NAMES: the credential is the Digital Services Card (formerly "Person").
 * Its on-ledger objects still carry the old name — schema `Person:1.0`, credential
 * definition `PersonSIT` — so the identifiers below are left exactly as published.
 */

/**
 * What the requested credential is pinned to.
 *
 * `creddef` (default) — the `PersonSIT` definition
 * (`7xjfawcnyTUcduWVysLww5:3:CL:28075:PersonSIT`, Person 1.0). Pins to a single
 * issuer. This is the only restriction we've seen actually return a presentation:
 * the holder shares `given_names`, though this tenant's verifier then 500s on the
 * non-revocation proof (see the revocation section in the README).
 *
 * `schema` — Person 2.0 (`QEquAHkM35w4XVT3Ku5yat:2:Person:2.0`), matching any
 * issuer on that schema. Tried and did NOT work against a real wallet; kept here so
 * it's one env var away rather than a re-edit.
 *
 * Both schemas carry the same ten attributes, `given_names` included, so nothing
 * else in the request changes.
 */
const RESTRICT_BY = process.env.RESTRICT_BY === 'schema' ? 'schema' : 'creddef'

const PERSON_V2_SCHEMA_ID = 'QEquAHkM35w4XVT3Ku5yat:2:Person:2.0'
const PERSON_SIT_CRED_DEF_ID = '7xjfawcnyTUcduWVysLww5:3:CL:28075:PersonSIT'

/**
 * Whether to demand a non-revocation proof.
 *
 * Person 1.0 / PersonSIT is REVOCABLE, and without a `non_revoked` interval the
 * holder returns its `rev_reg_id` with `timestamp: null` — ACA-Py's verifier then
 * 500s resolving the registry at a null timestamp, and the exchange stalls at
 * `presentation-received` forever. An interval makes the holder build a proper
 * non-revocation proof with a real timestamp.
 *
 * Whether Person 2.0 is revocable is unconfirmed. If the wallet can't satisfy the
 * interval (no tails access, or a non-revocable credential), set
 * REQUIRE_NON_REVOKED=false.
 */
const REQUIRE_NON_REVOKED = process.env.REQUIRE_NON_REVOKED !== 'false'

/**
 * Built per request because `non_revoked` needs a current timestamp.
 *
 * NOTE: the nonce is fixed to match the supplied demo payload. Production
 * verifiers must use a fresh random nonce per request.
 */
export function buildProofRequest() {
  const now = Math.floor(Date.now() / 1000)

  const restriction =
    RESTRICT_BY === 'creddef'
      ? { cred_def_id: PERSON_SIT_CRED_DEF_ID }
      : { schema_id: PERSON_V2_SCHEMA_ID }

  return {
    name: 'proof-request',
    nonce: '1234567890',
    version: '1.0',
    requested_attributes: {
      studentInfo: {
        names: ['given_names'],
        restrictions: [restriction],
      },
    },
    requested_predicates: {},
    ...(REQUIRE_NON_REVOKED ? { non_revoked: { to: now } } : {}),
  }
}
