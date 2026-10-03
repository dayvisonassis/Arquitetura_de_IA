import http from 'http'
import https from 'https'

// Force the testing environment before any module reads NODE_ENV.
process.env.NODE_ENV = 'testing'

// No test may reach a real AI provider (PRD F01): the guard rejects every
// request to their hosts, through fetch and through the http/https modules.
const PROVIDER_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com']
const GUARDED = Symbol.for('ai-gateway.provider-guard')

type HostOptions = { hostname?: string | null; host?: string | null }

const hostOf = (target: unknown): string | undefined => {
  if (typeof target === 'string') {
    try {
      return new URL(target).hostname
    } catch {
      return undefined
    }
  }
  if (target instanceof URL) {
    return target.hostname
  }
  if (target && typeof target === 'object') {
    const { url } = target as { url?: unknown }
    if (typeof url === 'string') {
      return hostOf(url)
    }
    const { hostname, host } = target as HostOptions
    return (hostname ?? host ?? undefined)?.replace(/:\d+$/, '')
  }
  return undefined
}

const blockedHost = (target: unknown): string | undefined => {
  const host = hostOf(target)?.toLowerCase()
  return host && PROVIDER_HOSTS.includes(host) ? host : undefined
}

const providerCallError = (host: string): Error =>
  new Error(
    `Tests must not call the AI provider ${host}: use apps/ia_simulator or a mock`
  )

const guardModule = (module: typeof http | typeof https): void => {
  const target = module as unknown as Record<string | symbol, unknown>
  if (target[GUARDED]) {
    return
  }
  for (const method of ['request', 'get'] as const) {
    const original = module[method] as (...args: unknown[]) => unknown
    target[method] = (...args: unknown[]) => {
      const host = blockedHost(args[0])
      if (host) {
        throw providerCallError(host)
      }
      return original.apply(module, args)
    }
  }
  target[GUARDED] = true
}

guardModule(http)
guardModule(https)

const realFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const host = blockedHost(input)
  return host ? Promise.reject(providerCallError(host)) : realFetch(input, init)
}
