const {
  isValidEmail,
  normalizeEmail
} = require('../../../src/utils/email.utils')

const DOMAIN = '@example.test'
const emailOfLength = length => `${'a'.repeat(length - DOMAIN.length)}${DOMAIN}`

describe('email.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('normalizeEmail', () => {
    it('should trim and lowercase the e-mail', () => {
      expect(normalizeEmail('  Admin@Example.TEST \t')).toBe(
        'admin@example.test'
      )
    })

    it('should keep an already normalized e-mail', () => {
      expect(normalizeEmail('user@example.test')).toBe('user@example.test')
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 42],
      ['an object', { email: 'user@example.test' }]
    ])('should return an empty string for %s', (_case, value) => {
      expect(normalizeEmail(value)).toBe('')
    })
  })

  describe('isValidEmail', () => {
    it.each([
      ['a plain e-mail', 'user@example.test'],
      ['subdomains and tags', 'first.last+tag@mail.example.co'],
      ['surrounding spaces and upper case', '  USER@Example.Test  ']
    ])('should accept %s', (_case, value) => {
      expect(isValidEmail(value)).toBe(true)
    })

    it.each([
      ['an empty string', ''],
      ['only spaces', '   '],
      ['no at sign', 'user.example.test'],
      ['no local part', '@example.test'],
      ['no top-level domain', 'user@example'],
      ['two at signs', 'user@@example.test'],
      ['an inner space', 'us er@example.test'],
      ['an empty domain label', 'user@.test']
    ])('should reject %s', (_case, value) => {
      expect(isValidEmail(value)).toBe(false)
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 42]
    ])('should reject %s', (_case, value) => {
      expect(isValidEmail(value)).toBe(false)
    })

    it('should accept 254 characters and reject 255', () => {
      expect(isValidEmail(emailOfLength(254))).toBe(true)
      expect(isValidEmail(emailOfLength(255))).toBe(false)
    })

    it('should measure the length after normalizing', () => {
      expect(isValidEmail(`  ${emailOfLength(254)}  `)).toBe(true)
    })
  })
})
