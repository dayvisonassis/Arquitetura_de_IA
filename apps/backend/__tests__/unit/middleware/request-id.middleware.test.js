import {
  isValidRequestId,
  requestId
} from '../../../src/middleware/request-id.middleware'

const TRACE_ID = /^[0-9a-f]{32}$/
const VALID_ID = '4bf92f3577b34da6a3ce929d0e0e4736'

const createReq = headers => ({
  get: jest.fn(name => headers[name.toLowerCase()])
})

describe('request-id.middleware', () => {
  let res
  let next

  beforeEach(() => {
    jest.clearAllMocks()
    res = { setHeader: jest.fn() }
    next = jest.fn()
  })

  it('should echo a valid incoming x-request-id', () => {
    const req = createReq({ 'x-request-id': VALID_ID })

    requestId(req, res, next)

    expect(req.id).toBe(VALID_ID)
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', VALID_ID)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['upper case', VALID_ID.toUpperCase()],
    ['31 characters', VALID_ID.slice(1)],
    ['only zeros', '0'.repeat(32)],
    ['absent', undefined]
  ])('should replace an invalid x-request-id (%s)', (_case, incoming) => {
    const req = createReq({ 'x-request-id': incoming })

    requestId(req, res, next)

    expect(req.id).toMatch(TRACE_ID)
    expect(req.id).not.toBe(incoming)
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.id)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should set the header before calling next', () => {
    const req = createReq({})
    next.mockImplementation(() => {
      expect(res.setHeader).toHaveBeenCalled()
    })

    requestId(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each([
    [VALID_ID, true],
    ['0'.repeat(32), false],
    [`${VALID_ID}0`, false],
    ['g'.repeat(32), false],
    [42, false],
    [null, false]
  ])('isValidRequestId(%p) should be %p', (value, expected) => {
    expect(isValidRequestId(value)).toBe(expected)
  })
})
