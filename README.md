# 🏕️ Camp Sasquatch — a Digital Services Card demo

> Welcome to **Camp Sasquatch**, a campground that does not exist, run by a cryptid
> on a diet, where site 42 is called "Mossy Nook" and the raccoons have their own
> policy page. It was vibe coded in an afternoon and it is very silly.
>
> It also does one entirely serious thing: it proves the **BC Services Card app
> (BCSC) v4.1** can hold a **Digital Services Card** and present it to a real
> verifier over a real DIDComm connection.

The sasquatch is fake. The tent is fake. Gary at the front desk is fake. The Aries
agent, the DIDComm connection, the AnonCreds proof request, and the credential that
comes back off your phone are all completely real.

## The premise

Locals camp cheaper — it's the law of the land (and also our pricing policy). So
before you can book, Camp Sasquatch wants to know you're a British Columbian.

Instead of a form, a photocopier, and a conversation with Gary, you scan a QR code.
Your wallet shares your **Digital Services Card**, and the resident rate unlocks:
**$122.00 → $96.00**, live on the page.

That's the whole point of the silliness — it turns "a credential was verified" from
an abstract green tick into a number that visibly drops. Requesting the Digital
Services Card is also what triggers BCSC v4.1 to automatically fetch it if the holder
doesn't already have one.

> **A note on names.** The credential is the **Digital Services Card** (formerly
> "Person"). Its on-ledger objects still carry the old name — the schema is
> `Person:1.0` and the credential definition is `PersonSIT` — so you'll see `Person`
> throughout the identifiers in the code. Those are ledger facts and are left
> untouched; only the human-facing name changed.

