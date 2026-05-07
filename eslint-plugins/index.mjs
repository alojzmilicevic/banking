import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import postcss from 'postcss'

const noLargeAssets = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow importing assets above per-extension size limits' },
    schema: [
      {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fileTypes: { type: 'array', items: { type: 'string' } },
                limitInKiloBytes: { type: 'number' },
              },
              required: ['fileTypes', 'limitInKiloBytes'],
              additionalProperties: false,
            },
          },
        },
        required: ['patterns'],
        additionalProperties: false,
      },
    ],
    messages: {
      tooLarge:
        'Asset "{{file}}" is {{actual}}KB which exceeds the {{limit}}KB limit for {{ext}} files.',
    },
  },
  create(context) {
    const [{ patterns }] = context.options
    const limitFor = new Map()
    for (const { fileTypes, limitInKiloBytes } of patterns) {
      for (const ext of fileTypes) limitFor.set(ext.toLowerCase(), limitInKiloBytes)
    }

    function check(node, source) {
      if (typeof source !== 'string' || !source.startsWith('.')) return
      const ext = extname(source).toLowerCase()
      const limit = limitFor.get(ext)
      if (limit == null) return
      const filename = context.filename ?? context.getFilename()
      const abs = resolve(dirname(filename), source)
      if (!existsSync(abs)) return
      const sizeKb = statSync(abs).size / 1024
      if (sizeKb <= limit) return
      context.report({
        node,
        messageId: 'tooLarge',
        data: { file: source, actual: sizeKb.toFixed(1), limit, ext },
      })
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value)
      },
      CallExpression(node) {
        if (node.callee.type === 'Import' && node.arguments[0]?.type === 'Literal') {
          check(node.arguments[0], node.arguments[0].value)
        }
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal'
        ) {
          check(node.arguments[0], node.arguments[0].value)
        }
      },
    }
  },
}

// Forbids `style={{...}}` on JSX elements except when every property is a CSS
// custom property (key starts with `--`). The `--var` escape hatch lets
// genuinely-dynamic values flow into Tailwind via `bg-[var(--my-var)]` etc.
const noInlineStyles = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow inline style objects in JSX (allow CSS custom properties)' },
    schema: [],
    messages: {
      forbidden:
        'Inline styles are not allowed. Use Tailwind via cn(); for one-offs use arbitrary values like className="w-[37px]". For dynamic values, set a CSS custom property: style={{ "--x": value }} className="bg-[var(--x)]".',
    },
  },
  create(context) {
    function isCustomProperty(prop) {
      if (prop.type !== 'Property') return false
      const k = prop.key
      if (k.type === 'Literal' && typeof k.value === 'string') return k.value.startsWith('--')
      if (k.type === 'Identifier') return k.name.startsWith('__')
      return false
    }
    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'style') return
        const expr = node.value
        if (!expr || expr.type !== 'JSXExpressionContainer') return
        const obj = expr.expression
        if (obj.type !== 'ObjectExpression') return
        if (obj.properties.length === 0) return
        if (obj.properties.every(isCustomProperty)) return
        context.report({ node, messageId: 'forbidden' })
      },
    }
  },
}

// Flags Tailwind utility classes that use an arbitrary value (`bg-[…]`,
// `text-[…]`, `border-[…]`, etc.) when that value matches a value already
// declared as a design-system token. Example: `bg-[rgba(255,255,255,0.06)]`
// becomes `bg-secondary` because the same rgba lives behind --color-secondary.
//
// Bridges the gap between the stylelint `prefer-design-token` rule (which
// only sees CSS files) and the JSX className strings stylelint can't read.
//
// Token map is loaded once from app/globals.css via postcss and cached.
const COLOR_PREFIXES = new Set([
  'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'outline',
  'decoration', 'divide', 'accent', 'caret', 'placeholder',
  'from', 'to', 'via',
])

const PREFIX_TO_NAMESPACE = new Map([
  // Tailwind v4 namespace lookup: `bg-foo` matches a `--color-foo` token,
  // `text-N` matches `--text-N`, `rounded-N` matches `--radius-N`,
  // `tracking-X` matches `--tracking-X`.
  ['bg', 'color'], ['text', 'color'], ['border', 'color'], ['ring', 'color'],
  ['fill', 'color'], ['stroke', 'color'], ['outline', 'color'],
  ['decoration', 'color'], ['divide', 'color'], ['accent', 'color'],
  ['caret', 'color'], ['placeholder', 'color'],
  ['from', 'color'], ['to', 'color'], ['via', 'color'],
  ['rounded', 'radius'],
  ['tracking', 'tracking'],
  // text-N for font-size lives under --text-N, but `text-` is dual-purpose
  // (color and size). We handle font-size matches separately by also
  // checking the text-* namespace when the value parses as a length/rem.
])

