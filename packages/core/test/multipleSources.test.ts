import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import type { ProjectDataSource } from '../src/domain/dataSources'
import type { TwinBinding } from '../src/domain/twin'
import { buildHttpRequest, mapDeviceMessages } from '../src/infrastructure/data'
import { BindingTargetResolver } from '../src/runtime/twin/BindingTargetResolver'
import { createTwinState } from '../src/runtime/twin/createTwinState'
import { TwinDataRuntime } from '../src/runtime/twin/TwinDataRuntime'

const variables: TwinBinding['variables'] = [
  { id: 'soc', key: 'soc', name: 'SOC', dataType: 'number' },
  { id: 'power', key: 'power', name: '功率', dataType: 'number' },
  { id: 'alarm', key: 'alarm', name: '告警', dataType: 'boolean' },
]
const bindings: TwinBinding[] = [
  { id: 'b1', target: { type: 'node', nodeId: 'n1' }, device: { id: 'ESS-001', name: '1' }, variables },
  { id: 'b2', target: { type: 'node', nodeId: 'n2' }, device: { id: 'ESS-002', name: '2' }, variables },
]

afterEach(() => vi.unstubAllGlobals())

describe('mapDeviceMessages', () => {
  it('reads the default format, converting numbers and booleans sent as text', () => {
    expect(mapDeviceMessages([{ deviceId: 'ESS-001', soc: '72.5', alarm: 1, extra: 3 }], bindings)).toEqual([
      { bindingId: 'b1', variableKey: 'soc', value: 72.5 },
      { bindingId: 'b1', variableKey: 'alarm', value: true },
    ])
  })

  it('ignores values that cannot be converted', () => {
    expect(mapDeviceMessages({ deviceId: 'ESS-001', soc: 'high', alarm: 'maybe' }, bindings)).toEqual([])
  })

  it('uses a custom device field, a values path and field names', () => {
    const mapping = { deviceField: 'meta.code', valuesPath: 'metrics', fields: { soc: 'stateOfCharge' } }
    expect(
      mapDeviceMessages([{ meta: { code: 'ESS-002' }, metrics: { stateOfCharge: 40, power: 9 } }], bindings, mapping),
    ).toEqual([
      { bindingId: 'b2', variableKey: 'soc', value: 40 },
      { bindingId: 'b2', variableKey: 'power', value: 9 },
    ])
  })

  it('accepts device ids sent as numbers', () => {
    const numbered = [{ ...bindings[0]!, device: { id: '1001', name: 'n' } }]
    expect(mapDeviceMessages({ deviceId: 1001, power: 5 }, numbered)).toEqual([
      { bindingId: 'b1', variableKey: 'power', value: 5 },
    ])
  })

  it('reads one variable per row', () => {
    const mapping = { format: 'metric-row', metricField: 'name', valueField: 'val' } as const
    expect(
      mapDeviceMessages(
        [
          { deviceId: 'ESS-001', name: 'soc', val: 72 },
          { deviceId: 'ESS-001', name: 'unknown', val: 1 },
          { deviceId: 'ESS-404', name: 'soc', val: 1 },
        ],
        bindings,
        mapping,
      ),
    ).toEqual([{ bindingId: 'b1', variableKey: 'soc', value: 72 }])
  })

  it('reads an object keyed by device id', () => {
    expect(
      mapDeviceMessages({ 'ESS-002': { power: 12 }, 'ESS-404': { power: 1 } }, bindings, { format: 'device-map' }),
    ).toEqual([{ bindingId: 'b2', variableKey: 'power', value: 12 }])
  })

  it('treats the data as the scoped device when the device field is empty', () => {
    expect(mapDeviceMessages({ power: 3 }, [bindings[1]!], { deviceField: '' })).toEqual([
      { bindingId: 'b2', variableKey: 'power', value: 3 },
    ])
  })
})

describe('buildHttpRequest', () => {
  const base = { url: '/api/x', method: 'GET', withCredentials: false } as const

  it('adds parameters, headers and sign-in headers', () => {
    const { url, init } = buildHttpRequest(
      {
        ...base,
        url: '/api/x?a=1',
        params: [
          { key: 'site', value: '东 区' },
          { key: ' ', value: 'skipped' },
        ],
        headers: [{ key: 'X-Tenant', value: 'park' }],
      },
      bindings,
      { Authorization: 'Bearer t' },
    )
    expect(url).toBe('/api/x?a=1&site=%E4%B8%9C%20%E5%8C%BA')
    expect(init.headers).toEqual({ 'X-Tenant': 'park', Authorization: 'Bearer t' })
    expect(init.body).toBeUndefined()
  })

  it('posts the device list when the body is empty, and the typed body otherwise', () => {
    const empty = buildHttpRequest({ ...base, method: 'POST' }, [bindings[0]!])
    expect(JSON.parse(String(empty.init.body)).devices.map((d: { deviceId: string }) => d.deviceId)).toEqual([
      'ESS-001',
    ])
    expect(buildHttpRequest({ ...base, method: 'POST', body: '{"a":1}' }, bindings).init.body).toBe('{"a":1}')
  })
})

