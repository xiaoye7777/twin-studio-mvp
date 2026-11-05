import { describe, expect, it } from 'vitest'
import {
  activeDataSource,
  activeDataSources,
  bindingsForSource,
  sourceProvides,
  isProjectDataSources,
} from '../src/domain/dataSources'
import type { TwinBinding } from '../src/domain/twin'

const ws = {
  id: 'realtime',
  name: '实时设备数据',
  type: 'websocket',
  enabled: true,
  url: 'ws://127.0.0.1:8787/realtime',
} as const

describe('isProjectDataSources', () => {
  it.each([
    ['empty list', []],
    ['websocket', [ws]],
    ['wss with port and query', [{ ...ws, url: 'wss://gateway.example.com:9443/rt?site=1' }]],
    ['one enabled among several', [ws, { ...ws, id: 'backup', enabled: false }]],
    ['all disabled', [{ ...ws, enabled: false }]],
    ['two enabled', [ws, { ...ws, id: 'other' }]],
    ['sixty-four sources', Array.from({ length: 64 }, (_, i) => ({ ...ws, id: `s${i}`, enabled: true }))],
    ['empty hash marker', [{ ...ws, url: 'ws://host/rt#' }]],
  ])('accepts %s', (_label, value) => expect(isProjectDataSources(value)).toBe(true))

  it.each([
    ['not an array', ws],
    ['sixty-five sources', Array.from({ length: 65 }, (_, i) => ({ ...ws, id: `s${i}`, enabled: false }))],
    ['duplicate id', [ws, { ...ws, enabled: false }]],
    ['blank id', [{ ...ws, id: '  ' }]],
    ['blank name', [{ ...ws, name: ' ' }]],
    ['non-boolean enabled', [{ ...ws, enabled: 'yes' }]],
    ['unknown type', [{ ...ws, type: 'mqtt' }]],
    ['http url', [{ ...ws, url: 'http://host/rt' }]],
    ['javascript url', [{ ...ws, url: 'javascript:alert(1)' }]],
    ['credentials in url', [{ ...ws, url: 'ws://user:secret@host/rt' }]],
    ['password only', [{ ...ws, url: 'ws://:secret@host/rt' }]],
    ['url fragment', [{ ...ws, url: 'ws://host/rt#token' }]],
    ['not a url', [{ ...ws, url: 'not a url' }]],
    ['missing url', [{ id: 'x', name: 'x', type: 'websocket', enabled: true }]],
    ['extra key on websocket', [{ ...ws, token: 'secret' }]],
    ['mock type', [{ id: 'legacy', name: '演示数据', type: 'mock', enabled: true }]],
    ['null entry', [null]],
  ])('rejects %s', (_label, value) => expect(isProjectDataSources(value)).toBe(false))
})

describe('activeDataSource', () => {
  it('uses only an enabled websocket source', () => {
    expect(activeDataSource([ws])).toEqual(ws)
    expect(activeDataSource([{ ...ws, enabled: false }])).toBeNull()
    expect(activeDataSource([])).toBeNull()
    expect(activeDataSource(undefined)).toBeNull()
  })

  it('throws on invalid configuration', () => {
    expect(() => activeDataSource([ws, { ...ws }])).toThrow('数据源配置无效')
  })

  it('lists every enabled source in order', () => {
    const second = { ...ws, id: 'second' }
    expect(activeDataSources([{ ...ws, enabled: false }, second, { ...ws, id: 'third' }]).map(s => s.id)).toEqual([
      'second',
      'third',
    ])
    expect(activeDataSource([second, { ...ws, id: 'third' }])?.id).toBe('second')
  })
})

