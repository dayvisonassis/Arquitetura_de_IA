import stylelint from 'stylelint'

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions }
} = stylelint

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/
const TOKEN_FALLBACK = /var\(\s*--[\w-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g

function defineRule(ruleName, message, check) {
  const messages = ruleMessages(ruleName, { rejected: message })
  const rule = primary => (root, result) => {
    if (!validateOptions(result, ruleName, { actual: primary })) {
      return
    }
    root.walkDecls(declaration => {
      const word = check(declaration)
      if (word) {
        report({
          ruleName,
          result,
          node: declaration,
          message: messages.rejected(declaration.prop),
          word
        })
      }
    })
  }
  rule.ruleName = ruleName
  rule.messages = messages
  return createPlugin(ruleName, rule)
}

const noImportantOnTokens = defineRule(
  'tails/no-important-on-tokens',
  property =>
    `Design tokens never need !important: remove it from ${property} and raise specificity on the selector if Material wins.`,
  declaration =>
    declaration.prop.startsWith('--') && declaration.important
      ? '!important'
      : null
)

const noHardcodedHex = defineRule(
  'tails/no-hardcoded-hex',
  property =>
    `Hardcoded colour in ${property}: use a design token (var(--mat-sys-*) or var(--app-*)). A var(--token, #hex) fallback is allowed.`,
  declaration => {
    const match = declaration.value.replace(TOKEN_FALLBACK, '').match(HEX_COLOR)
    return match ? match[0] : null
  }
)

export default [noImportantOnTokens, noHardcodedHex]
