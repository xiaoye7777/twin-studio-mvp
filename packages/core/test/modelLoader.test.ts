import { Group, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { isPartSurface, normalizeAssetNodeIds } from '../src/engine/ModelLoader'

describe('normalizeAssetNodeIds', () => {
  /** 一扇门：文件写了 id，压缩工具插了一层包裹节点，加载器把多材质网格拆成子网格；门上还有一个文件里命名的把手。 */
  function door() {
    const root = new Group()
    const part = new Group()
    part.userData = { name: '电池仓门', assetNodeId: 'ess.door' }
    const wrapper = new Group()
    const surfaces = [new Mesh(), new Mesh()]
    wrapper.add(...surfaces)
    const handle = new Mesh()
    handle.userData = { name: '把手' }
    part.add(wrapper, handle)
    root.add(part)
    normalizeAssetNodeIds(root)
    return { part, wrapper, surfaces, handle }
  }

  it('treats what the file does not name under a part as its surface', () => {
    const { part, wrapper, surfaces } = door()
    expect(part.userData.assetNodeId).toBe('ess.door')
    expect(isPartSurface(part)).toBe(false)
    expect(isPartSurface(wrapper)).toBe(true)
    expect(surfaces.every(isPartSurface)).toBe(true)
  })

  it('keeps nodes the file names as parts of their own', () => {
    expect(isPartSurface(door().handle)).toBe(false)
  })

  it('keeps the id rule scenes were saved with', () => {
    const { wrapper, surfaces, handle } = door()
    expect(wrapper.userData.assetNodeId).toBe('legacy:root/0/0')
    expect(surfaces[1]!.userData.assetNodeId).toBe('legacy:root/0/0/1')
    expect(handle.userData.assetNodeId).toBe('legacy:root/0/1')
  })

  it('leaves models without embedded ids as they were', () => {
    const root = new Group()
    const group = new Group()
    group.add(new Mesh(), new Mesh())
    root.add(group)
    normalizeAssetNodeIds(root)
    expect(group.children.some(isPartSurface)).toBe(false)
  })
})
