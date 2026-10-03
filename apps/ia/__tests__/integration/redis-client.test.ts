import { ping } from '../../redis-client'
import { cleanupTestDatabase } from '../utils/test-setup'

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
})
