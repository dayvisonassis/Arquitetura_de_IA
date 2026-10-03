const path = require('path')

const RAW_METHODS = new Set([
  'raw',
  'whereRaw',
  'andWhereRaw',
  'orWhereRaw',
  'havingRaw',
  'andHavingRaw',
  'orHavingRaw',
  'orderByRaw',
  'groupByRaw',
  'joinRaw',
  'fromRaw'
])

const collapse = sql => sql.replace(/\s+/g, ' ').trim()

function methodName(callee) {
  if (callee.type !== 'MemberExpression') {
    return null
  }
  if (!callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name
  }
  if (
    callee.computed &&
    callee.property.type === 'Literal' &&
    typeof callee.property.value === 'string'
  ) {
    return callee.property.value
  }
  return null
}

function literalSql(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = literalSql(node.left)
    const right = literalSql(node.right)
    return left !== null && right !== null ? left + right : null
  }
  return null
}

function isInterpolated(node) {
  if (node.type === 'TemplateLiteral') {
    return node.expressions.length > 0
  }
  return (
    node.type === 'BinaryExpression' &&
    node.operator === '+' &&
    literalSql(node) === null
  )
}

function isNotKnex(node, method) {
  const object = node.callee.object
  if (object.type === 'Identifier' && object.name === 'String') {
    return true
  }
  const [first] = node.arguments
  return method === 'raw' && (!first || first.type === 'ObjectExpression')
}

function relativeFile(context) {
  const cwd = context.cwd ?? context.getCwd()
  const filename = context.filename ?? context.getFilename()
  return path.relative(cwd, filename).split(path.sep).join('/')
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Rejects new knex raw SQL; interpolated or dynamic SQL is never accepted'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: { type: 'array', items: { type: 'object' } }
        },
        additionalProperties: false
      }
    ],
    messages: {
      interpolated:
        'Raw SQL built by interpolation in {{method}}(): pass values as bindings (? for values, ?? for identifiers). Interpolated SQL can never be allowlisted.',
      dynamic:
        'Raw SQL arrives in a variable or an expression in {{method}}(): write the SQL as a literal at the call. Dynamic SQL can never be allowlisted.',
      newRaw:
        'New raw SQL in {{method}}(): use the query builder, or add a reviewed entry to tools/data-access-allowlist.json with sql "{{sql}}".'
    }
  },
  create(context) {
    const options = context.options[0] || {}
    const file = relativeFile(context)
    const allowed = new Set(
      (options.allowlist || [])
        .filter(entry => entry.file === file && typeof entry.sql === 'string')
        .map(entry => collapse(entry.sql))
    )
    return {
      CallExpression(node) {
        const method = methodName(node.callee)
        if (!method || !RAW_METHODS.has(method) || isNotKnex(node, method)) {
          return
        }
        const [first] = node.arguments
        if (!first) {
          return
        }
        if (isInterpolated(first)) {
          context.report({ node, messageId: 'interpolated', data: { method } })
          return
        }
        const sql = literalSql(first)
        if (sql === null) {
          context.report({ node, messageId: 'dynamic', data: { method } })
          return
        }
        if (!allowed.has(collapse(sql))) {
          context.report({
            node,
            messageId: 'newRaw',
            data: { method, sql: collapse(sql) }
          })
        }
      }
    }
  }
}
