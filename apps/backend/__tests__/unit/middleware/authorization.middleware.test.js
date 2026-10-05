jest.mock('../../../src/api/v2/models/domain.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() }
}))

import DomainModel from '../../../src/api/v2/models/domain.model'
import {
  checkPermission,
  requirePlatformAdmin
} from '../../../src/middleware/authorization.middleware'
import { AppError } from '../../../src/utils/app-error.utils'
import { uuidToBin } from '../../../src/utils/uuid.utils'

const DOMAIN_ID = '3e8b2c4a-5d6f-4071-8c1d-2e3f4a5b6c7d'
const OTHER_DOMAIN_ID = '5a1f3c2e-8d4b-4f6a-9b2c-7e1d0f3a6b45'
// Product messages defined by the spec, in Portuguese.
const FORBIDDEN = 'Você não tem permissão para acessar esta página.'
const DOMAIN_REQUIRED = 'Escolha um domínio.'
const DOMAIN_NOT_FOUND = 'Domínio não encontrado.'

describe('authorization.middleware', () => {
  let next

  const buildReq = ({ identityType, permissions, domainHeader, context }) => ({
    identityType,
    permissions,
    get: jest.fn(name =>
      name.toLowerCase() === 'x-domain-id' ? domainHeader : undefined
    ),
    ...context
  })

  const platformReq = domainHeader =>
    buildReq({
      identityType: 'platform',
      permissions: new Set(['users.read']),
      domainHeader,
      context: { domainId: null, domainInBinary: null }
    })

  const domainReq = domainHeader =>
    buildReq({
      identityType: 'domain',
      permissions: new Set(['playground.read', 'users.read']),
      domainHeader,
      context: { domainId: DOMAIN_ID, domainInBinary: uuidToBin(DOMAIN_ID) }
    })

  const expectError = (status, message) => {
    expect(next).toHaveBeenCalledTimes(1)
    const [error] = next.mock.calls[0]
    expect(error).toBeInstanceOf(AppError)
    expect(error.status).toBe(status)
    expect(error.message).toBe(message)
  }

  const expectPassed = () => {
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0]).toHaveLength(0)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    next = jest.fn()
    DomainModel.findById.mockResolvedValue({
      id: DOMAIN_ID,
      name: 'Example Domain',
      status: 'active'
    })
  })

  describe('checkPermission', () => {
    it('should answer 403 when the role lacks the permission', async () => {
      const req = domainReq()
      req.permissions = new Set(['playground.read'])

      await checkPermission('users', 'read')(req, {}, next)

      expectError(403, FORBIDDEN)
      expect(DomainModel.findById).not.toHaveBeenCalled()
    })

    it('should answer 403 when the request has no permission set', async () => {
      const req = buildReq({ identityType: 'domain' })

      await checkPermission('users', 'read')(req, {}, next)

      expectError(403, FORBIDDEN)
    })

    it('should answer 403 to the platform admin without the permission before reading X-Domain-Id', async () => {
      const req = platformReq(DOMAIN_ID)

      await checkPermission('playground', 'read')(req, {}, next)

      expectError(403, FORBIDDEN)
      expect(req.get).not.toHaveBeenCalled()
      expect(DomainModel.findById).not.toHaveBeenCalled()
    })

    it('should ignore X-Domain-Id for domain users', async () => {
      const req = domainReq(OTHER_DOMAIN_ID)

      await checkPermission('users', 'read')(req, {}, next)

      expectPassed()
      expect(DomainModel.findById).not.toHaveBeenCalled()
      expect(req.domainId).toBe(DOMAIN_ID)
      expect(req.domainInBinary.equals(uuidToBin(DOMAIN_ID))).toBe(true)
    })

    it('should require X-Domain-Id for the platform admin on a shared route', async () => {
      const middleware = checkPermission('users', 'read')
      const withoutHeader = platformReq(undefined)
      const withHeader = platformReq(DOMAIN_ID)

      await middleware(withoutHeader, {}, next)
      expectError(400, DOMAIN_REQUIRED)
      expect(withoutHeader.domainId).toBeNull()

      next.mockClear()
      await middleware(withHeader, {}, next)
      expectPassed()
      expect(DomainModel.findById).toHaveBeenCalledTimes(1)
      expect(DomainModel.findById).toHaveBeenCalledWith(DOMAIN_ID)
      expect(withHeader.domainId).toBe(DOMAIN_ID)
    })

    it('should answer 400 for an empty X-Domain-Id', async () => {
      await checkPermission('users', 'read')(platformReq(''), {}, next)

      expectError(400, DOMAIN_REQUIRED)
      expect(DomainModel.findById).not.toHaveBeenCalled()
    })

    it.each([
      ['plain text', 'not-a-uuid'],
      ['the 32-hex form', DOMAIN_ID.replace(/-/g, '')],
      ['the braced form', `{${DOMAIN_ID}}`]
    ])(
      'should answer 404 without a query for an X-Domain-Id in %s',
      async (_case, header) => {
        await checkPermission('users', 'read')(platformReq(header), {}, next)

        expectError(404, DOMAIN_NOT_FOUND)
        expect(DomainModel.findById).not.toHaveBeenCalled()
      }
    )

    it.each([
      ['missing from the copy', null],
      ['removed', { id: DOMAIN_ID, name: 'Example Domain', status: 'removed' }]
    ])('should answer 404 for a domain %s', async (_case, domain) => {
      DomainModel.findById.mockResolvedValue(domain)
      const req = platformReq(DOMAIN_ID)

      await checkPermission('users', 'read')(req, {}, next)

      expectError(404, DOMAIN_NOT_FOUND)
      expect(DomainModel.findById).toHaveBeenCalledWith(DOMAIN_ID)
      expect(req.domainId).toBeNull()
      expect(req.domainInBinary).toBeNull()
    })

    it.each(['active', 'inactive'])(
      'should let the platform admin in with an %s domain and fill the domain context',
      async status => {
        DomainModel.findById.mockResolvedValue({
          id: DOMAIN_ID,
          name: 'Example Domain',
          status
        })
        const req = platformReq(DOMAIN_ID.toUpperCase())

        await checkPermission('users', 'read')(req, {}, next)

        expectPassed()
        expect(DomainModel.findById).toHaveBeenCalledWith(
          DOMAIN_ID.toUpperCase()
        )
        expect(req.domainId).toBe(DOMAIN_ID)
        expect(Buffer.isBuffer(req.domainInBinary)).toBe(true)
        expect(req.domainInBinary.equals(uuidToBin(DOMAIN_ID))).toBe(true)
      }
    )

    it('should pass a domain query failure to next unchanged', async () => {
      const failure = new Error('connect ECONNREFUSED')
      DomainModel.findById.mockRejectedValue(failure)

      await checkPermission('users', 'read')(platformReq(DOMAIN_ID), {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledWith(failure)
    })
  })

  describe('requirePlatformAdmin', () => {
    it('should let the platform admin through', () => {
      requirePlatformAdmin(platformReq(), {}, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0][0]).toBeUndefined()
    })

    it.each([
      ['a domain user', 'domain'],
      ['a request without identity', undefined]
    ])('should answer 403 to %s', (_case, identityType) => {
      requirePlatformAdmin(buildReq({ identityType }), {}, next)

      expectError(403, FORBIDDEN)
    })
  })
})
