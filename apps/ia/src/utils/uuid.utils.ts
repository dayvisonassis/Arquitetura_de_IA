const ACCEPTED_FORMATS = [
  /^[0-9a-f]{32}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i
]

const UUID_BYTES = 16

export const uuidToBin = (value: unknown): Buffer => {
  if (
    typeof value !== 'string' ||
    !ACCEPTED_FORMATS.some(format => format.test(value))
  ) {
    throw new TypeError('Invalid UUID')
  }
  return Buffer.from(value.replace(/[{}-]/g, ''), 'hex')
}

export const binToUuid = (value: Buffer | null): string | null => {
  if (value === null) {
    return null
  }
  if (!Buffer.isBuffer(value) || value.length !== UUID_BYTES) {
    throw new TypeError('Invalid UUID binary')
  }
  const hex = value.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-')
}