// Prefixes that consume a value from Tailwind's spacing scale. The scale's
// step is var(--spacing) = 0.25rem in v4, so `p-2 = 0.5rem`. With a 16px
// root font-size that's 8px, which is what the canonicalization assumes.
const SPACING_PREFIXES = new Set([
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'ms', 'me',
  'gap', 'gap-x', 'gap-y',
  'space-x', 'space-y',
  'size', 'w', 'h', 'min-w', 'max-w', 'min-h', 'max-h',
  'top', 'right', 'bottom', 'left', 'start', 'end',
  'inset', 'inset-x', 'inset-y',
  'translate-x', 'translate-y',
  'basis',
])

// `[Npx]` / `[Nrem]` → Tailwind spacing-scale step, or null if it doesn't
// land on a 0.25 multiple. 16px root means 1px = 0.0625rem = 0.25 step,
// so every integer-px value canonicalizes; sub-pixel values usually don't.
function canonicalSpacing(value) {
  const m = value.match(/^(\d+(?:\.\d+)?)(px|rem)$/)
  if (!m) return null
  const num = Number(m[1])
  if (num <= 0) return null
  const rem = m[2] === 'px' ? num / 16 : num
  const step = rem / 0.25
  // Reject values that don't sit cleanly on the 0.25 step grid.
  const snapped = Math.round(step * 4) / 4
  if (Math.abs(step - snapped) > 1e-6) return null
  // Stringify without a trailing `.0` — `2` not `2.0`.
  return Number.isInteger(snapped) ? String(snapped) : String(snapped)
}

function normalizeValue(value) {
  // Strip whitespace, lowercase function names. Keeps hex/rgba/oklch
  // comparable across formatting differences.
  return value.replace(/\s+/g, '').toLowerCase()
}

// Build the set of strings a value should be compared against. Includes
// the input itself and any px↔rem unit conversions (1rem = 16px) so that
// `rounded-[8px]` matches `--radius-8: 0.5rem`.
function valueAliases(value) {
  const norm = normalizeValue(value)
  const out = new Set([norm])
  const px = norm.match(/^(\d+(?:\.\d+)?)px$/)
  if (px) {
    const rem = Number(px[1]) / 16
    out.add(`${rem}rem`)
  }
  const rem = norm.match(/^(\d+(?:\.\d+)?)rem$/)
  if (rem) {
    const px = Number(rem[1]) * 16
    out.add(`${px}px`)
  }
  return out
}

const tokenCache = new Map() // absPath -> { byNamespaceValue: Map<`${ns}|${normValue}`, name>, byTextValue: Map<normValue, name> }

function loadTokens(globalsPath) {
  if (tokenCache.has(globalsPath)) return tokenCache.get(globalsPath)
  const byNamespaceValue = new Map()
  const byTextValue = new Map()
  if (!existsSync(globalsPath)) {
    const empty = { byNamespaceValue, byTextValue }
    tokenCache.set(globalsPath, empty)
    return empty
  }
  const css = readFileSync(globalsPath, 'utf8')
  const root = postcss.parse(css)
  root.walkDecls((decl) => {
    const prop = decl.prop
    // Skip Tailwind v4 paired modifiers (`--text-14--line-height` etc.)
    if (prop.indexOf('--', 2) !== -1) return
    const m = prop.match(/^--(color|radius|tracking|text)-(.+)$/)
    if (!m) return
    const [, namespace, name] = m
    const norm = normalizeValue(decl.value)
    byNamespaceValue.set(`${namespace}|${norm}`, name)
    if (namespace === 'text') byTextValue.set(norm, name)
  })
  const result = { byNamespaceValue, byTextValue }
  tokenCache.set(globalsPath, result)
  return result
}

// Match `[modifier:][modifier:]<prefix>-[<value>]` inside a class string.
// `prefix` is anything ending the run of letters/dashes before `-[`.
const ARBITRARY_RX = /(?:^|\s)((?:[a-z0-9-]+:)*)([a-z][a-z0-9-]*)-\[([^\]]+)\]/g

