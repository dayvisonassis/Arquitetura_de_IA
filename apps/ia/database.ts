import knex, { type Knex } from 'knex'
import knexConfig from './knexfile'

type Operation = 'read' | 'write'

const OPERATIONS: Operation[] = ['read', 'write']

let instances: Record<Operation, Knex> | null = null

const getInstances = (): Record<Operation, Knex> => {
  if (!instances) {
    instances = { read: knex(knexConfig), write: knex(knexConfig) }
  }
  return instances
}

export const getDb = (
  operation: Operation | { operation?: Operation } = 'write'
): Knex => {
  const name =
    typeof operation === 'object' && operation !== null
      ? (operation.operation ?? 'write')
      : operation
  if (!OPERATIONS.includes(name)) {
    throw new TypeError('Invalid database operation')
  }
  return getInstances()[name]
}

export const destroy = async (): Promise<void> => {
  if (!instances) {
    return
  }
  const { read, write } = instances
  instances = null
  await Promise.all([read.destroy(), write.destroy()])
}