describe('source device scope', () => {
  const variables = [
    { id: 'a', key: 'soc', name: 'SOC', dataType: 'number' },
    { id: 'b', key: 'power', name: '功率', dataType: 'number' },
  ] as const
  const bindings = [
    {
      id: 'b1',
      target: { type: 'node', nodeId: 'n1' },
      device: { id: 'ESS-001', name: '1' },
      variables: [...variables],
    },
    {
      id: 'b2',
      target: { type: 'node', nodeId: 'n2' },
      device: { id: 'ESS-002', name: '2' },
      variables: [...variables],
    },
  ] as TwinBinding[]

  it('sees every device when no scope is set', () => {
    expect(bindingsForSource({}, bindings)).toBe(bindings)
    expect(sourceProvides({}, 'ANY', 'soc')).toBe(true)
  })

  it('narrows devices and variables', () => {
    const source = { devices: [{ deviceId: 'ESS-002', variables: ['power'] }] }
    const scoped = bindingsForSource(source, bindings)
    expect(scoped.map(binding => binding.id)).toEqual(['b2'])
    expect(scoped[0]!.variables.map(variable => variable.key)).toEqual(['power'])
    expect(sourceProvides(source, 'ESS-002', 'soc')).toBe(false)
    expect(sourceProvides({ devices: [{ deviceId: 'ESS-002' }] }, 'ESS-002', 'soc')).toBe(true)
  })
})

describe('http and static sources', () => {
  const http = {
    id: 'http',
    name: '定时请求',
    type: 'http',
    enabled: true,
    url: 'https://api.example.com/devices/latest',
    method: 'GET',
    interval: 5,
    resultPath: 'data.list',
    withCredentials: false,
  } as const
  const fixed = {
    id: 'static',
    name: '静态数据',
    type: 'static',
    enabled: true,
    values: { 'ESS-001': { soc: 72 } },
  } as const

  it.each([
    ['http', [http]],
    ['same-origin path', [{ ...http, url: '/park-api/devices' }]],
    ['post with body', [{ ...http, method: 'POST', body: '{"site":1}' }]],
    ['static values', [fixed]],
    ['several types enabled together', [http, fixed, ws]],
    [
      'full http configuration',
      [
        {
          ...http,
          timeout: 10,
          params: [{ key: 'site', value: 'A' }],
          headers: [{ key: 'X-Tenant', value: 'park' }],
          authRef: 'conn_1',
          envelope: 'off',
          devices: [{ deviceId: 'ESS-001', variables: ['soc'] }],
          mapping: { format: 'metric-row', deviceField: 'id', metricField: 'name', fields: { soc: 'stateOfCharge' } },
        },
      ],
    ],
    [
      'full websocket configuration',
      [{ ...ws, resultPath: 'payload', subscribe: '{"op":"sub"}', heartbeat: { interval: 30, message: 'ping' } }],
    ],
  ])('accepts %s', (_label, value) => expect(isProjectDataSources(value)).toBe(true))

  it.each([
    ['ws url on http', [{ ...http, url: 'ws://host/rt' }]],
    ['protocol-relative url', [{ ...http, url: '//evil.example.com/x' }]],
    ['credentials in http url', [{ ...http, url: 'https://user:pw@host/x' }]],
    ['zero interval', [{ ...http, interval: 0 }]],
    ['token header', [{ ...http, headers: { Authorization: 'Bearer x' } }]],
    ['object as a static value', [{ ...fixed, values: { 'ESS-001': { soc: { nested: 1 } } } }]],
    ['secret header', [{ ...http, headers: [{ key: 'Authorization', value: 'Bearer x' }] }]],
    ['secret param', [{ ...http, params: [{ key: 'access_token', value: 'x' }] }]],
    ['secret in url query', [{ ...http, url: 'https://api.example.com/x?token=abc' }]],
    ['unknown mapping format', [{ ...http, mapping: { format: 'guess' } }]],
  ])('rejects %s', (_label, value) => expect(isProjectDataSources(value)).toBe(false))

  it('makes http and static sources active like websocket', () => {
    expect(activeDataSource([http])?.type).toBe('http')
    expect(activeDataSource([{ ...ws, enabled: false }, fixed])?.type).toBe('static')
  })
})
