const path = require('path')

const HANDLES = new Set([
  'db',
  'knex',
  'trx',
  'tx',
  'dbRead',
  'dbWrite',
  'transaction'
])
const GENERIC_HANDLES = new Set([
  'database',
  'runner',
  'reader',
  'writer',
  'executor',
  'connection',
  'conn'
])
const OWNERS = new Set(['self', 'that'])
const KNEX_METHODS = new Set([
  'avg',
  'count',
  'decrement',
  'del',
  'delete',
  'distinct',
  'first',
  'forUpdate',
  'from',
  'groupBy',
  'having',
  'increment',
  'innerJoin',
  'insert',
  'into',
  'join',
  'leftJoin',
  'limit',
  'max',
  'merge',
  'min',
  'offset',
  'onConflict',
  'orderBy',
  'pluck',
  'raw',
  'ref',
  'returning',
  'rightJoin',
  'select',
  'sum',
  'table',
  'truncate',
  'union',
  'update',
  'upsert',
  'where',
  'whereIn',
  'whereNot',
  'whereNotNull',
  'whereNull',
  'with'
])
const ITERATION_METHODS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some'
])
const LODASH_ITERATORS = new Set([
  ...ITERATION_METHODS,
  'each',
  'eachRight',
  'forEachRight',
  'forIn',
  'forOwn',
  'mapKeys',
  'mapValues',
  'times'
])
const LODASH = new Set(['_', 'lodash'])
const PROMISE_METHODS = new Set(['then', 'catch', 'finally'])
const PUSH_METHODS = new Set(['push', 'unshift'])
const QUERY_VERB =
  /^(create|update|delete|remove|destroy|save|insert|upsert|find|get|list|count|fetch|load|query|search|select|exists|sum)/i
const STATEMENT =
  /^\s*(?:(?:--[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(select|insert|update|delete|replace|call|with|set|lock|unlock|truncate|show|create|alter|drop|rename|grant|revoke|analyze|optimize|explain|describe|desc|do|handler|load)\b/i
const MODEL_NAME = /(Model|ModelInstance)$/

const isFunction = node =>
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionDeclaration'

function propertyName(member) {
  if (member.type !== 'MemberExpression') {
    return null
  }
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name
  }
  if (
    member.computed &&
    member.property.type === 'Literal' &&
    typeof member.property.value === 'string'
  ) {
    return member.property.value
  }
  return null
}

function unwrapChain(node) {
  return node.type === 'ChainExpression' ? node.expression : node
}

function outerNode(node) {
  let current = node
  while (current.parent && current.parent.type === 'ChainExpression') {
    current = current.parent
  }
  return current
}

function isOwnerMember(node) {
  return (
    node.type === 'MemberExpression' &&
    (node.object.type === 'ThisExpression' ||
      (node.object.type === 'Identifier' && OWNERS.has(node.object.name)))
  )
}

function isGetDb(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'getDb'
  )
}

function chainRoot(node) {
  let current = unwrapChain(node)
  const members = []
  for (;;) {
    if (current.type === 'CallExpression') {
      if (isGetDb(current)) {
        return { root: current, members }
      }
      current = unwrapChain(current.callee)
    } else if (current.type === 'MemberExpression') {
      if (isOwnerMember(current)) {
        return { root: current, members }
      }
      members.push(current)
      current = unwrapChain(current.object)
    } else {
      return { root: current, members }
    }
  }
}

function usedAsKnex(root) {
  const parent = outerNode(root).parent
  if (!parent) {
    return false
  }
  if (parent.type === 'CallExpression' && unwrapChain(parent.callee) === root) {
    return true
  }
  return (
    parent.type === 'MemberExpression' &&
    parent.object === outerNode(root) &&
    KNEX_METHODS.has(propertyName(parent))
  )
}

function handleName(root) {
  if (root.type === 'Identifier') {
    return root.name
  }
  if (isOwnerMember(root)) {
    return propertyName(root)
  }
  return null
}

function isModelExpression(node) {
  const target = unwrapChain(node)
  if (target.type === 'Identifier') {
    return MODEL_NAME.test(target.name) || target.name === 'model'
  }
  if (isOwnerMember(target)) {
    return MODEL_NAME.test(propertyName(target) || '')
  }
  if (target.type === 'NewExpression') {
    return (
      target.callee.type === 'Identifier' && MODEL_NAME.test(target.callee.name)
    )
  }
  if (target.type === 'LogicalExpression') {
    return isModelExpression(target.left) || isModelExpression(target.right)
  }
  if (target.type === 'ConditionalExpression') {
    return (
      isModelExpression(target.consequent) ||
      isModelExpression(target.alternate)
    )
  }
  return false
}

function iterationCallback(call, child) {
  if (!isFunction(child)) {
    return false
  }
  const callee = unwrapChain(call.callee)
  const name = propertyName(callee)
  if (!name) {
    return false
  }
  const object = callee.object
  if (object.type === 'Identifier' && LODASH.has(object.name)) {
    return LODASH_ITERATORS.has(name) && call.arguments[1] === child
  }
  if (object.type === 'Identifier' && object.name === 'Array') {
    return name === 'from' && call.arguments[1] === child
  }
  return ITERATION_METHODS.has(name) && call.arguments[0] === child
}

function insideLoop(node) {
  let child = node
  let parent = node.parent
  while (parent) {
    switch (parent.type) {
      case 'ForStatement':
        if (
          child === parent.body ||
          child === parent.test ||
          child === parent.update
        ) {
          return true
        }
        break
      case 'ForOfStatement':
      case 'ForInStatement':
        if (child === parent.body) {
          return true
        }
        break
      case 'WhileStatement':
      case 'DoWhileStatement':
        if (child === parent.body || child === parent.test) {
          return true
        }
        break
      case 'CallExpression':
        if (iterationCallback(parent, child)) {
          return true
        }
        break
      default:
        break
    }
    child = parent
    parent = parent.parent
  }
  return false
}

function functionName(node) {
  let current = node.parent
  while (current) {
    if (isFunction(current)) {
      if (current.id) {
        return current.id.name
      }
      const parent = current.parent
      if (
        parent.type === 'VariableDeclarator' &&
        parent.id.type === 'Identifier'
      ) {
        return parent.id.name
      }
      if (
        (parent.type === 'Property' ||
          parent.type === 'MethodDefinition' ||
          parent.type === 'PropertyDefinition') &&
        parent.key.type === 'Identifier'
      ) {
        return parent.key.name
      }
      if (parent.type === 'AssignmentExpression') {
        const name = propertyName(parent.left)
        if (name) {
          return name
        }
        if (parent.left.type === 'Identifier') {
          return parent.left.name
        }
      }
    }
    current = current.parent
  }
  return '<anonymous>'
}

function normalize(code) {
  return code
    .replace(/["`]/g, "'")
    .replace(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g, '$1=>')
    .replace(/;/g, '')
    .replace(/,(\s*[)\]}])/g, '$1')
    .replace(/\s+/g, '')
}

