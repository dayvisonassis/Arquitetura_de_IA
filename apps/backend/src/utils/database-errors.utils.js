const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT'
])

export const isDatabaseUnavailable = error =>
  Boolean(error) &&
  (error.name === 'KnexTimeoutError' ||
    CONNECTION_CODES.has(error.code) ||
    error.fatal === true)