const preferDesignTokenClass = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest design-system token utilities (e.g. bg-secondary) over arbitrary-value classes whose value matches a token (e.g. bg-[rgba(255,255,255,0.06)]).',
    },
    schema: [
      {
        type: 'object',
        properties: { tokensFile: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      preferToken:
        "Prefer `{{ modifiers }}{{ prefix }}-{{ name }}` over `{{ modifiers }}{{ prefix }}-[{{ value }}]` (matches design token `--{{ namespace }}-{{ name }}`).",
      preferSpacing:
        "Prefer `{{ modifiers }}{{ prefix }}-{{ name }}` over `{{ modifiers }}{{ prefix }}-[{{ value }}]` (Tailwind spacing scale; 16px root × 0.25rem step).",
    },
    fixable: 'code',
  },
  create(context) {
    const opts = context.options[0] ?? {}
    const tokensFile = resolve(process.cwd(), opts.tokensFile ?? 'app/globals.css')
    const { byNamespaceValue, byTextValue } = loadTokens(tokensFile)

    function lookup(prefix, value) {
      // Spacing scale match (p-[8px] → p-2). Checked before the design-
      // token namespaces because spacing prefixes don't appear in
      // PREFIX_TO_NAMESPACE — there's no `--spacing-N` token to look up.
      if (SPACING_PREFIXES.has(prefix)) {
        const step = canonicalSpacing(value)
        if (step) return { name: step, namespace: 'spacing' }
      }
      const namespace = PREFIX_TO_NAMESPACE.get(prefix)
      if (!namespace) return null
      const aliases = valueAliases(value)
      for (const alias of aliases) {
        const direct = byNamespaceValue.get(`${namespace}|${alias}`)
        if (direct) return { name: direct, namespace }
      }
      // For `text-`, also try the font-size namespace (text-[0.875rem]
      // can be `text-14` via --text-14: 0.875rem).
      if (prefix === 'text') {
        for (const alias of aliases) {
          const sizeName = byTextValue.get(alias)
          if (sizeName) return { name: sizeName, namespace: 'text' }
        }
      }
      return null
    }

    function checkClassString(node, classString, sourceOffset) {
      ARBITRARY_RX.lastIndex = 0
      let match
      while ((match = ARBITRARY_RX.exec(classString)) !== null) {
        const [whole, modifiers, prefix, value] = match
        const found = lookup(prefix, value)
        if (!found) continue
        // Compute the location of just the bracketed-class run within the source.
        const lead = whole.startsWith(' ') ? 1 : 0
        const start = sourceOffset + match.index + lead
        const end = start + (whole.length - lead)
        context.report({
          loc: {
            start: context.sourceCode.getLocFromIndex(start),
            end: context.sourceCode.getLocFromIndex(end),
          },
          messageId: found.namespace === 'spacing' ? 'preferSpacing' : 'preferToken',
          data: { modifiers, prefix, name: found.name, namespace: found.namespace, value },
          fix(fixer) {
            return fixer.replaceTextRange([start, end], `${modifiers}${prefix}-${found.name}`)
          },
        })
      }
    }

    // Recursively walk a node that lives in a className context, checking any
    // string literal or template-literal quasi we find. Handles the shapes
    // produced by `cn`/`clsx` (string args, conditionals, arrays, object keys
    // like `{ 'bg-foo': cond }`) and `cva` (object values inside variant
    // configs). Walks both keys and values of objects so both APIs work
    // without needing to know which we're inside — non-class strings like
    // `'default'` simply don't match any token.
    function walkClassNode(node) {
      if (!node) return
      switch (node.type) {
        case 'Literal':
          if (typeof node.value === 'string') {
            checkClassString(node, node.value, node.range[0] + 1)
          }
          return
        case 'TemplateLiteral':
          for (const q of node.quasis) {
            checkClassString(q, q.value.cooked, q.range[0] + 1)
          }
          node.expressions.forEach(walkClassNode)
          return
        case 'ConditionalExpression':
          walkClassNode(node.consequent)
          walkClassNode(node.alternate)
          return
        case 'LogicalExpression':
          walkClassNode(node.left)
          walkClassNode(node.right)
          return
        case 'ArrayExpression':
          node.elements.forEach(walkClassNode)
          return
        case 'ObjectExpression':
          for (const prop of node.properties) {
            if (prop.type === 'Property') {
              walkClassNode(prop.key)
              walkClassNode(prop.value)
            } else if (prop.type === 'SpreadElement') {
              walkClassNode(prop.argument)
            }
          }
          return
      }
    }

    const CLASS_FN_NAMES = new Set(['cn', 'clsx', 'classnames', 'twMerge', 'tw', 'cva'])

    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className') return
        const v = node.value
        if (!v) return
        if (v.type === 'Literal') {
          walkClassNode(v)
        } else if (v.type === 'JSXExpressionContainer') {
          walkClassNode(v.expression)
        }
      },
      CallExpression(node) {
        const callee = node.callee
        let name
        if (callee.type === 'Identifier') {
          name = callee.name
        } else if (callee.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
          name = callee.property.name
        }
        if (!name || !CLASS_FN_NAMES.has(name)) return
        node.arguments.forEach(walkClassNode)
      },
    }
  },
}

export default {
  rules: {
    'no-large-assets': noLargeAssets,
    'no-inline-styles': noInlineStyles,
    'prefer-design-token-class': preferDesignTokenClass,
  },
}
