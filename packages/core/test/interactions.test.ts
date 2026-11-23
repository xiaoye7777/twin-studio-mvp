import { describe, expect, it } from 'vitest'
import { createEmptyDocument, duplicateNodes, identityTransform, removeNodes } from '../src/document/sceneOps'
import { interactionActionTypes, interactionTriggers, type SceneInteraction } from '../src/domain/interactions'
import { loadSceneDocument } from '../src/domain/scene/sceneVersioning'

function fixture() {
  const doc = createEmptyDocument('project', '储能站')
  for (const id of ['a', 'b'])
    doc.nodes.push({
      id,
      kind: 'model',
      name: id,
      parentId: null,
      visible: true,
      locked: false,
      transform: identityTransform(),
      model: { assetId: 'box' },
    })
  doc.interactions = [
    {
      id: 'r1',
      enabled: true,
      source: { type: 'asset-instance', instanceId: 'a' },
      trigger: 'click',
      action: { type: 'hide', target: { type: 'asset-instance', instanceId: 'b' } },
    },
  ]
  return doc
}

describe('object interactions', () => {
  it('round trips all four triggers and the nine supported actions', () => {
    const doc = fixture()
    doc.interactions = interactionActionTypes.map((type, i): SceneInteraction => ({
      ...doc.interactions![0]!,
      id: String(i),
      trigger: type === 'highlight' ? 'hover-enter' : interactionTriggers[i % 4]!,
      action:
        type === 'emit-event'
          ? { type, eventName: 'open-box', metadata: { box: 1 } }
          : type === 'fly-to-bookmark'
            ? { type, bookmarkId: 'main' }
            : { type },
    }))
    expect(doc.interactions).toHaveLength(9)
    expect(new Set(doc.interactions.map(r => r.trigger)).size).toBe(4)
    expect(loadSceneDocument(doc).document.interactions).toEqual(doc.interactions)
  })
  it('loads older scenes and skips only unsupported tour and animation actions', () => {
    const doc = fixture()
    const { interactions, ...old } = doc
    expect(loadSceneDocument(old).document.interactions).toBeUndefined()
    const extra = ['play-tour', 'stop-tour', 'play-animation', 'stop-animation'].map(type => ({
      ...interactions![0],
      action: { type },
    }))
    const loaded = loadSceneDocument({ ...doc, interactions: [...extra, ...interactions!] })
    expect(loaded.dropped).toHaveLength(4)
    expect(loaded.document.interactions).toEqual(interactions)
  })
  it('remaps source and target together when copied, and removes only rules referencing a deleted node', () => {
    const doc = fixture()
    const [a, b] = duplicateNodes(doc, ['a', 'b'], [1, 0, 0])
    expect(doc.interactions?.[1]).toMatchObject({
      source: { instanceId: a },
      action: { target: { instanceId: b } },
    })
    removeNodes(doc, ['b'])
    expect(doc.interactions?.map(r => r.source)).toEqual([{ type: 'asset-instance', instanceId: a }])
  })
})
