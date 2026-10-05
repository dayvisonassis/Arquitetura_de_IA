jest.mock('../../../src/models/platform-user.model', () => ({
  __esModule: true,
  default: { emailExists: jest.fn() }
}))
jest.mock('../../../src/api/v2/models/user.model', () => ({
  __esModule: true,
  default: { emailExists: jest.fn() }
}))

import PlatformUserModel from '../../../src/models/platform-user.model'
import UserModel from '../../../src/api/v2/models/user.model'
import { isEmailTaken } from '../../../src/services/email-availability.service'

const NORMALIZED = 'someone@example.com'

describe('email-availability.service', () => {
  const trx = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    PlatformUserModel.emailExists.mockResolvedValue(false)
    UserModel.emailExists.mockResolvedValue(false)
  })

  describe('isEmailTaken', () => {
    it('should check the normalized e-mail in both identities with the given transaction', async () => {
      await isEmailTaken('  SomeOne@Example.COM ', { trx })

      expect(PlatformUserModel.emailExists).toHaveBeenCalledTimes(1)
      expect(PlatformUserModel.emailExists).toHaveBeenCalledWith(
        NORMALIZED,
        trx
      )
      expect(UserModel.emailExists).toHaveBeenCalledTimes(1)
      expect(UserModel.emailExists).toHaveBeenCalledWith(NORMALIZED, trx)
    })

    it.each([
      ['only a platform user has it', true, false],
      ['only a domain user has it', false, true],
      ['both identities have it', true, true]
    ])(
      'should report the e-mail as taken when %s',
      async (_case, inPlatform, inDomains) => {
        PlatformUserModel.emailExists.mockResolvedValue(inPlatform)
        UserModel.emailExists.mockResolvedValue(inDomains)

        await expect(isEmailTaken(NORMALIZED, { trx })).resolves.toBe(true)
      }
    )

    it('should report the e-mail as free when no identity has it', async () => {
      await expect(isEmailTaken(NORMALIZED, { trx })).resolves.toBe(false)
    })

    it('should query without a transaction when no options are given', async () => {
      await isEmailTaken(NORMALIZED)

      expect(PlatformUserModel.emailExists).toHaveBeenCalledWith(
        NORMALIZED,
        undefined
      )
      expect(UserModel.emailExists).toHaveBeenCalledWith(NORMALIZED, undefined)
    })

    it('should propagate a database failure', async () => {
      UserModel.emailExists.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(isEmailTaken(NORMALIZED, { trx })).rejects.toThrow(
        'ECONNREFUSED'
      )
    })
  })
})
