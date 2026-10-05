const {
  RULE_MESSAGES,
  validatePassword
} = require('../../../src/utils/password.utils')

const EMOJI = '\u{1F600}'

describe('password.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('validatePassword', () => {
    it.each([
      ['10 characters', 'a'.repeat(10)],
      ['64 characters', 'a'.repeat(64)]
    ])('should accept a password of %s', (_case, password) => {
      expect(validatePassword(password)).toEqual({ valid: true })
    })

    it.each([
      ['9 characters', 'a'.repeat(9)],
      ['an empty string', '']
    ])('should reject a password of %s as min_length', (_case, password) => {
      expect(validatePassword(password)).toEqual({
        valid: false,
        rule: 'min_length'
      })
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 1234567890],
      ['an object', { length: 12 }]
    ])('should reject %s as min_length', (_case, password) => {
      expect(validatePassword(password)).toEqual({
        valid: false,
        rule: 'min_length'
      })
    })

    it('should reject a password of 65 characters as max_length', () => {
      expect(validatePassword('a'.repeat(65))).toEqual({
        valid: false,
        rule: 'max_length'
      })
    })

    it('should report max_length before max_bytes', () => {
      // 65 characters and 130 bytes break both rules.
      expect(validatePassword('ç'.repeat(65))).toEqual({
        valid: false,
        rule: 'max_length'
      })
    })

    it('should reject a password of 64 characters or less over 72 bytes', () => {
      const password = 'ç'.repeat(40)

      expect(Buffer.byteLength(password, 'utf8')).toBe(80)
      expect(validatePassword(password)).toEqual({
        valid: false,
        rule: 'max_bytes'
      })
    })

    it('should accept exactly 72 bytes and reject 74 bytes', () => {
      expect(validatePassword('ç'.repeat(36))).toEqual({ valid: true })
      expect(validatePassword('ç'.repeat(37))).toEqual({
        valid: false,
        rule: 'max_bytes'
      })
    })

    it('should count characters as code points', () => {
      const ten = EMOJI.repeat(10)
      const nine = EMOJI.repeat(9)

      // Each emoji is two UTF-16 units and four UTF-8 bytes.
      expect(ten).toHaveLength(20)
      expect([...ten]).toHaveLength(10)
      expect(validatePassword(ten)).toEqual({ valid: true })
      expect(nine).toHaveLength(18)
      expect(validatePassword(nine)).toEqual({
        valid: false,
        rule: 'min_length'
      })
    })
  })

  describe('RULE_MESSAGES', () => {
    it('should describe each rule', () => {
      expect(RULE_MESSAGES).toEqual({
        min_length: 'must have at least 10 characters',
        max_length: 'must have at most 64 characters',
        max_bytes: 'must have at most 72 bytes in UTF-8'
      })
    })

    it('should be frozen', () => {
      expect(Object.isFrozen(RULE_MESSAGES)).toBe(true)
    })
  })
})
