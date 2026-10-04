import { wait } from '../../../src/lib/wait'

// Tracks whether a promise has settled without awaiting it.
const track = (promise: Promise<void>): { settled: () => boolean } => {
  let done = false
  promise.then(() => {
    done = true
  })
  return { settled: () => done }
}

describe('wait', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should resolve only after the requested milliseconds', async () => {
    const controller = new AbortController()

    const waiting = track(wait(15000, controller.signal))

    await jest.advanceTimersByTimeAsync(14999)
    expect(waiting.settled()).toBe(false)

    await jest.advanceTimersByTimeAsync(1)
    expect(waiting.settled()).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('should resolve with undefined', async () => {
    const promise = wait(10, new AbortController().signal)

    await jest.advanceTimersByTimeAsync(10)

    await expect(promise).resolves.toBeUndefined()
  })

  it('should resolve at once, without a timer, when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const addListener = jest.spyOn(controller.signal, 'addEventListener')

    const waiting = track(wait(15000, controller.signal))
    await Promise.resolve()

    expect(waiting.settled()).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
    expect(addListener).not.toHaveBeenCalled()
  })

  it('should resolve early, without an error, and clear the timer when the signal aborts', async () => {
    const controller = new AbortController()
    const promise = wait(15000, controller.signal)
    const waiting = track(promise)
    await jest.advanceTimersByTimeAsync(5000)
    expect(waiting.settled()).toBe(false)
    expect(jest.getTimerCount()).toBe(1)

    controller.abort()

    await expect(promise).resolves.toBeUndefined()
    expect(waiting.settled()).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('should listen to the abort only once', async () => {
    const controller = new AbortController()
    const addListener = jest.spyOn(controller.signal, 'addEventListener')

    const promise = wait(100, controller.signal)

    expect(addListener).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), {
      once: true
    })
    controller.abort()
    await promise
  })

  it('should remove the abort listener when the time is up', async () => {
    const controller = new AbortController()
    const addListener = jest.spyOn(controller.signal, 'addEventListener')
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener')

    const promise = wait(100, controller.signal)
    await jest.advanceTimersByTimeAsync(100)
    await promise

    const listener = addListener.mock.calls[0][1]
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('abort', listener)
  })

  it('should not be affected by an abort after the time is up', async () => {
    const controller = new AbortController()
    const promise = wait(100, controller.signal)
    await jest.advanceTimersByTimeAsync(100)
    await promise

    expect(() => controller.abort()).not.toThrow()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('should resolve on the next timer tick when asked to wait 0 ms', async () => {
    const waiting = track(wait(0, new AbortController().signal))
    await Promise.resolve()
    expect(waiting.settled()).toBe(false)

    await jest.advanceTimersByTimeAsync(0)

    expect(waiting.settled()).toBe(true)
  })
})
