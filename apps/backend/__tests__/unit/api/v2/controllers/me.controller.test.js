import { show } from '../../../../../src/api/v2/controllers/me.controller'

const PLATFORM_USER_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
const USER_ID = '2d7a1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c'
const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'

describe('me.controller', () => {
  let res

  beforeEach(() => {
    jest.clearAllMocks()
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
  })

  describe('show', () => {
    it('should answer 200 with the current user and the permissions in alphabetical order', () => {
      const currentUser = {
        id: USER_ID,
        name: 'Domain Admin',
        email: 'domain.admin@example.com',
        role: 'domain_admin',
        domain: { id: DOMAIN_ID, name: 'Example Domain' }
      }
      const req = {
        currentUser,
        permissions: new Set(['users.read', 'playground.read'])
      }

      show(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        ...currentUser,
        permissions: ['playground.read', 'users.read']
      })
    })

    it('should answer the platform admin with a null domain', () => {
      const req = {
        currentUser: {
          id: PLATFORM_USER_ID,
          name: 'Platform Admin',
          email: 'admin@example.com',
          role: 'platform_admin',
          domain: null
        },
        permissions: new Set(['users.read'])
      }

      show(req, res)

      expect(res.json).toHaveBeenCalledWith({
        id: PLATFORM_USER_ID,
        name: 'Platform Admin',
        email: 'admin@example.com',
        role: 'platform_admin',
        domain: null,
        permissions: ['users.read']
      })
    })

    it('should answer an empty permission list for a role without permissions', () => {
      const req = {
        currentUser: { id: USER_ID, role: 'user' },
        permissions: new Set()
      }

      show(req, res)

      expect(res.json).toHaveBeenCalledWith({
        id: USER_ID,
        role: 'user',
        permissions: []
      })
    })

    it('should not change the permission set of the request', () => {
      const permissions = new Set(['users.read', 'playground.read'])
      const req = { currentUser: { id: USER_ID }, permissions }

      show(req, res)

      expect([...permissions]).toEqual(['users.read', 'playground.read'])
    })
  })
})
