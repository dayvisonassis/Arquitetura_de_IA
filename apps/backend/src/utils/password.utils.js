const BCRYPT_COST = 10
const MIN_LENGTH = 10
const MAX_LENGTH = 64
const MAX_BYTES = 72

const RULE_MESSAGES = Object.freeze({
  min_length: `must have at least ${MIN_LENGTH} characters`,
  max_length: `must have at most ${MAX_LENGTH} characters`,
  max_bytes: `must have at most ${MAX_BYTES} bytes in UTF-8`
})

const validatePassword = password => {
  if (typeof password !== 'string') {
    return { valid: false, rule: 'min_length' }
  }
  const length = [...password].length
  if (length < MIN_LENGTH) {
    return { valid: false, rule: 'min_length' }
  }
  if (length > MAX_LENGTH) {
    return { valid: false, rule: 'max_length' }
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return { valid: false, rule: 'max_bytes' }
  }
  return { valid: true }
}

module.exports = { BCRYPT_COST, RULE_MESSAGES, validatePassword }
