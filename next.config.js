/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native modules — keep webpack from trying to bundle them.
  // better-sqlite3: SQLite driver. chrome-cookies-secure: macOS Keychain
  // access for reading Chrome's local cookie store.
  serverExternalPackages: ['better-sqlite3', 'chrome-cookies-secure'],
}
module.exports = nextConfig
