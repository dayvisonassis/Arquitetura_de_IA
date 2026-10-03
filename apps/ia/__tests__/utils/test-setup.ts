import { destroy, getDb } from '../../database'
import { quit } from '../../redis-client'

export const setupTestDatabase = async () => ({ db: { getDb } })

export const cleanupTestDatabase = async (): Promise<void> => {
  await Promise.all([destroy(), quit()])
}
