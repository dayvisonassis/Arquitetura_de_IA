import { getRedis, ping } from '../../redis-client'
import { cleanupTestDatabase } from '../utils/test-setup'

type RedisClientModule = typeof import('../../redis-client')

// No service listens on this port, so every connection attempt is refused.
const CLOSED_PORT = '1'

describe('Redis client', () => {
  afterAll(async () => {
    await cleanupTestDatabase()
  })

  it('should authenticate and answer PING on the test Redis', async () => {
    await expect(ping()).resolves.toBe('PONG')
  })

  it('should reuse the open connection on the next PING', async () => {
    await ping()

    await expect(ping()).resolves.toBe('PONG')
  })

  it('getRedis should share one connection between concurrent calls', async () => {
    const [first, second] = await Promise.all([getRedis(), getRedis()])

    expect(first).toBe(second)
    // CLIENT LIST is not counted: it lists every logical database, and the
    // proxy container of ./dev.sh keeps its own connection with the same name.
    await expect(first.clientId()).resolves.toBe(await second.clientId())
  })

  it('getRedis should fail fast when Redis is unreachable', async () => {
    const originalEnv = process.env
    process.env = { ...originalEnv, REDIS_PORT: CLOSED_PORT }
    let isolated: RedisClientModule | undefined
    try {
      await jest.isolateModulesAsync(async () => {
        isolated = await import('../../redis-client')
      })
      const client = isolated as RedisClientModule
      const startedAt = Date.now()

      await expect(client.getRedis()).rejects.toThrow('Redis is not ready')
      expect(Date.now() - startedAt).toBeLessThan(3000)
    } finally {
      process.env = originalEnv
      await isolated?.quit()
    }
  })
})
