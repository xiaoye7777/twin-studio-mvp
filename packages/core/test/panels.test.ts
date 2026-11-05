import { beforeAll, describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../src/document/sceneOps'
import { createPanelTemplate } from '../src/domain/panels'
import type { SceneDocumentV2, SceneNodeV2 } from '../src/domain/scene'
import type { TwinBinding, TwinRuntimeValue } from '../src/domain/twin'
import { twinBindingTargetKey } from '../src/domain/twin'
import { PanelLayer } from '../src/runtime/panels/PanelLayer'
import { PanelObject } from '../src/runtime/panels/PanelObject'
import { dataOwnerOf, resolvePanel } from '../src/runtime/panels/resolvePanel'
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

function base(id: string, name: string, parentId: string | null = null) {
  return { id, parentId, name, visible: true, locked: false, transform }
}

function scene(): SceneDocumentV2 {
  return {
    ...createEmptyDocument('p', '场景'),
    nodes: [
      { ...base('cab1', '柜 1'), kind: 'model', model: { assetId: 'a' } },
      { ...base('cab2', '柜 2'), kind: 'model', model: { assetId: 'a' } },
      {
        ...base('labels', '标签组'),
        kind: 'panel-group',
        template: {
          ...createPanelTemplate(),
          fields: [
            { id: 'f1', label: '电量', variableKey: 'soc' },
            { id: 'f2', label: '功率', variableKey: 'power', unit: 'MW' },
          ],
        },
      },
      { ...base('p1', '面板 1', 'labels'), kind: 'panel', panel: { targetNodeId: 'cab1' } },
      { ...base('p2', '面板 2', 'labels'), kind: 'panel', panel: { title: '二号柜', hiddenFields: ['f2'] } },
    ],
    bindings: [binding],
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
  it('takes fields from the group template and values from the linked object', () => {
    expect(resolvePanel(scene(), reader, 'p1')).toEqual({
      nodeId: 'p1',
      title: '1 号储能柜',
      width: 3,
      rows: [
        { id: 'f1', label: '电量', value: '72.5 %' },
        { id: 'f2', label: '功率', value: '—' },
      ],
    })
  })

  it('applies a panel’s overrides on top of the template', () => {
    const view = resolvePanel(scene(), reader, 'p2')!
    expect(view.title).toBe('二号柜')
    expect(view.rows.map(row => row.id)).toEqual(['f1'])
  })

  it('template changes reach every panel', () => {
    const document = scene()
    const group = document.nodes.find(node => node.id === 'labels') as Extract<SceneNodeV2, { kind: 'panel-group' }>
    group.template.fields.push({ id: 'f3', label: '新字段', variableKey: 'x' })
    group.template.width = 6
    expect(resolvePanel(document, reader, 'p1')!.rows.map(row => row.id)).toEqual(['f1', 'f2', 'f3'])
    expect(resolvePanel(document, reader, 'p1')!.width).toBe(6)
    expect(resolvePanel(document, reader, 'p2')!.rows.map(row => row.id)).toEqual(['f1', 'f3'])
  })

  it('returns null for anything but a panel in a group', () => {
    expect(resolvePanel(scene(), reader, 'cab1')).toBeNull()
    expect(resolvePanel(scene(), reader, 'missing')).toBeNull()
  })

  it('a panel without a linked object uses its own device', () => {
    const document = scene()
    expect(dataOwnerOf(document, document.nodes[4]!).id).toBe('p2')
    expect(dataOwnerOf(document, document.nodes[3]!).id).toBe('cab1')
  })
})

describe('PanelLayer', () => {
  beforeAll(() => {
    // 测试环境没有 canvas：只验证显示逻辑，内容不画。
    PanelObject.prototype.render = function () {}
  })

  function layerFor(document: SceneDocumentV2) {
    const objects = new Map(
      document.nodes.filter(node => node.kind === 'panel').map(node => [node.id, new PanelObject()]),
    )
    let frame = () => {}
    const data = { ...reader, runtimeRevision: 0, bindingRevision: 0 }
    const layer = new PanelLayer(
      {
        onFrame: listener => {
          frame = listener
          return () => {}
        },
      },
      id => objects.get(id) ?? null,
      data,
    )
    layer.setDocument(document)
    const shown = () => {
      frame()
      return [...objects].filter(([, object]) => object.sprite.visible).map(([id]) => id)
    }
    return { layer, shown }
  }

  function withTrigger(trigger: 'always' | 'click'): SceneDocumentV2 {
    const document = scene()
    const group = document.nodes.find(node => node.id === 'labels') as Extract<SceneNodeV2, { kind: 'panel-group' }>
    group.template.trigger = trigger
    return document
  }

  it('always-visible panels stay visible; editing shows everything', () => {
    const { layer, shown } = layerFor(withTrigger('always'))
    expect(shown()).toEqual(['p1', 'p2'])
    layer.setPlaying(true)
    expect(shown()).toEqual(['p1', 'p2'])
    layer.setEnabled(false)
    expect(shown()).toEqual([])
  })

  it('click panels appear when their object is clicked and hide on a blank click', () => {
    const { layer, shown } = layerFor(withTrigger('click'))
    expect(shown()).toEqual(['p1', 'p2'])
    layer.setPlaying(true)
    expect(shown()).toEqual([])
    layer.setClicked('cab1')
    expect(shown()).toEqual(['p1'])
    layer.setClicked(null)
    expect(shown()).toEqual([])
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
    expect(readObjectData(scene().nodes[1]!, reader)).toMatchObject({ device: null, bindingId: null, values: [] })
  })

  it('a panel linked to an object reports that object’s device', () => {
    const document = scene()
    const panel = document.nodes[3]!
    const data = readObjectData(panel, reader, dataOwnerOf(document, panel))
    expect(data).toMatchObject({ nodeId: 'p1', kind: 'panel', bindingId: 'b1' })
  })
})
