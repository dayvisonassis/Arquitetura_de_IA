import {
  startSimulator,
  type SimulatorProcess
} from '../utils/simulator-process'

// One real simulator process per file, reached only over HTTP.
describe('simulator process', () => {
  let simulator: SimulatorProcess

  beforeAll(async () => {
    simulator = await startSimulator()
  })

  afterAll(async () => {
    await simulator?.stop()
  })

  it('should start on a free port and answer the health check', async () => {
    const response = await fetch(`${simulator.baseUrl}/health/live`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('should answer an unknown route with the OpenAI error format', async () => {
    const response = await fetch(`${simulator.baseUrl}/nope`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        message: 'Unknown route.',
        type: 'invalid_request_error',
        code: 'not_found'
      }
    })
  })
})
