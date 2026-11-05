import { describe, expect, it } from 'vitest'
import {
  createEmptyDocument,
  duplicateNodes,
  groupNodes,
  removeNodes,
  reparentNodes,
  ungroupNodes,
  worldMatrixOf,
} from '../src/document/sceneOps'
import { loadSceneDocument, SceneDocumentError, SceneDocumentVersionError } from '../src/domain/scene'
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

function documentWith(...nodes: SceneNodeV2[]): SceneDocumentV2 {
  return { ...createEmptyDocument('p', '场景'), nodes }
}

describe('loadSceneDocument', () => {
  it('reads what it writes', () => {
    const document = documentWith(model('a'))
    expect(loadSceneDocument(JSON.parse(JSON.stringify(document))).document).toEqual(document)
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
      effects: [{ id: 'e' }],
      tours: [],
      dataSources: [{ id: 'old', name: '演示', type: 'mock', enabled: true }],
      nodes: [
        { ...model('a'), model: { assetId: 'asset_1', overrides: {}, deleted: [] } },
        { ...model('b'), kind: 'label', label: { text: 'x' } },
      ],
    }
    const { document, dropped } = loadSceneDocument(full)
    expect(document.nodes.map(node => node.id)).toEqual(['a'])
    expect(document.dataSources).toEqual([])
    expect(document).not.toHaveProperty('effects')
    expect(document.panels).toEqual([])
    expect(dropped).toHaveLength(1)
  })
})

describe('scene edits', () => {
  it('removing a node removes its subtree, device bindings and panel instances', () => {
    const document = documentWith(model('a'), model('b'))
    groupNodes(document, ['a'])
    const group = document.nodes.find(node => node.kind === 'group')!
    document.bindings = [
      { id: 'b', target: { type: 'asset-instance', instanceId: 'a' }, device: { id: 'D', name: 'D' }, variables: [] },
    ]
    document.panels = [{ id: 'p', templateId: 't', nodeId: 'a' }]
    removeNodes(document, [group.id])
    expect(document.nodes.map(node => node.id)).toEqual(['b'])
    expect(document.bindings).toEqual([])
    expect(document.panels).toEqual([])
  })

  it('duplicating keeps panel instances but not device bindings', () => {
    const document = documentWith(model('a'))
    document.bindings = [
      { id: 'b', target: { type: 'asset-instance', instanceId: 'a' }, device: { id: 'D', name: 'D' }, variables: [] },
    ]
    document.panels = [{ id: 'p', templateId: 't', nodeId: 'a', title: '自定义' }]
    const [copy] = duplicateNodes(document, ['a'], [5, 0, 0])
    expect(document.nodes.find(node => node.id === copy)?.transform.position).toEqual([5, 0, 0])
    expect(document.bindings).toHaveLength(1)
    expect(document.panels.find(panel => panel.nodeId === copy)).toMatchObject({ templateId: 't', title: '自定义' })
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
