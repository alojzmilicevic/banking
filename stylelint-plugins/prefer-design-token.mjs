// Custom stylelint rule: prefer-design-token.
//
// Walks the configured token CSS files (typically app/globals.css), builds a
// `value -> token-name` map, then for every CSS declaration in the linted
// files reports any literal value that exactly matches a token's value and
// suggests rewriting it as `var(--<token>)`.
//
// Adapted from GeoGuessr's stylelint-plugin/prefer-design-token.mjs —
// trimmed of SCSS-specific bits since banking uses plain CSS.

import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import stylelint from 'stylelint'

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint

const ruleName = 'banking/prefer-design-token'

const messages = ruleMessages(ruleName, {
  rejected: (value, token) => `Prefer 'var(${token})' over '${value}'.`,
})

const fileCache = new Map()

function parseTokenFile(absPath) {
  if (fileCache.has(absPath)) return fileCache.get(absPath)
  const css = fs.readFileSync(absPath, 'utf8')
  const root = postcss.parse(css)
  fileCache.set(absPath, root)
  return root
}

function buildTokenMap({ files, prefixes, properties }) {
  const valueByToken = new Map() // tokenName -> [literalValue, parsedNodes]
  const propertiesByToken = new Map() // tokenName -> Set of allowed property names (or null = any)

  for (const filePath of files) {
    const abs = path.resolve(process.cwd(), filePath)
    const root = parseTokenFile(abs)
    root.walkDecls((decl) => {
      const token = decl.prop
      if (!prefixes.some((p) => token.startsWith(p))) return
      // Skip Tailwind v4 paired modifiers like `--text-14--line-height`
      // (the parent `--text-14` is the canonical token; the modifier is
      // emitted alongside it by the `text-14` utility automatically).
      if (token.includes('--', 2)) return
      valueByToken.set(token, [decl.value, valueParser(decl.value)])
      if (properties && properties.length > 0) {
        propertiesByToken.set(token, new Set(properties))
      }
    })
  }

  return { valueByToken, propertiesByToken }
}

function valueNodesEqual(a, b) {
  if (a?.length !== b?.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (x.type !== y.type) return false
    if (x.value !== y.value) return false
    if (x.nodes?.length !== y.nodes?.length) return false
    if (x.nodes && !valueNodesEqual(x.nodes, y.nodes)) return false
  }
  return true
}

const meta = { url: 'https://example.invalid/banking/prefer-design-token' }

const plugin = createPlugin(ruleName, (primary, secondary) => (root, result) => {
  if (!primary) return

  const valid = validateOptions(result, ruleName, {
    actual: primary,
    possible(p) {
      return Array.isArray(p) && p.every((entry) => Array.isArray(entry.files) && Array.isArray(entry.rules))
    },
  })
  if (!valid) return

  // Merge all configured token sources into one map.
  const tokenMaps = []
  for (const source of primary) {
    for (const rule of source.rules) {
      tokenMaps.push(
        buildTokenMap({
          files: source.files,
          prefixes: rule.prefixes,
          properties: rule.properties,
        }),
      )
    }
  }

  root.walkDecls((decl) => {
    const declParsed = valueParser(decl.value)

    for (const { valueByToken, propertiesByToken } of tokenMaps) {
      for (const [token, [, tokenParsed]] of valueByToken) {
        const allowed = propertiesByToken.get(token)
        if (allowed && !allowed.has(decl.prop)) continue
        // Walk the declaration looking for a sub-tree that matches the
        // token's parsed value exactly. This catches both bare matches
        // (`color: #fff`) and matches inside larger expressions (e.g.
        // `border: 1px solid #fff`).
        let matched = false
        declParsed.walk((node) => {
          if (matched) return false
          if (valueNodesEqual([node], tokenParsed.nodes)) {
            const literal = valueParser.stringify(node)
            report({
              ruleName,
              result,
              node: decl,
              message: messages.rejected(literal, token),
              word: literal,
            })
            matched = true
            return false
          }
        })
        if (matched) break
      }
    }
  })
})

plugin.ruleName = ruleName
plugin.messages = messages
plugin.meta = meta

export default plugin
