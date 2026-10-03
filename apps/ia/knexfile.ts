import type { Knex } from 'knex'
import { config } from './src/config/env'

type PoolConnection = {
  query: (sql: string, callback: (error: Error | null) => void) => void
}

const useUtc = (
  connection: PoolConnection,
  done: (error: Error | null, connection: PoolConnection) => void
): void => {
  connection.query("SET time_zone = '+00:00'", error => done(error, connection))
}

const knexConfig: Knex.Config = {
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
  migrations: {
    directory: 'migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
    loadExtensions: ['.ts']
  },
  seeds: { directory: 'data/seeds', extension: 'ts', loadExtensions: ['.ts'] }
}

export default knexConfig
