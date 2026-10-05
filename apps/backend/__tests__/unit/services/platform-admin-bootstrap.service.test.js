jest.mock('bcrypt', () => ({ hash: jest.fn() }))
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn() }
}))
jest.mock('../../../src/models/platform-user.model', () => ({
  __esModule: true,
  default: { existsAny: jest.fn(), create: jest.fn() }
}))
jest.mock('../../../src/api/v2/models/user.model', () => ({
  __esModule: true,
  default: { emailExists: jest.fn() }
}))

import bcrypt from 'bcrypt'
import logger from '../../../src/logger'
import PlatformUserModel from '../../../src/models/platform-user.model'
import UserModel from '../../../src/api/v2/models/user.model'
import { ensurePlatformAdmin } from '../../../src/services/platform-admin-bootstrap.service'

const RAW_EMAIL = '  Admin@Example.COM '
const NORMALIZED = 'admin@example.com'
const PASSWORD = 'unit-test-password-123'
const PASSWORD_HASH =
  '$2b$10$hashedvalueforunittestsonly0000000000000000000000000'
const CREATED_ID = '1c6f0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'
// The account name is a product value defined by the spec, in Portuguese.
const PLATFORM_ADMIN_NAME = 'Administrador da plataforma'

describe('platform-admin-bootstrap.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    PlatformUserModel.existsAny.mockResolvedValue(false)
    PlatformUserModel.create.mockResolvedValue(CREATED_ID)
    UserModel.emailExists.mockResolvedValue(false)
    bcrypt.hash.mockResolvedValue(PASSWORD_HASH)
  })

  describe('ensurePlatformAdmin', () => {
    it('should leave everything unchanged when a platform user already exists', async () => {
      PlatformUserModel.existsAny.mockResolvedValue(true)

      const result = await ensurePlatformAdmin({
        email: RAW_EMAIL,
        password: PASSWORD
      })

      expect(result).toEqual({ created: false })
      expect(logger.info).toHaveBeenCalledWith('Platform admin already present')
      expect(UserModel.emailExists).not.toHaveBeenCalled()
      expect(bcrypt.hash).not.toHaveBeenCalled()
      expect(PlatformUserModel.create).not.toHaveBeenCalled()
    })

    it('should refuse an e-mail already used by a domain user and create nothing', async () => {
      UserModel.emailExists.mockResolvedValue(true)

      await expect(
        ensurePlatformAdmin({ email: RAW_EMAIL, password: PASSWORD })
      ).rejects.toThrow(
        new Error('PLATFORM_ADMIN_EMAIL is already used by a domain user')
      )

      expect(UserModel.emailExists).toHaveBeenCalledWith(NORMALIZED)
      expect(bcrypt.hash).not.toHaveBeenCalled()
      expect(PlatformUserModel.create).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })

    it('should create the platform admin with a bcrypt hash of cost 10 and the normalized e-mail', async () => {
      const result = await ensurePlatformAdmin({
        email: RAW_EMAIL,
        password: PASSWORD
      })

      expect(result).toEqual({ created: true, id: CREATED_ID })
      expect(bcrypt.hash).toHaveBeenCalledWith(PASSWORD, 10)
      expect(PlatformUserModel.create).toHaveBeenCalledTimes(1)
      expect(PlatformUserModel.create).toHaveBeenCalledWith({
        name: PLATFORM_ADMIN_NAME,
        email: NORMALIZED,
        passwordHash: PASSWORD_HASH
      })
      expect(logger.info).toHaveBeenCalledWith(
        { platformUserId: CREATED_ID },
        'Platform admin created'
      )
    })

    it('should never log the password nor its hash', async () => {
      await ensurePlatformAdmin({ email: RAW_EMAIL, password: PASSWORD })

      const logged = JSON.stringify(logger.info.mock.calls)
      expect(logged).not.toContain(PASSWORD)
      expect(logged).not.toContain(PASSWORD_HASH)
    })

    it('should create the platform admin once and leave it unchanged on the next start', async () => {
      // First start: empty table; second start: the admin is already there.
      PlatformUserModel.existsAny
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)

      const first = await ensurePlatformAdmin({
        email: RAW_EMAIL,
        password: PASSWORD
      })
      const second = await ensurePlatformAdmin({
        email: RAW_EMAIL,
        password: PASSWORD
      })

      expect(first).toEqual({ created: true, id: CREATED_ID })
      expect(second).toEqual({ created: false })
      expect(PlatformUserModel.create).toHaveBeenCalledTimes(1)
      expect(bcrypt.hash).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenLastCalledWith(
        'Platform admin already present'
      )
    })

    it('should not create the account when hashing fails', async () => {
      bcrypt.hash.mockRejectedValue(new Error('hash failure'))

      await expect(
        ensurePlatformAdmin({ email: RAW_EMAIL, password: PASSWORD })
      ).rejects.toThrow('hash failure')

      expect(PlatformUserModel.create).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })
  })
})
