import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TwinBinding, TwinRuntimeValueData } from '../src/domain/twin'
import { HttpPollingDataSource, readPath, StaticDataSource } from '../src/infrastructure/data'

const binding: TwinBinding = {
  id: 'b1',
  target: { type: 'node', nodeId: 'n1' },
  device: { id: 'ESS-001', name: '储能柜 01' },
  variables: [
    { key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
    { key: 'status', name: '状态', dataType: 'string' },
  ],
} as TwinBinding

function recorder() {
  const values = new Map<string, TwinRuntimeValueData>()
  const statuses: string[] = []
  return {
    values,
    statuses,
    options: {
      getBindings: () => [binding],
      setRuntimeValue: (id: string, key: string, value: TwinRuntimeValueData) => values.set(`${id}.${key}`, value),
      onStatus: (status: string) => statuses.push(status),
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('readPath', () => {
  it('reads dotted paths and indices', () => {
    expect(readPath({ data: { list: [{ a: 1 }] } }, 'data.list[0].a')).toBe(1)
    expect(readPath({ a: 1 }, '')).toEqual({ a: 1 })
    expect(readPath(null, 'a')).toBeUndefined()
  })
})

describe('StaticDataSource', () => {
  it('writes typed values of bound devices and ignores the rest', () => {
    const r = recorder()
    new StaticDataSource({
      ...r.options,
      values: { 'ESS-001': { soc: 72, status: 'running', extra: 1 }, 'ESS-999': { soc: 10 } },
    }).start()
    expect(Object.fromEntries(r.values)).toEqual({ 'b1.soc': 72, 'b1.status': 'running' })
    expect(r.statuses).toEqual(['connected'])
  })

  it('skips values of the wrong type', () => {
    const r = recorder()
    new StaticDataSource({ ...r.options, values: { 'ESS-001': { soc: '72' } } }).start()
    expect(r.values.size).toBe(0)
  })
})

describe('HttpPollingDataSource', () => {
  it('reads device messages at the result path and reports connected', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: [{ deviceId: 'ESS-001', soc: 64 }] })))
    vi.stubGlobal('fetch', fetch)
    const r = recorder()
    const source = new HttpPollingDataSource({
      ...r.options,
      url: '/api/latest',
      method: 'GET',
      interval: 60,
      resultPath: 'data',
      withCredentials: false,
    })
    source.start()
    await vi.waitFor(() => expect(r.values.get('b1.soc')).toBe(64))
    expect(r.statuses).toEqual(['connecting', 'connected'])
    source.stop()
    expect(r.statuses.at(-1)).toBe('disconnected')
  })

  it('posts the subscribe message when the body is empty', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    const r = recorder()
    const source = new HttpPollingDataSource({
      ...r.options,
      url: '/api/latest',
      method: 'POST',
      interval: 60,
      resultPath: '',
      withCredentials: true,
    })
    source.start()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    const init = fetch.mock.calls[0]![1]!
    expect(JSON.parse(String(init.body))).toMatchObject({ type: 'subscribe', devices: [{ deviceId: 'ESS-001' }] })
    expect(init.credentials).toBe('include')
    source.stop()
  })

  it('reports an error for a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    const r = recorder()
    const errors: string[] = []
    const source = new HttpPollingDataSource({
      ...r.options,
      onStatus: (status, error) => {
        r.statuses.push(status)
        if (error) errors.push(error)
      },
      url: '/api/latest',
      method: 'GET',
      interval: 60,
      resultPath: '',
      withCredentials: false,
    })
    source.start()
    await vi.waitFor(() => expect(r.statuses).toContain('error'))
    expect(errors[0]).toContain('500')
    source.stop()
  })
})