> **Demo only.** This talks to a BC Digital Trust *sandbox* tenant and cuts corners
> that are called out under [Demo shortcuts](#demo-shortcuts-deliberate). Do not use
> it as a template for a production verifier.

## Quick start

Requires [pnpm](https://pnpm.io) and Node 20+.

```bash
pnpm install
cp .env.sample .env.local   # then fill in your Traction tenant id + api key
pnpm dev
```

Open <http://localhost:3000> and click **Prove I'm a British Columbian**, then scan
the QR code with the BC Services Card app.

You need a Traction tenant and a wallet holding a Digital Services Card.

`pnpm install` prints `Ignored build scripts: sharp`. That's expected and safe to
leave — `sharp` only matters for `next/image` optimization, and this app renders the
QR with a plain `<img>` and a data URI. Production builds succeed without it.

## How it works

```
POST /api/session
  └─ POST /out-of-band/create-invitation   (handshake: didexchange/1.0,
  └─ returns invitation_url, rendered as a QR   goal_code: aries.vc.verify)

GET /api/session/:id                       (browser polls every 2s)
  1. GET  /connections?invitation_msg_id=…   wait for state active|completed
  2. POST /present-proof-2.0/send-request    sent once, on connect
  3. GET  /present-proof-2.0/records/:id     until state=done
       verified === "true"  ⇒  reveal given_names, apply discount
```

UI statuses: `awaiting_scan` → `connecting` → `sending_request` → `awaiting_proof` →
`verifying` → `verified`, or `presented_unverified` / `declined` / `rejected` /
`error`.

## Configuration

All optional except the tenant credentials. See `.env.sample` for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRACTION_BASE_URL` | sandbox proxy | Traction tenant proxy base URL |
| `TRACTION_TENANT_ID` | — | Tenant UUID (required) |
| `TRACTION_API_KEY` | — | Tenant API key (required) |
| `VERIFIER_LABEL` | `Camp Sasquatch` | Name the wallet shows for the connection |
| `PROOF_FORMAT` | `indy` | `indy` or `anoncreds` attachment format |
| `RESTRICT_BY` | `creddef` | Pin to a `cred_def_id` or a `schema_id` |
| `REQUIRE_NON_REVOKED` | `true` | Send a `non_revoked` interval |
| `DEMO_TRUST_PRESENTED` | `true` | Unlock the discount without a signature check |
| `WEBHOOK_API_KEY` | — | Shared secret for the webhook receiver |

Next.js does not hot-reload `.env.local` — restart the dev server after changes.

## Known limitation: verification does not complete

The credential exchange works end-to-end against a real BC Services Card wallet: the
connection forms, the proof request arrives, and the holder shares `given_names`.
**The final signature check does not run.**

The Digital Services Card (`PersonSIT` on the ledger) is **revocable**. Verifying a
proof from it requires resolving its revocation registry from the ledger, and on this
tenant that fails:

```
POST /present-proof-2.0/records/{id}/verify-presentation
→ 500 Server got itself in trouble
```

`auto_verify` hits the same exception on receipt, so the exchange record stalls at
`presentation-received` and never reaches `done`.

This reproduces with a raw `curl` straight at Traction, with this app entirely out of
the loop — it is a Traction/ACA-Py issue, not an application bug. Everything
verification needs resolves *except* the revocation registry: schema ✅, cred def ✅,
issuer DID ✅, revocation registry ❌.

### What was tried

| Attempt | Result |
| --- | --- |
| `non_revoked` interval | Fixed the holder side — `timestamp` went `null` → real value. Verifier still 500s. |
| `anoncreds` request format | Matches the tenant's askar-anoncreds profile. Did not work. |
| Person 2.0 schema (`QEquAHkM35w4XVT3Ku5yat:2:Person:2.0`) | Did not work. |

The first is kept (it is correct regardless). The other two were reverted but survive
as `PROOF_FORMAT` and `RESTRICT_BY` so they are one env var away.

Settling the root cause needs the ACA-Py server logs from the sandbox, which are not
accessible from here.

### How the app copes

`lib/flow.js` does not wait forever. After `VERIFY_GRACE_MS` it surfaces the revealed
attributes as `presented_unverified` rather than spinning.

`DEMO_TRUST_PRESENTED=true` then lets that state unlock the discount, so the demo
still lands. It is a **presentation-layer concession only**:

- The server never rewrites the status. `presented_unverified` stays
  `presented_unverified`, and `verified` still means a real signature check. The flag
  only tells the UI it may celebrate.
- The panel still tells the truth: amber dashed box, heading reads **"Received as"**
  rather than "Verified as", and the body says the signature was never checked. A
  genuine verification shows a solid green box and "Verified as".

If verification ever starts working, the real green panel appears automatically with
no code change.

## Webhooks (optional — polling is the safer default)

Webhooks work and were verified end-to-end, driving the full
`invitation → request → response → active → request-sent` lifecycle.

They are still not the better choice for a live demo. During testing the
`trycloudflare.com` quick-tunnel hostname changed while the tenant pointed at the old
one, and delivery silently stopped. The demo carried on because polling took over —
which is the argument *for* polling. A tunnel adds a moving part that fails quietly
mid-presentation, and buys about two seconds of latency.

Both drivers call the same state machine in `lib/flow.js`, so they compose: whichever
signal arrives first wins, and if the tunnel dies polling resumes within ~6s
(`WEBHOOK_TRUST_MS`).

```bash
cloudflared tunnel --url http://localhost:3000        # 1. expose localhost
node scripts/webhook.mjs set https://<random>.trycloudflare.com   # 2. register
node scripts/webhook.mjs clear                        # 3. always clean up
```

`scripts/webhook.mjs show` prints the current config without changing anything.

- The tenant ships with `wallet.dispatch_type: "base"`, which dispatches **only** to
  the innkeeper. Setting `wallet_webhook_urls` alone does nothing. The script sets
  `both`, adding our URL while leaving base dispatch intact.
- ACA-Py POSTs to `<url>/topic/<topic>/` — with a trailing slash. `next.config.mjs`
  sets `skipTrailingSlashRedirect` so the route matches directly rather than relying
  on the agent to follow a 308.
- `WEBHOOK_API_KEY` becomes a `#fragment` on the URL; ACA-Py returns it as
  `x-api-key`. Without it, anyone who finds the tunnel could POST a forged event.
- Quick-tunnel hostnames change on restart *and can change while running*.
- Always `clear` when finished, or the tenant is left pointing at a dead host.

## Files

| Path | Purpose |
| --- | --- |
| `lib/traction.js` | Traction/ACA-Py client; caches the tenant JWT |
| `lib/proofRequest.js` | Builds the proof request; restriction lives here |
| `lib/flow.js` | The connect → prove → verify state machine |
| `lib/sessions.js` | In-memory session store + webhook lookup indices |
| `app/page.js` | The booking page and its UI states |
| `app/api/session/route.js` | Mints the invitation + QR |
| `app/api/session/[id]/route.js` | Reports status; polls Traction when needed |
| `app/api/webhook/[...path]/route.js` | ACA-Py webhook receiver |
| `scripts/webhook.mjs` | Set / clear / show the tenant webhook config |

## Demo shortcuts (deliberate)

- Sessions are in-memory: a restart loses them, and it will not survive more than one
  server process.
- The nonce is fixed at `1234567890` to match the originally supplied payload. A real
  verifier must generate a fresh random nonce per request.
- `RESTRICT_BY=schema` accepts a Digital Services Card from *any* issuer on that
  schema.
  The default `creddef` is the tighter, more correct restriction.
- `auto_remove: false` on proof requests keeps exchange records for inspection, so
  they accumulate in the tenant and never self-clean.
- `DEMO_TRUST_PRESENTED` — see above. Never enable outside a demo.
- "Lock in my spot" is inert; there is no booking or payment behind it.

## The prompt that started it

Vibe coded, as advertised. Roughly this brief:

```text
Vibe-code me a single-page demo: a silly fake campsite booking site
(Next.js, plain CSS) where you scan a QR to prove you're a BC resident,
and the price drops when it works.

Flow: establish a DIDComm connection first, then send this proof request:

{
  "name": "proof-request",
  "nonce": "1234567890",
  "version": "1.0",
  "requested_attributes": {
    "studentInfo": {
      "names": ["given_names"],
      "restrictions": [
        { "cred_def_id": "7xjfawcnyTUcduWVysLww5:3:CL:28075:PersonSIT" }
      ]
    }
  },
  "requested_predicates": {}
}

Traction sandbox — use it for all the credential heavy lifting. Docs at
https://traction-sandbox-tenant-proxy.apps.silver.devops.gov.bc.ca/api/doc
tenant 976173eb-…, key 3d8313fd… (sandbox creds, don't worry about them,
but put them in .env.local, not in .env.sample, use placeholders there).

Check feasibility first before building. pnpm, git repo, Apache 2.0.
```

The one thing no prompt could have anticipated is the [verification
limitation](#known-limitation-verification-does-not-complete) — that only surfaced
once a real phone presented a real credential, and finding it was most of the work.

## License

Copyright 2026 Fullboar Creative Corp.

Licensed under the Apache License, Version 2.0 — see [LICENSE](LICENSE).
