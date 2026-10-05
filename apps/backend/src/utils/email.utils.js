const MAX_LENGTH = 254
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = email =>
  typeof email === 'string' ? email.trim().toLowerCase() : ''

const isValidEmail = email => {
  const normalized = normalizeEmail(email)
  return normalized.length <= MAX_LENGTH && EMAIL_FORMAT.test(normalized)
}

module.exports = { isValidEmail, normalizeEmail }
