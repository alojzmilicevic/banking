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
}
module.exports = nextConfig
