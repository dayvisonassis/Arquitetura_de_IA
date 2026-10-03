import http from 'http'
import https from 'https'
import type { AddressInfo } from 'net'

const OPENAI = 'api.openai.com'
const GOOGLE = 'generativelanguage.googleapis.com'

describe('provider guard installed by setupTests', () => {
  let server: http.Server
  let localUrl: string

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    localUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('fetch', () => {
    it.each([
      ['a string URL', `https://${OPENAI}/v1/models`, OPENAI],
      ['a URL object', new URL(`https://${GOOGLE}/v1beta/models`), GOOGLE],
      [
        'a Request',
        new Request(`https://${OPENAI}/v1/chat/completions`),
        OPENAI
      ]
    ])(
      'should refuse requests to the provider hosts (%s)',
      async (_case, input, host) => {
        await expect(fetch(input)).rejects.toThrow(host)
      }
    )
  })

  describe('http and https', () => {
    it.each([
      [
        'https.request with a string URL',
        () => https.request(`https://${OPENAI}/v1/models`),
        OPENAI
      ],
      [
        'https.get with a URL object',
        () => https.get(new URL(`https://${GOOGLE}/v1beta/models`)),
        GOOGLE
      ],
      [
        'https.request with hostname options',
        () => https.request({ hostname: GOOGLE, path: '/' }),
        GOOGLE
      ],
      [
        'http.request with host and port',
        () => http.request({ host: `${OPENAI}:80`, path: '/' }),
        OPENAI
      ],
      [
        'http.get with an upper-case host',
        () => http.get(`http://${OPENAI.toUpperCase()}/`),
        OPENAI
      ]
    ])(
      'should refuse requests to the provider hosts (%s)',
      (_case, call, host) => {
        expect(call).toThrow(host)
      }
    )
  })

  describe('other hosts', () => {
    it('should let fetch reach a host that is not a provider', async () => {
      const response = await fetch(localUrl)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('ok')
    })

    it('should let http.get reach a host that is not a provider', async () => {
      const status = await new Promise<number | undefined>(
        (resolve, reject) => {
          http
            .get(localUrl, response => {
              response.resume()
              resolve(response.statusCode)
            })
            .on('error', reject)
        }
      )

      expect(status).toBe(200)
    })
  })
})
