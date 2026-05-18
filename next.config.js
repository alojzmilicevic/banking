/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build artifact under .next/standalone — used by the
  // Docker image so the runner stage doesn't need pnpm or the source tree.
  output: 'standalone',
  // Native modules — keep webpack from trying to bundle them.
  // better-sqlite3: SQLite driver. chrome-cookies-secure: macOS Keychain
  // access for reading Chrome's local cookie store.
  serverExternalPackages: ['better-sqlite3', 'chrome-cookies-secure'],
  experimental: {
    reactCompiler: true,
  },
  // Belt-and-suspenders headers. The app is deployed behind Tailscale (no
  // public exposure) but stored provider credentials are decrypted
  // server-side, so a stray clickjack/XSS would be costly.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          {
            key: 'Content-Security-Policy',
            // Next.js inlines a bootstrap script and styles; OAuth redirects
            // send the user out-of-app via window.location, which the
            // browser allows regardless of CSP. 'self' covers all our
            // first-party resources. No remote scripts, no embeds.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}
module.exports = nextConfig
