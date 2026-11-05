import { describe, expect, it, vi } from 'vitest'
import { type DocumentChange, DocumentStore } from '../src/document/DocumentStore'
import { createEmptyDocument } from '../src/document/sceneOps'
import { type SceneDocumentV2 } from '../src/domain/scene'

interface Doc {
  title: string
  items: { id: string; value: number }[]
  settings: { grid: boolean }
}
const initial = (): Doc => ({ title: 'park', items: [{ id: 'a', value: 1 }], settings: { grid: true } })

describe('transactions and history', () => {
  it('applies a transaction and records one undo step', () => {
    const store = new DocumentStore(initial())
    expect(store.transaction('rename', d => void (d.title = 'plant'))).toBe(true)
    expect(store.document.title).toBe('plant')
    expect(store.canUndo).toBe(true)
    expect(store.undoLabel).toBe('rename')
  })

  it('undoes and redoes any kind of change', () => {
    const store = new DocumentStore(initial())
    store.transaction('add', d => void d.items.push({ id: 'b', value: 2 }))
    store.transaction('grid off', d => void (d.settings.grid = false))
    store.transaction('remove a', d => void d.items.splice(0, 1))
    expect(store.document).toEqual({ title: 'park', items: [{ id: 'b', value: 2 }], settings: { grid: false } })
    store.undo()
    store.undo()
    expect(store.document).toEqual({
      title: 'park',
      items: [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ],
      settings: { grid: true },
    })
    expect(store.redoLabel).toBe('grid off')
    store.redo()
    store.redo()
    expect(store.document.items).toEqual([{ id: 'b', value: 2 }])
    expect(store.canRedo).toBe(false)
  })

  it('clears redo after a new edit', () => {
    const store = new DocumentStore(initial())
    store.transaction('one', d => void (d.title = '1'))
    store.undo()
    store.transaction('two', d => void (d.title = '2'))
    expect(store.canRedo).toBe(false)
    expect(store.redo()).toBe(false)
  })

  it('ignores transactions that change nothing', () => {
    const store = new DocumentStore(initial())
    expect(store.transaction('same', d => void (d.title = 'park'))).toBe(false)
    expect(store.canUndo).toBe(false)
  })

  it('leaves the document untouched when a recipe throws', () => {
    const store = new DocumentStore(initial())
    const before = store.document
    expect(() =>
      store.transaction('broken', d => {
        d.title = 'half'
        throw new Error('invalid edit')
      }),
    ).toThrow('invalid edit')
    expect(store.document).toBe(before)
    expect(store.canUndo).toBe(false)
  })

  it('keeps at most the configured number of steps', () => {
    const store = new DocumentStore(initial(), 3)
    for (let i = 0; i < 5; i++) store.transaction(`step ${i}`, d => void (d.items[0]!.value = i + 10))
    let undone = 0
    while (store.undo()) undone++
    expect(undone).toBe(3)
    expect(store.document.items[0]!.value).toBe(11)
  })

  it('returns frozen documents and shares unchanged branches', () => {
    const store = new DocumentStore(initial())
    const before = store.document
    expect(Object.isFrozen(before)).toBe(true)
    store.transaction('rename', d => void (d.title = 'x'))
    expect(store.document.settings).toBe(before.settings)
    expect(store.document.items).toBe(before.items)
  })
})

describe('coalescing', () => {
  it('merges a drag into one undo step until sealed', () => {
    const store = new DocumentStore(initial())
    for (const value of [2, 3, 4])
      store.transaction('drag', d => void (d.items[0]!.value = value), { coalesceKey: 'drag:a' })
    store.seal()
    store.transaction('drag', d => void (d.items[0]!.value = 9), { coalesceKey: 'drag:a' })
    store.undo()
    expect(store.document.items[0]!.value).toBe(4)
    store.undo()
    expect(store.document.items[0]!.value).toBe(1)
    expect(store.canUndo).toBe(false)
  })

  it('does not merge different keys or plain transactions', () => {
    const store = new DocumentStore(initial())
    store.transaction('a', d => void (d.title = 'a'), { coalesceKey: 'x' })
    store.transaction('b', d => void (d.title = 'b'), { coalesceKey: 'y' })
    store.transaction('c', d => void (d.title = 'c'))
    store.transaction('d', d => void (d.title = 'd'), { coalesceKey: 'x' })
    let steps = 0
    while (store.undo()) steps++
    expect(steps).toBe(4)
  })

  it('never merges into a step that was undone and redone', () => {
    const store = new DocumentStore(initial())
    store.transaction('drag', d => void (d.items[0]!.value = 2), { coalesceKey: 'k' })
    store.undo()
    store.redo()
    store.transaction('drag', d => void (d.items[0]!.value = 3), { coalesceKey: 'k' })
    store.undo()
    expect(store.document.items[0]!.value).toBe(2)
  })
})

