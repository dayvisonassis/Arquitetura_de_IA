const db = require('../../database')

// Counts every statement that runs on the backend knex instances while fn runs.
async function countQueries(fn) {
  const queries = []
  const listener = query => queries.push(query.sql)
  const instances = [db.dbRead, db.dbWrite]
  instances.forEach(instance => instance.on('query', listener))
  try {
    const result = await fn()
    return { count: queries.length, queries, result }
  } finally {
    instances.forEach(instance => instance.removeListener('query', listener))
  }
}

module.exports = { countQueries }
