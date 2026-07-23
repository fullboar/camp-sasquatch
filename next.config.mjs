/** @type {import('next').NextConfig} */
const nextConfig = {
  // ACA-Py POSTs webhooks to `<url>/topic/<topic>/` with a trailing slash.
  // Without this, Next answers with a 308 redirect and we'd be depending on the
  // agent's HTTP client to follow it. Serve the route directly instead.
  skipTrailingSlashRedirect: true,
}

export default nextConfig
