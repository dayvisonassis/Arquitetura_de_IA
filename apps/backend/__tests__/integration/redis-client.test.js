const { getClient, ping, quit } = require('../../redis-client')
const { cleanupTestDatabase } = require('../utils/test-setup')

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

  describe('getClient', () => {
    beforeEach(async () => {
      // Start each case without a client, as on the first call of a process.
      await quit()
    })

    it('should connect on demand and return a ready client', async () => {
      const client = await getClient()

      expect(client.isOpen).toBe(true)
      expect(client.isReady).toBe(true)
      await expect(client.ping()).resolves.toBe('PONG')
    })

    it('should resolve concurrent calls to the same client', async () => {
      const clients = await Promise.all([getClient(), getClient(), getClient()])

      expect(clients[1]).toBe(clients[0])
      expect(clients[2]).toBe(clients[0])
      expect(clients[0].isReady).toBe(true)
    })

    it('should return the ready client on later calls', async () => {
      const first = await getClient()

      const second = await getClient()

      expect(second).toBe(first)
      expect(second.isReady).toBe(true)
    })

    it('should open a new client after quit', async () => {
      const first = await getClient()
      await quit()

      const second = await getClient()

      expect(first.isOpen).toBe(false)
      expect(second).not.toBe(first)
      await expect(second.ping()).resolves.toBe('PONG')
    })
  })
})
