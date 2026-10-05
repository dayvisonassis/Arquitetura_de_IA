jest.mock('../../../../../database', () => ({ getDb: jest.fn() }))

import db from '../../../../../database'
import DomainModel from '../../../../../src/api/v2/models/domain.model'
import { uuidToBin } from '../../../../../src/utils/uuid.utils'

const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'

// A new builder per knex call; `then` is bound to a real promise (rule PA3).
const createMockQueryBuilder = ({ row } = {}) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row)
  }
  const promise = Promise.resolve([])
  qb.then = promise.then.bind(promise)
  qb.catch = promise.catch.bind(promise)
  return qb
}

const domainRow = () => ({
  id: uuidToBin(DOMAIN_ID),
  name: 'Example Domain',
  status: 'inactive'
})

describe('domain.model', () => {
  let builders

  // Each call returns a new knex-like function that builds a new builder.
  const createKnex = options =>
    jest.fn(() => {
      const qb = createMockQueryBuilder(options)
      builders.push(qb)
      return qb
    })

  const useDb = options => {
    db.getDb.mockImplementation(() => createKnex(options))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    builders = []
    useDb()
  })

  describe('findById', () => {
    it('should return the mapped domain read with the read handle', async () => {
      useDb({ row: domainRow() })

      const domain = await DomainModel.findById(DOMAIN_ID)

      expect(domain).toEqual({
        id: DOMAIN_ID,
        name: 'Example Domain',
        status: 'inactive'
      })
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith('dr_domain')
      expect(builders[0].select).toHaveBeenCalledWith('id', 'name', 'status')
      expect(builders[0].where).toHaveBeenCalledWith('id', uuidToBin(DOMAIN_ID))
      expect(builders[0].first).toHaveBeenCalledTimes(1)
    })

    it('should return null when the domain does not exist', async () => {
      useDb({ row: undefined })

      await expect(DomainModel.findById(DOMAIN_ID)).resolves.toBeNull()
    })

    it('should read through the given transaction', async () => {
      const trx = createKnex({ row: domainRow() })

      const domain = await DomainModel.findById(DOMAIN_ID, trx)

      expect(domain.id).toBe(DOMAIN_ID)
      expect(db.getDb).not.toHaveBeenCalled()
      expect(trx).toHaveBeenCalledWith('dr_domain')
    })

    it('should reject an invalid domain id', async () => {
      await expect(DomainModel.findById('not-a-uuid')).rejects.toThrow(
        new TypeError('Invalid UUID')
      )
      expect(builders[0].first).not.toHaveBeenCalled()
    })
  })
})
