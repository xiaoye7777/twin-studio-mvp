import { createEffect } from '../src/domain/effects'
import { getBuiltinTemplates } from '../src/domain/effectTemplates/builtins'
import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  duplicateNodes,
  groupNodes,
  nodeById,
  removeNodes,
  reparentNodes,
  ungroupNodes,
  worldMatrixOf,
} from '../src/document/sceneOps'
import { createPanelTemplate } from '../src/domain/panels'
import {
  canParent,
  loadSceneDocument,
  SceneDocumentError,
  SceneDocumentVersionError,
  scenePresets,
} from '../src/domain/scene'
import type { SceneDocumentV2, SceneNodeV2 } from '../src/domain/scene'

function model(id: string, position: [number, number, number] = [0, 0, 0]): SceneNodeV2 {
  return {
    id,
    parentId: null,
    name: id,
    kind: 'model',
    visible: true,
    locked: false,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    model: { assetId: 'asset_1' },
  }
}

function panelGroup(id: string): SceneNodeV2 {
  return { ...model(id), kind: 'panel-group', template: createPanelTemplate() } as SceneNodeV2
}

function panel(id: string, parentId: string | null, targetNodeId?: string): SceneNodeV2 {
  return { ...model(id), parentId, kind: 'panel', panel: targetNodeId ? { targetNodeId } : {} } as SceneNodeV2
}

function documentWith(...nodes: SceneNodeV2[]): SceneDocumentV2 {
  return { ...createEmptyDocument('p', '场景'), nodes }
}

describe('loadSceneDocument', () => {
  it('opens old annotations without dropping scene objects, bindings or the remaining alarm effects', () => {
    const doc = documentWith(model('a'))
    const target = { type: 'asset-instance', instanceId: 'a' } as const
    const beam = createEffect('beam', target)
    const alarm = getBuiltinTemplates()[0]!
    const old = { ...alarm.effects[0], id: 'annotation', kind: 'floating-label' }
    const rule = {
      id: 'rule',
      enabled: true,
      target,
      bindingId: 'binding',
      variableKey: 'temperature',
      condition: { dataType: 'number', operator: '>', value: 60 },
      priority: 10,
    }
    const loaded = loadSceneDocument({
      ...doc,
      effects: [beam, { ...beam, id: 'text', kind: 'data-label' }],
      visualRules: [
        { ...rule, template: { ...alarm, effects: [...alarm.effects, old] } },
        { ...rule, id: 'only-icon', template: { ...alarm, effects: [{ ...old, kind: 'icon-marker' }] } },
      ],
    }).document
    expect(loaded.effects).toEqual([beam])
    expect(loaded.visualRules![0]?.template).toEqual(alarm)
    expect(loaded.visualRules![1]?.template).toBeNull()
    expect(loaded.nodes).toEqual(doc.nodes)
  })

  it('reads what it writes', () => {
    const document = documentWith(model('a'))
    expect(loadSceneDocument(JSON.parse(JSON.stringify(document))).document).toEqual(document)
  })

  it('preserves a scene’s device templates, including an explicitly empty catalog', () => {
    const document = documentWith(model('a'))
    const pump = {
      id: 'pump',
      type: 'water-pump',
      name: '水泵',
      prefix: 'P-',
      variables: [{ key: 'flow', name: '流量', dataType: 'number', unit: 'm³/h' }],
    }
    expect(loadSceneDocument(document).document.deviceTemplates).toBeUndefined()
    for (const catalog of [[pump], []]) {
      const saved = JSON.stringify({ ...document, deviceTemplates: catalog })
      expect(loadSceneDocument(JSON.parse(saved)).document.deviceTemplates).toEqual(catalog)
    }
    expect(() => loadSceneDocument({ ...document, deviceTemplates: [pump, { ...pump, id: 'other' }] })).toThrow('重复')
  })

  it('refuses a newer format with an upgrade hint', () => {
    expect(() => loadSceneDocument({ version: 3 })).toThrow(SceneDocumentVersionError)
  })

  it('refuses invalid documents and says where', () => {
    const document = documentWith(model('a'), model('a'))
    expect(() => loadSceneDocument(document)).toThrow(SceneDocumentError)
    expect(() => loadSceneDocument(document)).toThrow('节点 ID 重复')
  })

  it('opens documents written by a fuller editor, dropping what this version does not support', () => {
    const full = {
      ...documentWith(model('a')),
      effects: [],
      tours: [],
      dataSources: [{ id: 'old', name: '演示', type: 'mock', enabled: true }],
      nodes: [
        { ...model('a'), model: { assetId: 'asset_1', overrides: {}, deleted: [] } },
        { ...model('b'), kind: 'future-node' },
      ],
    }
    const { document, dropped } = loadSceneDocument(full)
    expect(document.nodes.map(node => node.id)).toEqual(['a'])
    expect(document.dataSources).toEqual([])
    expect(document.effects).toEqual([])
    expect(dropped).toHaveLength(1)
  })

  it('scenes saved before weather existed open with clear weather', () => {
    const document = documentWith(model('a'))
    const { weather: _weather, ...settings } = document.settings
    const loaded = loadSceneDocument({ ...document, settings }).document
    expect(loaded.settings.weather).toEqual({ kind: 'none', intensity: 0.6 })
  })

  it('keeps the weather it saved', () => {
    const document = documentWith(model('a'))
    document.settings.weather = { kind: 'snow', intensity: 0.4 }
    expect(loadSceneDocument(JSON.parse(JSON.stringify(document))).document.settings.weather).toEqual({
      kind: 'snow',
      intensity: 0.4,
    })
  })
})

