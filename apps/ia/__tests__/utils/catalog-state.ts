import { getDb } from '../../database'
import { getRedis } from '../../redis-client'

// Removes every suspension row and every catalog:* key of the test Redis.
export const resetCatalogState = async (): Promise<void> => {
  const redis = await getRedis()
  await getDb({ operation: 'write' })('catalog_suspensions').del()
  const keys = await redis.keys('catalog:*')
  if (keys.length > 0) {
    await redis.del(keys)
  }
}

export const suspensionRows = (resourceName: string) =>
  getDb({ operation: 'read' })('catalog_suspensions').where({
    resource_name: resourceName
  })