describe('dirty tracking', () => {
  it('follows edits, saves and history navigation', () => {
    const store = new DocumentStore(initial())
    expect(store.isDirty).toBe(false)
    store.transaction('one', d => void (d.title = '1'))
    expect(store.isDirty).toBe(true)
    store.markSaved()
    expect(store.isDirty).toBe(false)
    store.transaction('two', d => void (d.title = '2'))
    expect(store.isDirty).toBe(true)
    store.undo()
    expect(store.isDirty).toBe(false)
    store.undo()
    expect(store.isDirty).toBe(true)
    store.redo()
    expect(store.isDirty).toBe(false)
  })

  it('stays dirty when the saved state falls off the history limit', () => {
    const store = new DocumentStore(initial(), 2)
    for (const title of ['1', '2', '3']) store.transaction(title, d => void (d.title = title))
    while (store.undo());
    expect(store.document.title).toBe('1')
    expect(store.isDirty).toBe(true)
  })

  it('keeps the save point when older steps fall off the history limit', () => {
    const store = new DocumentStore(initial(), 2)
    store.transaction('1', d => void (d.title = '1'))
    store.markSaved()
    store.transaction('2', d => void (d.title = '2'))
    store.transaction('3', d => void (d.title = '3'))
    store.undo()
    store.undo()
    expect([store.document.title, store.isDirty]).toEqual(['1', false])
  })

  it('treats coalesced edits after a save as unsaved', () => {
    const store = new DocumentStore(initial())
    store.transaction('drag', d => void (d.items[0]!.value = 2), { coalesceKey: 'k' })
    store.markSaved()
    store.transaction('drag', d => void (d.items[0]!.value = 3), { coalesceKey: 'k' })
    expect(store.isDirty).toBe(true)
  })

  it('counts a reset document as saved with empty history', () => {
    const store = new DocumentStore(initial())
    store.transaction('one', d => void (d.title = '1'))
    store.reset({ ...initial(), title: 'loaded' })
    expect(store.document.title).toBe('loaded')
    expect([store.isDirty, store.canUndo, store.canRedo]).toEqual([false, false, false])
  })
})

describe('subscriptions', () => {
  it('reports every change with its origin and patches', () => {
    const store = new DocumentStore(initial())
    const changes: DocumentChange<Doc>[] = []
    const stop = store.subscribe(change => changes.push(change))
    store.transaction('rename', d => void (d.title = 'x'))
    store.undo()
    store.redo()
    store.reset(initial())
    stop()
    store.transaction('after stop', d => void (d.title = 'y'))
    expect(changes.map(c => [c.origin, c.label])).toEqual([
      ['transaction', 'rename'],
      ['undo', 'rename'],
      ['redo', 'rename'],
      ['reset', undefined],
    ])
    expect(changes[0]!.patches).toEqual([{ op: 'replace', path: ['title'], value: 'x' }])
    expect(changes[1]!.previous.title).toBe('x')
  })

  it('notifies after the document is updated', () => {
    const store = new DocumentStore(initial())
    const seen = vi.fn()
    store.subscribe(() => seen(store.document.title))
    store.transaction('rename', d => void (d.title = 'x'))
    expect(seen).toHaveBeenCalledWith('x')
  })
})

describe('with a real scene document', () => {
  it('renames a node, moves it and undoes both', () => {
    const id = 'instance_ess-1'
    const scene: SceneDocumentV2 = {
      ...createEmptyDocument('p', '场景'),
      nodes: [
        {
          id,
          parentId: null,
          name: '储能柜 01',
          kind: 'model',
          visible: true,
          locked: false,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          model: { assetId: 'asset_1' },
        },
      ],
    }
    const store = new DocumentStore<SceneDocumentV2>(scene)
    const node = () => store.document.nodes.find(n => n.id === id)!
    store.transaction('重命名', doc => {
      doc.nodes.find(n => n.id === id)!.name = '储能柜 09'
    })
    store.transaction('移动', doc => {
      doc.nodes.find(n => n.id === id)!.transform.position[0] = 42
    })
    expect(node().name).toBe('储能柜 09')
    expect(node().transform.position[0]).toBe(42)
    store.undo()
    store.undo()
    expect(store.document).toEqual(scene)
  })
})
