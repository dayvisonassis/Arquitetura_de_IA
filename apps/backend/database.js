const knex = require('knex')
const knexConfig = require('./knexfile')

const OPERATIONS = ['read', 'write']

let instances = null

const getInstances = () => {
  if (!instances) {
    instances = { read: knex(knexConfig), write: knex(knexConfig) }
  }
  return instances
}

const getDb = (operation = 'write') => {
  const name =
    operation !== null && typeof operation === 'object'
      ? (operation.operation ?? 'write')
      : operation
  if (!OPERATIONS.includes(name)) {
    throw new TypeError('Invalid database operation')
  }
  return getInstances()[name]
}

const destroy = async () => {
  if (!instances) {
    return
  }
  const { read, write } = instances
  instances = null
  await Promise.all([read.destroy(), write.destroy()])
}

module.exports = {
  get dbRead() {
    return getInstances().read
  },
  get dbWrite() {
    return getInstances().write
  },
  getDb,
  destroy
}
