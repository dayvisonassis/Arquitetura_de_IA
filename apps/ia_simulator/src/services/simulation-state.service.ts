export const MODES = [
  'ok',
  'error',
  'slow',
  'timeout',
  'fenced-json',
  'invalid-json'
] as const

export type ModeName = (typeof MODES)[number]

export type ModeConfig =
  | { mode: 'ok'; content?: string }
  | { mode: 'error'; status: number; retry_after_seconds?: number }
  | { mode: 'slow'; delay_ms: number; content?: string }
  | { mode: 'timeout' }
  | { mode: 'fenced-json'; content?: string }
  | { mode: 'invalid-json'; content?: string }

export type ModeRequest = ModeConfig & { model: string; times?: number }

type StoredMode = { config: ModeConfig; remaining: number | null }

type RecordedRequest = { received_at: string; mode: ModeName; body: unknown }

type ModelStats = { calls: number; requests: RecordedRequest[] }

const MAX_RECORDED_REQUESTS = 20

let modes = new Map<string, StoredMode>()
let stats = new Map<string, ModelStats>()

const viewOf = ({ config, remaining }: StoredMode) =>
  structuredClone({ ...config, remaining_calls: remaining })

export const setMode = ({ model, times, ...config }: ModeRequest) => {
  const stored = { config, remaining: times ?? null }
  modes.set(model, stored)
  return { model, ...viewOf(stored) }
}

export const takeMode = (model: string): ModeConfig => {
  const stored = modes.get(model)
  if (!stored) {
    return { mode: 'ok' }
  }
  if (stored.remaining === 1) {
    modes.delete(model)
  } else if (stored.remaining !== null) {
    modes.set(model, { ...stored, remaining: stored.remaining - 1 })
  }
  return structuredClone(stored.config)
}

export const recordCall = (
  model: string,
  mode: ModeName,
  body: unknown,
  receivedAt: Date = new Date()
): void => {
  const current = stats.get(model) ?? { calls: 0, requests: [] }
  const request = {
    received_at: receivedAt.toISOString(),
    mode,
    body: structuredClone(body)
  }
  stats.set(model, {
    calls: current.calls + 1,
    requests: [...current.requests, request].slice(-MAX_RECORDED_REQUESTS)
  })
}

export const listModes = () =>
  Object.fromEntries(
    [...modes].map(([model, stored]) => [model, viewOf(stored)])
  )

export const getStats = (): Record<string, ModelStats> =>
  structuredClone(Object.fromEntries(stats))

export const reset = (): void => {
  modes = new Map()
  stats = new Map()
}
