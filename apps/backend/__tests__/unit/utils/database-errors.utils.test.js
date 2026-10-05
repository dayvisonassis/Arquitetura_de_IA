import { isDatabaseUnavailable } from '../../../src/utils/database-errors.utils'

const errorWith = fields => Object.assign(new Error('database error'), fields)

describe('database-errors.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isDatabaseUnavailable', () => {
    it('should recognize the knex pool timeout', () => {
      expect(
        isDatabaseUnavailable(errorWith({ name: 'KnexTimeoutError' }))
      ).toBe(true)
    })

    it.each([
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'PROTOCOL_CONNECTION_LOST',
      'PROTOCOL_SEQUENCE_TIMEOUT'
    ])('should recognize the connection code %s', code => {
      expect(isDatabaseUnavailable(errorWith({ code }))).toBe(true)
    })

    it('should recognize a fatal mysql2 error', () => {
      expect(isDatabaseUnavailable(errorWith({ fatal: true }))).toBe(true)
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['false', false],
      ['an empty string', '']
    ])('should return false for %s', (_case, value) => {
      expect(isDatabaseUnavailable(value)).toBe(false)
    })

    it('should return false for an ordinary error', () => {
      expect(isDatabaseUnavailable(new Error('boom'))).toBe(false)
    })

    it('should return false for a query error that keeps the connection', () => {
      expect(
        isDatabaseUnavailable(errorWith({ code: 'ER_DUP_ENTRY', fatal: false }))
      ).toBe(false)
    })

    it('should require fatal to be exactly true', () => {
      expect(isDatabaseUnavailable(errorWith({ fatal: 'true' }))).toBe(false)
    })
  })
})
