import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../src/document/sceneOps'
import type { SceneDocumentV2 } from '../src/domain/scene'
import type { TwinBinding, TwinRuntimeValue } from '../src/domain/twin'
import { twinBindingTargetKey } from '../src/domain/twin'
import { panelInstanceFor, resolvePanel } from '../src/runtime/panels/resolvePanel'
import { readObjectData } from '../src/runtime/twin/readObjectData'

const transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
} as SceneDocumentV2['nodes'][0]['transform']
const binding: TwinBinding = {
  id: 'b1',
  target: { type: 'asset-instance', instanceId: 'cab1' },
  device: { id: 'ESS-001', name: '1 号储能柜' },
  variables: [
    { id: 'soc', key: 'soc', name: 'SOC', dataType: 'number', unit: '%' },
    { id: 'power', key: 'power', name: '功率', dataType: 'number', unit: 'kW' },
  ],
}

function scene(): SceneDocumentV2 {
  return {
    ...createEmptyDocument('p', '场景'),
    nodes: [
      {
        id: 'cab1',
        parentId: null,
        name: '柜 1',
        kind: 'model',
        visible: true,
        locked: false,
        transform,
        model: { assetId: 'a' },
      },
      {
        id: 'cab2',
        parentId: null,
        name: '柜 2',
        kind: 'model',
        visible: true,
        locked: false,
        transform,
        model: { assetId: 'a' },
      },
      {
        id: 'lonely',
        parentId: null,
        name: '空',
        kind: 'model',
        visible: true,
        locked: false,
        transform,
        model: { assetId: 'a' },
      },
    ],
    bindings: [binding],
    panelTemplates: [
      {
        id: 't1',
        name: '储能柜',
        title: '',
        fields: [
          { id: 'f1', label: '电量', variableKey: 'soc' },
          { id: 'f2', label: '功率', variableKey: 'power', unit: 'MW' },
        ],
      },
    ],
    panels: [
      { id: 'p1', templateId: 't1', nodeId: 'cab1' },
      { id: 'p2', templateId: 't1', nodeId: 'cab2', title: '二号柜', hiddenFields: ['f2'] },
    ],
  }
}

const values: Record<string, TwinRuntimeValue> = {
  'b1:soc': { bindingId: 'b1', variableKey: 'soc', value: 72.5, updatedAt: '2026-11-05T00:00:00.000Z' },
}
const reader = {
  getBindingByTarget: (target: TwinBinding['target']) =>
    twinBindingTargetKey(target) === twinBindingTargetKey(binding.target) ? binding : null,
  getRuntimeValue: (bindingId: string, key: string) => values[`${bindingId}:${key}`] ?? null,
}

describe('resolvePanel', () => {
  it('takes fields from the template and values from the device', () => {
    expect(resolvePanel(scene(), reader, 'cab1')).toEqual({
      instanceId: 'p1',
      templateId: 't1',
      nodeId: 'cab1',
      title: '1 号储能柜',
      rows: [
        { id: 'f1', label: '电量', value: '72.5 %' },
        { id: 'f2', label: '功率', value: '—' },
      ],
    })
  })

  it('applies instance overrides on top of the template', () => {
    const view = resolvePanel(scene(), reader, 'cab2')!
    expect(view.title).toBe('二号柜')
    expect(view.rows.map(row => row.id)).toEqual(['f1'])
  })

  it('template changes reach every instance', () => {
    const document = scene()
    document.panelTemplates[0]!.fields.push({ id: 'f3', label: '新字段', variableKey: 'x' })
    expect(resolvePanel(document, reader, 'cab1')!.rows.map(row => row.id)).toEqual(['f1', 'f2', 'f3'])
    expect(resolvePanel(document, reader, 'cab2')!.rows.map(row => row.id)).toEqual(['f1', 'f3'])
  })

  it('returns null without an instance or a template', () => {
    expect(resolvePanel(scene(), reader, 'lonely')).toBeNull()
    const document = scene()
    document.panelTemplates = []
    expect(resolvePanel(document, reader, 'cab1')).toBeNull()
  })

  it('a panel on a group serves the models inside it', () => {
    const document = scene()
    document.nodes.unshift({
      id: 'g',
      parentId: null,
      name: '组',
      kind: 'group',
      visible: true,
      locked: false,
      transform,
    })
    document.nodes.find(node => node.id === 'lonely')!.parentId = 'g'
    document.panels.push({ id: 'p3', templateId: 't1', nodeId: 'g' })
    expect(panelInstanceFor(document, 'lonely')?.id).toBe('p3')
  })
})

describe('readObjectData', () => {
  it('returns the device and every variable, null where no value has arrived', () => {
    const data = readObjectData(scene().nodes[0]!, reader)
    expect(data).toMatchObject({ nodeId: 'cab1', name: '柜 1', kind: 'model', bindingId: 'b1' })
    expect(data.device?.id).toBe('ESS-001')
    expect(data.values).toEqual([
      { key: 'soc', name: 'SOC', unit: '%', value: 72.5, updatedAt: '2026-11-05T00:00:00.000Z' },
      { key: 'power', name: '功率', unit: 'kW', value: null, updatedAt: null },
    ])
  })

  it('works for objects without a device', () => {
    expect(readObjectData(scene().nodes[2]!, reader)).toMatchObject({ device: null, bindingId: null, values: [] })
  })
})
