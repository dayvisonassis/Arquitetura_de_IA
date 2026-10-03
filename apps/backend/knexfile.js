const { config } = require('./src/config/env')

const useUtc = (connection, done) => {
  connection.query("SET time_zone = '+00:00'", error => done(error, connection))
}

module.exports = {
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    timezone: 'Z'
  },
  pool: { min: 0, max: 10, afterCreate: useUtc },
  migrations: { directory: 'migrations', tableName: 'knex_migrations' },
  seeds: { directory: 'data/seeds' }
}