describe('scene presets', () => {
  it('change the look but leave the ground and weather alone', () => {
    const settings = createEmptyDocument('p', '场景').settings
    settings.weather = { kind: 'rain', intensity: 0.8 }
    for (const preset of scenePresets) {
      const next = preset.apply(settings)
      expect(next.ground).toEqual(settings.ground)
      expect(next.weather).toEqual(settings.weather)
      // 预设的结果仍然是合法的场景设置。
      expect(() => loadSceneDocument({ ...createEmptyDocument('p', '场景'), settings: next })).not.toThrow()
    }
  })
})

describe('scene edits', () => {
  it('removing a node removes its subtree and device bindings, and unlinks panels', () => {
    const document = documentWith(model('a'), model('b'), panelGroup('labels'), panel('p', 'labels', 'a'))
    groupNodes(document, ['a'])
    const group = document.nodes.find(node => node.kind === 'group')!
    document.bindings = [
      { id: 'b', target: { type: 'asset-instance', instanceId: 'a' }, device: { id: 'D', name: 'D' }, variables: [] },
    ]
    removeNodes(document, [group.id])
    expect(document.nodes.map(node => node.id)).toEqual(['b', 'labels', 'p'])
    expect(document.bindings).toEqual([])
    expect(nodeById(document, 'p')).toMatchObject({ panel: {} })
    expect(nodeById(document, 'p')).not.toHaveProperty('panel.targetNodeId')
  })

  it('removing a panel group removes its panels', () => {
    const document = documentWith(panelGroup('labels'), panel('p', 'labels'))
    removeNodes(document, ['labels'])
    expect(document.nodes).toEqual([])
  })

  it('duplicating does not copy device bindings', () => {
    const document = documentWith(model('a'))
    document.bindings = [
      { id: 'b', target: { type: 'asset-instance', instanceId: 'a' }, device: { id: 'D', name: 'D' }, variables: [] },
    ]
    const [copy] = duplicateNodes(document, ['a'], [5, 0, 0])
    expect(document.nodes.find(node => node.id === copy)?.transform.position).toEqual([5, 0, 0])
    expect(document.bindings).toHaveLength(1)
  })

  it('a copied panel links to the copy of its object when both are copied', () => {
    const document = documentWith(panelGroup('labels'), panel('p', 'labels', 'a'), model('a'))
    const [copyOfPanel] = duplicateNodes(document, ['p'], [1, 0, 0])
    expect(nodeById(document, copyOfPanel!)).toMatchObject({ parentId: 'labels', panel: { targetNodeId: 'a' } })
    const group = groupNodes(document, ['a'])!
    expect(group).toBeTruthy()
  })

  it('panels stay inside panel groups', () => {
    const document = documentWith(panelGroup('labels'), panel('p', 'labels'), model('a'))
    reparentNodes(document, ['p'], null)
    expect(nodeById(document, 'p')?.parentId).toBe('labels')
    reparentNodes(document, ['a'], 'labels')
    expect(nodeById(document, 'a')?.parentId).toBeNull()
    expect(groupNodes(document, ['p'])).toBeNull()
    expect(canParent('panel-group', 'panel')).toBe(true)
    expect(canParent(null, 'panel')).toBe(false)
    expect(canParent('panel-group', 'model')).toBe(false)
  })

  it('rejects a scene with a panel outside a panel group', () => {
    const document = documentWith(panel('p', null))
    expect(() => loadSceneDocument(document)).toThrow(SceneDocumentError)
    expect(() => loadSceneDocument(documentWith(panelGroup('labels'), panel('p', 'labels')))).not.toThrow()
  })

  it('grouping and reparenting keep objects where they are in the world', () => {
    const document = documentWith(model('a', [10, 0, 0]), model('b', [20, 0, 4]))
    const before = worldMatrixOf(document, 'a').toArray()
    const group = groupNodes(document, ['a', 'b'])!
    expect(worldMatrixOf(document, 'a').toArray()).toEqual(before)
    reparentNodes(document, ['a'], null)
    expect(worldMatrixOf(document, 'a').toArray()).toEqual(before)
    ungroupNodes(document, [group])
    expect(document.nodes.some(node => node.kind === 'group')).toBe(false)
  })
})
