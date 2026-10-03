// Self-test of the backend data-access rules. runGate runs it (with cwd = apps/backend)
// before raw-sql-backend and query-loop-backend give a verdict.
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const backend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/backend'
)
const requireFromBackend = createRequire(path.join(backend, 'package.json'))
const { RuleTester } = requireFromBackend('eslint')
const noKnexRaw = requireFromBackend('./tools/eslint-rules/no-knex-raw.js')
const noQueryInLoop = requireFromBackend(
  './tools/eslint-rules/no-query-in-loop.js'
)

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
})
const modelFile = path.join(backend, 'src/api/v2/models/sample.model.js')

tester.run('no-knex-raw', noKnexRaw, {
  valid: [
    { code: "db('users').where('id', id)" },
    { code: 'String.raw({ raw: ["a"] })' },
    { code: "app.use(express.raw({ type: 'application/json' }))" },
    { code: 'bodyParser.raw()' },
    { code: 'const sql = row.raw' },
    {
      code: "db('t').whereRaw('JSON_EXTRACT(payload, ?) = ?', [path, value])",
      filename: modelFile,
      options: [
        {
          allowlist: [
            {
              file: 'src/api/v2/models/sample.model.js',
              sql: 'JSON_EXTRACT(payload,   ?) = ?'
            }
          ]
        }
      ]
    }
  ],
  invalid: [
    {
      code: "db.raw('SELECT 1')",
      errors: [{ messageId: 'newRaw' }]
    },
    {
      code: "db('t').whereRaw('a = ' + 'b')",
      errors: [{ messageId: 'newRaw' }]
    },
    {
      code: "db('t')['orderByRaw']('FIELD(id, ?)', [ids])",
      errors: [{ messageId: 'newRaw' }]
    },
    {
      code: 'db.raw(`SELECT * FROM t WHERE id = ${id}`)',
      errors: [{ messageId: 'interpolated' }]
    },
    {
      code: "db('t').whereRaw('id = ' + id)",
      errors: [{ messageId: 'interpolated' }]
    },
    {
      code: 'db.raw(sql)',
      errors: [{ messageId: 'dynamic' }]
    },
    {
      code: "db.raw(parts.join(' '))",
      errors: [{ messageId: 'dynamic' }]
    },
    {
      code: "db('t').whereRaw('id = ?', [id])",
      filename: modelFile,
      options: [
        {
          allowlist: [
            { file: 'src/api/v2/models/other.model.js', sql: 'id = ?' }
          ]
        }
      ],
      errors: [{ messageId: 'newRaw' }]
    },
    {
      code: 'db.raw(`SELECT ${column} FROM t`)',
      filename: modelFile,
      options: [
        {
          allowlist: [
            {
              file: 'src/api/v2/models/sample.model.js',
              sql: 'SELECT ${column} FROM t'
            }
          ]
        }
      ],
      errors: [{ messageId: 'interpolated' }]
    }
  ]
})

const queryInLoop = [{ messageId: 'queryInLoop' }]

tester.run('no-query-in-loop', noQueryInLoop, {
  valid: [
    {
      code: "async function list(ids) { return db('t').whereIn('id', ids) }"
    },
    {
      code: "async function f() { const rows = await db('t'); rows.forEach(row => { row.ok = true }) }"
    },
    {
      code: "async function f(xs) { let q = db('t'); for (const x of xs) { q = q.where('a', x) } return q }"
    },
    {
      code: "async function f(cols) { for (const c of cols) { query.select(db.raw('SUM(??) AS ??', [c, c])) } }"
    },
    {
      code: "async function f(cols) { const list = []; for (const c of cols) { list.push(db.raw('SUM(??) AS ??', [c, c])) } }"
    },
    {
      code: 'async function f(xs) { for (const x of xs) { x.at = trx.fn.now() } }'
    },
    {
      code: 'function f(rows) { rows.forEach(row => { validationModel.check(row) }) }'
    },
    {
      code: 'function f(paths) { for (const p of paths) { const dir = analyticsModel.extractDateDir(p); use(dir) } }'
    },
    {
      code: "async function f() { const [count, page] = await Promise.all([db('t').count(), db('t').limit(10)]); return { count, page } }"
    },
    {
      code: "async function f(xs) { const database = 'tails'; for (const x of xs) { database.concat(x) } }"
    },
    {
      code: "async function f() { for (const row of await db('t')) { row.ok = true } }"
    },
    {
      code: "async function nextProtocol(id) { for (let i = 0; i < 3; i++) { await trx('seq').where('id', id).forUpdate() } }",
      filename: path.join(backend, 'src/services/protocol.service.js'),
      options: [
        {
          allowlist: [
            {
              file: 'src/services/protocol.service.js',
              function: 'nextProtocol',
              query: 'trx("seq").where(\'id\', id).forUpdate()'
            }
          ]
        }
      ]
    }
  ],
  invalid: [
    {
      code: "async function f(ids) { for (const id of ids) { await db('t').where('id', id).first() } }",
      errors: queryInLoop
    },
    {
      code: "async function f() { while (await db('q').first()) { work() } }",
      errors: queryInLoop
    },
    {
      code: "function f(ids) { return Promise.all(ids.map(id => this.dbRead('t').where('id', id))) }",
      errors: queryInLoop
    },
    {
      code: "async function f(xs) { for (const x of xs) { await withRetry(() => dbWrite('t').insert(x)) } }",
      errors: queryInLoop
    },
    {
      code: "async function f(xs) { const reader = runner || this.dbRead; for (const x of xs) { await reader.select('a').where('id', x) } }",
      errors: queryInLoop
    },
    {
      code: "async function f(xs) { for (const x of xs) { await runner('t').where('id', x) } }",
      errors: queryInLoop
    },
    {
      code: "async function f(xs) { const q = db('t'); for (const x of xs) { await q } }",
      errors: queryInLoop
    },
    {
      code: 'async function f(xs) { for (const x of xs) { await userModel.findById(x) } }',
      errors: queryInLoop
    },
    {
      code: 'async function f(xs) { for (const x of xs) { this.auditModel.create(x) } }',
      errors: queryInLoop
    },
    {
      code: 'function f(xs) { return xs.map(x => new TicketModel().list(x)) }',
      errors: queryInLoop
    },
    {
      code: "async function f(ids) { const ps = []; for (const id of ids) { ps.push(db.raw('UPDATE t SET a = 1 WHERE id = ?', [id])) } }",
      errors: queryInLoop
    },
    {
      code: "async function f(xs) { for (const x of xs) { await Promise.all([trx.raw('SELECT 1'), x]) } }",
      errors: queryInLoop
    },
    {
      code: "function f(xs) { _.forEach(xs, x => getDb('read')('t').where('id', x)) }",
      errors: queryInLoop
    },
    {
      code: "async function nextProtocol(id) { for (let i = 0; i < 3; i++) { await trx('seq').where('id', id).forUpdate(); await trx('log').insert({ id }) } }",
      filename: path.join(backend, 'src/services/protocol.service.js'),
      options: [
        {
          allowlist: [
            {
              file: 'src/services/protocol.service.js',
              function: 'nextProtocol',
              query: "trx('seq').where('id', id).forUpdate()"
            }
          ]
        }
      ],
      errors: queryInLoop
    }
  ]
})
