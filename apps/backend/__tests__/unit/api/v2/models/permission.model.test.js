jest.mock('../../../../../database', () => ({ getDb: jest.fn() }))

import db from '../../../../../database'
import PermissionModel from '../../../../../src/api/v2/models/permission.model'

// A new builder per knex call; `then` is bound to a real promise (rule PA3).
const createMockQueryBuilder = ({ result = [] } = {}) => {
  const qb = {
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis()
  }
  const promise = Promise.resolve(result)
  qb.then = promise.then.bind(promise)
  qb.catch = promise.catch.bind(promise)
  return qb
}

describe('permission.model', () => {
  let builders

  const useDb = options => {
    db.getDb.mockImplementation(() =>
      jest.fn(() => {
        const qb = createMockQueryBuilder(options)
        builders.push(qb)
        return qb
      })
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    builders = []
    useDb()
  })

  describe('findByRole', () => {
    it('should return the permissions of the role as area.action strings', async () => {
      useDb({
        result: [
          { area: 'dashboard', action: 'read' },
          { area: 'users', action: 'create' },
          { area: 'users', action: 'read' }
        ]
      })

      const permissions = await PermissionModel.findByRole('admin')

      expect(permissions).toEqual([
        'dashboard.read',
        'users.create',
        'users.read'
      ])
    })

    it('should join the role mapping with the permissions, filter and order', async () => {
      await PermissionModel.findByRole('user')

      expect(db.getDb).toHaveBeenCalledTimes(1)
      expect(db.getDb).toHaveBeenCalledWith({ operation: 'read' })
      expect(db.getDb.mock.results[0].value).toHaveBeenCalledWith(
        'role_permissions as rp'
      )
      const qb = builders[0]
      expect(qb.join).toHaveBeenCalledWith(
        'permissions as p',
        'p.id',
        'rp.permission_id'
      )
      expect(qb.select).toHaveBeenCalledWith('p.area', 'p.action')
      expect(qb.where).toHaveBeenCalledWith('rp.role', 'user')
      expect(qb.orderBy).toHaveBeenCalledWith([
        { column: 'p.area', order: 'asc' },
        { column: 'p.action', order: 'asc' }
      ])
    })

    it('should return an empty list for a role without permissions', async () => {
      await expect(PermissionModel.findByRole('unknown')).resolves.toEqual([])
    })
  })
})
