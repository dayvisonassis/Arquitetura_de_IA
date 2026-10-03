// Self-test of the design-system rules behind styles-frontend. runGate runs it
// (with cwd = apps/frontend) before the gate gives a verdict.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/frontend'
)
const requireFromFrontend = createRequire(path.join(frontend, 'package.json'))
const { RuleTester } = requireFromFrontend('eslint')
const rule = name => requireFromFrontend(`./tools/eslint-rules/${name}.js`)

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  parser: requireFromFrontend.resolve('@angular-eslint/template-parser')
})
const template = code => ({ code, filename: 'sample.component.html' })
const invalid = (code, messageId) => ({
  ...template(code),
  errors: [{ messageId }]
})

tester.run('no-mat-paginator', rule('no-mat-paginator'), {
  valid: [template('<tails-pagination></tails-pagination>')],
  invalid: [invalid('<mat-paginator></mat-paginator>', 'matPaginator')]
})

tester.run('no-color-attr-on-buttons', rule('no-color-attr-on-buttons'), {
  valid: [
    template('<button mat-flat-button class="btn-primary">Save</button>'),
    template(
      '<mat-dialog-actions><button mat-flat-button color="primary">Save</button></mat-dialog-actions>'
    ),
    template(
      '<div mat-dialog-actions><button mat-flat-button color="primary">Save</button></div>'
    ),
    template('<mat-icon color="warn">info</mat-icon>')
  ],
  invalid: [
    invalid(
      '<button mat-flat-button color="primary">Save</button>',
      'colorAttribute'
    ),
    invalid(
      '<button mat-raised-button color="warn">Delete</button>',
      'colorAttribute'
    ),
    invalid(
      '<mat-dialog-actions><button mat-button color="warn">Cancel</button></mat-dialog-actions>',
      'colorAttribute'
    ),
    invalid(
      '<mat-dialog-actions><button mat-flat-button [color]="tone">Save</button></mat-dialog-actions>',
      'colorAttribute'
    )
  ]
})

tester.run(
  'require-aria-label-icon-button',
  rule('require-aria-label-icon-button'),
  {
    valid: [
      template(
        '<button mat-icon-button aria-label="Fechar"><mat-icon>close</mat-icon></button>'
      ),
      template(
        '<button mat-icon-button [attr.aria-label]="label"><mat-icon>close</mat-icon></button>'
      ),
      template('<button mat-button>Fechar</button>')
    ],
    invalid: [
      invalid(
        '<button mat-icon-button><mat-icon>close</mat-icon></button>',
        'missingLabel'
      )
    ]
  }
)

describe('stylelint design-system rules', () => {
  const plugin = path.join(frontend, 'tools', 'stylelint-rules', 'index.mjs')
  const lintCss = async code => {
    const { default: stylelint } = await import(
      pathToFileURL(requireFromFrontend.resolve('stylelint')).href
    )
    const result = await stylelint.lint({
      code,
      config: {
        plugins: [plugin],
        rules: {
          'tails/no-important-on-tokens': true,
          'tails/no-hardcoded-hex': true
        }
      }
    })
    return result.results[0].warnings.map(warning => warning.rule)
  }

  it('accepts tokens and token fallbacks', async () => {
    assert.deepEqual(
      await lintCss(
        '.a { color: var(--mat-sys-primary); background: var(--app-surface, #fff); --x: 4px; }'
      ),
      []
    )
  })

  it('rejects !important on a token', async () => {
    assert.deepEqual(
      await lintCss(
        '.a { --mat-form-field-container-height: 38px !important; }'
      ),
      ['tails/no-important-on-tokens']
    )
  })

  it('rejects a hardcoded hex colour', async () => {
    assert.deepEqual(await lintCss('.a { border: 1px solid #ccc; }'), [
      'tails/no-hardcoded-hex'
    ])
  })
})
