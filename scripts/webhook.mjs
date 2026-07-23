#!/usr/bin/env node
/**
 * Point the Traction tenant's webhooks at a public tunnel URL, or put things back.
 *
 *   node scripts/webhook.mjs show
 *   node scripts/webhook.mjs set https://something.trycloudflare.com
 *   node scripts/webhook.mjs clear
 *
 * Reads credentials from .env.local.
 */
import { readFileSync } from 'node:fs'

// Minimal .env.local reader — avoids a dependency just for this.
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const BASE = env.TRACTION_BASE_URL
const [, , command, urlArg] = process.argv

async function token() {
  const res = await fetch(`${BASE}/multitenancy/tenant/${env.TRACTION_TENANT_ID}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: env.TRACTION_API_KEY }),
  })
  if (!res.ok) throw new Error(`auth failed: ${res.status} ${await res.text()}`)
  return (await res.json()).token
}

async function getWallet(jwt) {
  const res = await fetch(`${BASE}/tenant/wallet`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`)
  return (await res.json()).settings ?? {}
}

async function putWallet(jwt, body) {
  const res = await fetch(`${BASE}/tenant/wallet`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text()}`)
  return res.json()
}

function report(settings, heading) {
  console.log(`\n${heading}`)
  console.log('  label        :', settings['default_label'])
  console.log('  webhook_urls :', JSON.stringify(settings['wallet.webhook_urls'] ?? []))
  console.log('  dispatch_type:', settings['wallet.dispatch_type'])
}

const jwt = await token()
const before = await getWallet(jwt)

if (command === 'show') {
  report(before, 'Current tenant webhook config:')
  process.exit(0)
}

if (command === 'set') {
  if (!urlArg) {
    console.error('Usage: node scripts/webhook.mjs set https://<tunnel-host>')
    process.exit(1)
  }

  // ACA-Py POSTs to `<url>/topic/<topic>/`, so point it at our receiver root.
  // A `#fragment` is delivered as the x-api-key header — that's how we keep
  // strangers from POSTing forged events at a public tunnel.
  const base = urlArg.replace(/\/+$/, '')
  const hook = env.WEBHOOK_API_KEY
    ? `${base}/api/webhook#${env.WEBHOOK_API_KEY}`
    : `${base}/api/webhook`

  report(before, 'Before:')
  // "both" keeps the innkeeper's base-wallet dispatch intact and adds ours.
  // Plain "default" would silently switch base-wallet webhooks off.
  await putWallet(jwt, {
    label: before['default_label'],
    wallet_webhook_urls: [hook],
    wallet_dispatch_type: 'both',
  })
  report(await getWallet(jwt), 'After:')
  console.log('\nACA-Py will POST to', `${base}/api/webhook/topic/<topic>/`)
  process.exit(0)
}

if (command === 'clear') {
  report(before, 'Before:')
  await putWallet(jwt, {
    label: before['default_label'],
    wallet_webhook_urls: [],
    wallet_dispatch_type: 'base',
  })
  report(await getWallet(jwt), 'After (restored):')
  process.exit(0)
}

console.error('Usage: node scripts/webhook.mjs <show|set <url>|clear>')
process.exit(1)
