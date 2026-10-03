import { binToUuid, uuidToBin } from '../../../src/utils/uuid.utils'

const CANONICAL = '4bf92f35-77b3-4da6-a3ce-929d0e0e4736'

describe('uuid.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('uuidToBin', () => {
    it.each([
      ['32 hex digits', '4bf92f3577b34da6a3ce929d0e0e4736'],
      ['8-4-4-4-12', CANONICAL],
      ['{8-4-4-4-12}', `{${CANONICAL}}`],
      ['upper case', CANONICAL.toUpperCase()]
    ])('should convert the %s format to 16 bytes', (_format, value) => {
      const binary = uuidToBin(value)

      expect(Buffer.isBuffer(binary)).toBe(true)
      expect(binary).toHaveLength(16)
      expect(binary.toString('hex')).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
    })

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
      ['an object', {}],
      ['31 hex digits', '4bf92f3577b34da6a3ce929d0e0e473'],
      ['a non hex character', 'zbf92f35-77b3-4da6-a3ce-929d0e0e4736'],
      ['misplaced hyphens', '4bf92f3577b3-4da6-a3ce-929d-0e0e4736'],
      ['an unclosed brace', `{${CANONICAL}`]
    ])(
      'uuidToBin should reject null, undefined and malformed input without echoing it (%s)',
      (_case, value) => {
        expect(() => uuidToBin(value)).toThrow(new TypeError('Invalid UUID'))
      }
    )
  })

  describe('binToUuid', () => {
    it('uuidToBin/binToUuid should round-trip the three accepted formats', () => {
      for (const value of [
        CANONICAL.replace(/-/g, ''),
        CANONICAL.toUpperCase(),
        `{${CANONICAL}}`
      ]) {
        expect(binToUuid(uuidToBin(value))).toBe(CANONICAL)
      }
    })

    it('should return null for null', () => {
      expect(binToUuid(null)).toBeNull()
    })

    it.each([
      ['a 15-byte buffer', Buffer.alloc(15)],
      ['a 17-byte buffer', Buffer.alloc(17)],
      ['a string', CANONICAL],
      ['undefined', undefined]
    ])('should reject %s', (_case, value) => {
      expect(() => binToUuid(value as Buffer)).toThrow(
        new TypeError('Invalid UUID binary')
      )
    })
  })
})