function literalSql(node) {
  if (!node) {
    return null
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map(quasi => quasi.value.cooked).join('')
  }
  return null
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
        'Rejects a database call that runs once per item of a loop (static N+1)'
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
      queryInLoop:
        'Database call inside a loop (N+1) in {{fn}}(): load the items in one query and match them in memory, or add a reviewed entry to tools/data-access-allowlist.json. code: {{code}}'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()
    const options = context.options[0] || {}
    const file = relativeFile(context)
    const allowed = (options.allowlist || []).filter(
      entry => entry.file === file
    )
    const handleVariables = new Set()
    const builderVariables = new Set()
    const calls = []
    const awaits = []

    function isHandleRoot(root) {
      if (isGetDb(root)) {
        return true
      }
      const name = handleName(root)
      if (!name) {
        return false
      }
      if (HANDLES.has(name)) {
        return true
      }
      if (root.type === 'Identifier' && handleVariables.has(name)) {
        return true
      }
      return GENERIC_HANDLES.has(name) && usedAsKnex(root)
    }

    function isHandleExpression(node) {
      const target = unwrapChain(node)
      if (target.type === 'LogicalExpression') {
        return (
          isHandleExpression(target.left) || isHandleExpression(target.right)
        )
      }
      if (target.type === 'ConditionalExpression') {
        return (
          isHandleExpression(target.consequent) ||
          isHandleExpression(target.alternate)
        )
      }
      const { root } = chainRoot(target)
      return isHandleRoot(root)
    }

    function isFragment(node, members) {
      const firstMember = members.at(-1)
      const method = firstMember ? propertyName(firstMember) : null
      if (method !== 'raw' && method !== 'ref') {
        return false
      }
      if (
        unwrapChain(firstMember.parent) !== node &&
        firstMember.parent !== node
      ) {
        return false
      }
      const outer = outerNode(node)
      const parent = outer.parent
      if (
        parent.type === 'CallExpression' &&
        parent.arguments.includes(outer)
      ) {
        if (isHandleExpression(parent)) {
          return true
        }
        const sql = literalSql(node.arguments[0])
        return sql === null || !STATEMENT.test(sql)
      }
      const valuePosition =
        parent.type === 'ArrayExpression' ||
        (parent.type === 'Property' && parent.value === outer) ||
        (parent.type === 'ArrowFunctionExpression' && parent.body === outer)
      if (valuePosition) {
        const sql = literalSql(node.arguments[0])
        return sql === null || !STATEMENT.test(sql)
      }
      return false
    }

    function isComposition(node, root) {
      const parent = outerNode(node).parent
      return (
        root.type === 'Identifier' &&
        parent.type === 'AssignmentExpression' &&
        parent.left.type === 'Identifier' &&
        parent.left.name === root.name
      )
    }

    function isChainTop(node) {
      const outer = outerNode(node)
      const parent = outer.parent
      const continuesAsObject =
        parent.type === 'MemberExpression' && parent.object === outer
      const continuesAsCallee =
        parent.type === 'CallExpression' && parent.callee === outer
      return !continuesAsObject && !continuesAsCallee
    }

    function isHandleQuery(node) {
      if (!isChainTop(node)) {
        return false
      }
      const { root, members } = chainRoot(node)
      if (!isHandleRoot(root)) {
        return false
      }
      if (members.some(member => propertyName(member) === 'fn')) {
        return false
      }
      return !isComposition(node, root) && !isFragment(node, members)
    }

    function modelCallStrength(node) {
      const callee = unwrapChain(node.callee)
      if (
        callee.type !== 'MemberExpression' ||
        !isModelExpression(callee.object)
      ) {
        return null
      }
      const outer = outerNode(node)
      const parent = outer.parent
      if (
        parent.type === 'AwaitExpression' ||
        parent.type === 'ReturnStatement' ||
        parent.type === 'ArrayExpression' ||
        (parent.type === 'ArrowFunctionExpression' && parent.body === outer) ||
        (parent.type === 'MemberExpression' &&
          parent.object === outer &&
          PROMISE_METHODS.has(propertyName(parent))) ||
        (parent.type === 'CallExpression' &&
          parent.arguments.includes(outer) &&
          PUSH_METHODS.has(propertyName(unwrapChain(parent.callee))))
      ) {
        return 'strong'
      }
      const weak =
        parent.type === 'ExpressionStatement' ||
        parent.type === 'LogicalExpression' ||
        parent.type === 'ConditionalExpression' ||
        (parent.type === 'CallExpression' &&
          parent.arguments.includes(outer) &&
          outerNode(parent).parent.type === 'AwaitExpression')
      return weak ? 'weak' : null
    }

    function isModelQuery(node) {
      const strength = modelCallStrength(node)
      if (strength === 'strong') {
        return true
      }
      return (
        strength === 'weak' &&
        QUERY_VERB.test(propertyName(unwrapChain(node.callee)) || '')
      )
    }

    function report(node) {
      const fn = functionName(node)
      const code = normalize(sourceCode.getText(node))
      const exempt = allowed.some(
        entry =>
          entry.function === fn &&
          entry.function !== '<anonymous>' &&
          typeof entry.query === 'string' &&
          normalize(entry.query) === code
      )
      if (!exempt) {
        context.report({ node, messageId: 'queryInLoop', data: { fn, code } })
      }
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !node.init) {
          return
        }
        const init = unwrapChain(node.init)
        if (init.type === 'AwaitExpression') {
          return
        }
        if (isHandleExpression(init)) {
          handleVariables.add(node.id.name)
          if (init.type === 'CallExpression') {
            builderVariables.add(node.id.name)
          }
        }
      },
      CallExpression(node) {
        calls.push(node)
      },
      AwaitExpression(node) {
        awaits.push(node)
      },
      'Program:exit'() {
        const reported = new Set()
        for (const node of calls) {
          if (!insideLoop(node)) {
            continue
          }
          if (isHandleQuery(node) || isModelQuery(node)) {
            reported.add(node)
            report(node)
          }
        }
        for (const node of awaits) {
          const argument = unwrapChain(node.argument)
          if (
            argument.type === 'Identifier' &&
            builderVariables.has(argument.name) &&
            insideLoop(node)
          ) {
            report(node)
          }
        }
      }
    }
  }
}