describe('TwinDataRuntime with several sources', () => {
  /** A resolver that finds every target, a runtime over the two test bindings. */
  function setup() {
    const state = reactive(createTwinState())
    const runtime = new TwinDataRuntime(state, new BindingTargetResolver(() => ({}) as never))
    runtime.initialize('p', bindings)
    return { state, runtime, value: (id: string, key: string) => state.getRuntimeValue(id, key)?.value }
  }
  const fixed = (id: string, values: Record<string, Record<string, number>>, extra = {}): ProjectDataSource => ({
    id,
    name: id,
    type: 'static',
    enabled: true,
    values,
    ...extra,
  })
  const http = (id: string, url: string, extra = {}): ProjectDataSource => ({
    id,
    name: id,
    type: 'http',
    enabled: true,
    url,
    method: 'GET',
    interval: 3600,
    resultPath: '',
    withCredentials: false,
    ...extra,
  })

  it('merges one device from two interfaces', () => {
    const { runtime, state, value } = setup()
    runtime.start([fixed('a', { 'ESS-001': { soc: 72 } }), fixed('b', { 'ESS-001': { power: 5 } })])
    expect([value('b1', 'soc'), value('b1', 'power')]).toEqual([72, 5])
    expect(state.getRuntimeValue('b1', 'soc')?.sourceId).toBe('a')
    expect(state.getRuntimeValue('b1', 'power')?.sourceId).toBe('b')
    expect(state.dataSourceStates.map(item => item.status)).toEqual(['connected', 'connected'])
    expect(state.dataSourceStatus).toBe('connected')
    runtime.stop()
  })

  it('lets the earlier interface win a conflict, whichever order values arrive in', () => {
    const { runtime, value } = setup()
    runtime.start([fixed('first', { 'ESS-001': { soc: 1 } }), fixed('second', { 'ESS-001': { soc: 2 } })])
    expect(value('b1', 'soc')).toBe(1)
    runtime.start([fixed('second', { 'ESS-001': { soc: 2 } }), fixed('first', { 'ESS-001': { soc: 1 } })])
    runtime.stop()
    runtime.start([fixed('second', { 'ESS-001': { soc: 2 } }), fixed('first', { 'ESS-001': { soc: 1 } })])
    expect(value('b1', 'soc')).toBe(2)
    runtime.stop()
  })

  it('keeps a source to its devices and variables', () => {
    const { runtime, value } = setup()
    runtime.start([
      fixed(
        'a',
        { 'ESS-001': { soc: 1, power: 2 }, 'ESS-002': { soc: 3 } },
        {
          devices: [{ deviceId: 'ESS-001', variables: ['soc'] }],
        },
      ),
    ])
    expect([value('b1', 'soc'), value('b1', 'power'), value('b2', 'soc')]).toEqual([1, undefined, undefined])
    runtime.stop()
  })

  it('clears only the values of the interface that failed, and static data takes over', async () => {
    const fetch = vi.fn(async (url: string) =>
      url === '/ok'
        ? new Response(JSON.stringify([{ deviceId: 'ESS-001', soc: 50 }]))
        : new Response('nope', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetch)
    const { runtime, state, value } = setup()
    runtime.start([
      http('live', '/ok', { interval: 1 }),
      http('bad', '/bad'),
      fixed('backup', { 'ESS-001': { soc: 9, power: 7 } }),
    ])
    await vi.waitFor(() => expect(value('b1', 'soc')).toBe(50))
    await vi.waitFor(() => expect(state.dataSourceStates[1]!.status).toBe('error'))
    // One interface failing leaves the others, and the summary, working.
    expect(state.dataSourceStatus).toBe('connected')
    expect(state.dataSourceError).toContain('bad')
    expect(value('b1', 'power')).toBe(7)

    // The first interface fails: its value goes, and the static one fills the gap straight away.
    fetch.mockImplementation(async () => new Response('nope', { status: 500 }))
    await vi.waitFor(() => expect(state.dataSourceStates[0]!.status).toBe('error'), { timeout: 3000 })
    expect(value('b1', 'soc')).toBe(9)
    runtime.stop()
    expect(state.dataSourceStatus).toBe('disconnected')
    expect(state.dataSourceStates).toEqual([])
  })

  it('restarts only the interface whose settings changed', async () => {
    const fetch = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    const { runtime } = setup()
    const a = http('a', '/a')
    const b = http('b', '/b')
    runtime.start([a, b])
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    runtime.start([{ ...a, name: '改了名字' }, b])
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(fetch).toHaveBeenCalledTimes(2)
    runtime.start([a, http('b', '/b2')])
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(fetch.mock.calls.at(-1)).toEqual(expect.arrayContaining(['/b2']))
    runtime.stop()
  })

  it('asks the host for sign-in headers', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    const state = reactive(createTwinState())
    const runtime = new TwinDataRuntime(state, new BindingTargetResolver(() => ({}) as never), {
      requestHeaders: source => (source.authRef === 'conn' ? { Authorization: 'Bearer t' } : undefined),
    })
    runtime.initialize('p', bindings)
    runtime.start([http('a', '/a', { authRef: 'conn' })])
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: 'Bearer t' })
    runtime.stop()
  })

  it('reports no configured interface', () => {
    const { runtime, state } = setup()
    runtime.start([])
    expect(state.dataSourceStatus).toBe('unconfigured')
    expect(state.dataSourceStates).toEqual([])
  })
})
