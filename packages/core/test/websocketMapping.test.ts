import { describe, expect, it } from 'vitest'
import type { TwinBinding } from '../src/domain/twin'
import { mapWebSocketDeviceMessage } from '../src/infrastructure/data/WebSocketDataSource'

const variables: TwinBinding['variables'] = [
  { id: 'soc', key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
  { id: 'alarm', key: 'alarm', name: '告警', dataType: 'boolean' },
  { id: 'status', key: 'status', name: '状态', dataType: 'string' },
]
const bindings: TwinBinding[] = [
  { id: 'b1', target: { type: 'primitive', nodeId: 'n1' }, device: { id: 'ESS-001', name: '1' }, variables },
  { id: 'b2', target: { type: 'primitive', nodeId: 'n2' }, device: { id: 'ESS-001', name: '1 copy' }, variables },
  { id: 'b3', target: { type: 'primitive', nodeId: 'n3' }, device: { id: 'ESS-002', name: '2' }, variables },
]

describe('mapWebSocketDeviceMessage', () => {
  it('maps flat values to every binding of the device', () => {
    expect(mapWebSocketDeviceMessage({ deviceId: 'ESS-001', soc: 72, alarm: false }, bindings)).toEqual([
      { bindingId: 'b1', variableKey: 'soc', value: 72 },
      { bindingId: 'b1', variableKey: 'alarm', value: false },
      { bindingId: 'b2', variableKey: 'soc', value: 72 },
      { bindingId: 'b2', variableKey: 'alarm', value: false },
    ])
  })

  it('reads values from a nested values object', () => {
    expect(mapWebSocketDeviceMessage({ deviceId: 'ESS-002', values: { status: 'running' } }, bindings)).toEqual([
      { bindingId: 'b3', variableKey: 'status', value: 'running' },
    ])
  })

  it('ignores wrong types, unknown keys and unknown devices', () => {
    expect(mapWebSocketDeviceMessage({ deviceId: 'ESS-002', soc: '72', alarm: 1, extra: 5 }, bindings)).toEqual([])
    expect(mapWebSocketDeviceMessage({ deviceId: 'ESS-002', soc: Number.POSITIVE_INFINITY }, bindings)).toEqual([])
    expect(mapWebSocketDeviceMessage({ deviceId: 'ESS-404', soc: 1 }, bindings)).toEqual([])
  })

  it('ignores malformed envelopes', () => {
    expect(mapWebSocketDeviceMessage(null, bindings)).toEqual([])
    expect(mapWebSocketDeviceMessage([{ deviceId: 'ESS-001', soc: 1 }], bindings)).toEqual([])
    expect(mapWebSocketDeviceMessage({ deviceId: '', soc: 1 }, bindings)).toEqual([])
    expect(mapWebSocketDeviceMessage({ soc: 1 }, bindings)).toEqual([])
  })
})
