import { Box3, Matrix4, Vector3 } from 'three'
import {
  canParent,
  duplicateNodes,
  groupNodes,
  identityTransform,
  newId,
  nodeById,
  plain,
  removeNodes,
  reparentNodes,
  type SceneNodeV2,
  type SceneTransform,
  subtreeIds,
  topmost,
  transformOf,
  ungroupNodes,
  uniqueName,
  worldMatrixOf,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/**
 * 场景里的对象：添加模型和分组、改属性、显隐、锁定、删除、复制粘贴、组合、调整层级、放到地面。
 * 所有操作都通过 session.edit() 成为一步可撤销的修改。
 */
export class NodeEditing {
  /** 复制的节点，以及它们的中心（「粘贴到这里」要用）。 */
  private clipboard: { nodes: SceneNodeV2[]; center: Vector3 | null } | null = null

  constructor(private readonly session: EditorSession) {}

  /** 新对象放进当前选中的分组（如果选中的是分组）。 */
  private insertionParent(): string | null {
    const selected = this.session.selectedNodes
    return selected.length === 1 && selected[0]!.kind === 'group' ? selected[0]!.id : null
  }

  /** 把模型放到世界坐标 at；没给就放在相机看着的地面上。 */
  addModel(assetId: string, name: string, at?: Vector3 | null, scale = 1): string {
    const id = newId('instance')
    const place = at?.clone() ?? this.session.engine.rig.controls.getTarget(new Vector3()).setY(0)
    const parentId = this.insertionParent()
    this.session.edit('添加模型', draft => {
      const world = new Matrix4().makeTranslation(place.x, place.y, place.z)
      const transform = transformOf(worldMatrixOf(draft, parentId).invert().multiply(world))
      const node: SceneNodeV2 = {
        id,
        parentId,
        name: uniqueName(draft, name),
        kind: 'model',
        visible: true,
        locked: false,
        transform: { ...transform, scale: [scale, scale, scale] },
        model: { assetId },
      }
      draft.nodes.push(node)
    })
    this.session.select([id])
    return id
  }

  addGroup(): void {
    const id = newId('group')
    const parentId = this.insertionParent()
    this.session.edit('新建分组', draft => {
      draft.nodes.push({
        id,
        parentId,
        name: uniqueName(draft, '分组'),
        kind: 'group',
        visible: true,
        locked: false,
        transform: identityTransform(),
      })
    })
    this.session.select([id])
  }

  rename(id: string, name: string): void {
    const text = name.trim()
    if (!text) return
    this.session.edit('重命名', draft => {
      const node = nodeById(draft, id)
      if (node) node.name = text
    })
  }

  setVisible(ids: readonly string[], visible: boolean): void {
    this.session.edit(visible ? '显示' : '隐藏', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.visible = visible
      }
    })
  }

  setLocked(ids: readonly string[], locked: boolean): void {
    this.session.edit(locked ? '锁定' : '解锁', draft => {
      for (const id of ids) {
        const node = nodeById(draft, id)
        if (node) node.locked = locked
      }
    })
    this.session.refreshSelectionVisuals()
  }

  toggleVisibilityOfSelection(): void {
    const nodes = this.session.selectedNodes
    if (nodes.length)
      this.setVisible(
        nodes.map(node => node.id),
        !nodes.every(node => node.visible),
      )
  }

  /** 改变换的一个分量。连续拖动数值合并成一步撤销。 */
  setTransformValue(id: string, key: keyof SceneTransform, axis: number, value: number): void {
    this.session.edit(
      '修改变换',
      draft => {
        const node = nodeById(draft, id)
        if (node) node.transform[key][axis] = value
      },
      { coalesceKey: `transform:${id}:${key}:${axis}` },
    )
  }

  deleteSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    this.session.edit(`删除 ${ids.length} 个对象`, draft => void removeNodes(draft, ids))
    this.session.clearSelection()
  }

  duplicateSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    let created: string[] = []
    this.session.edit('复制', draft => void (created = duplicateNodes(draft, ids, [2, 0, 2])))
    this.session.select(created)
  }

  copySelection(): void {
    const doc = this.session.doc.value
    const ids = topmost(doc, this.session.selection.value)
    if (!ids.length) return
    const included = new Set(ids.flatMap(id => [...subtreeIds(doc, id)]))
    const bounds = new Box3()
    for (const id of ids) {
      const object = this.session.sync.objectFor(id)
      if (object) bounds.expandByObject(object, true)
    }
    this.clipboard = {
      nodes: plain(doc.nodes.filter(node => included.has(node.id))),
      center: bounds.isEmpty() ? null : bounds.getCenter(new Vector3()),
    }
    this.session.ui.hasClipboard = true
  }

  /** 粘贴到原来的旁边，或以场景里的一个点为中心（右键 → 粘贴到这里）。设备绑定不跟着复制。 */
  paste(at?: Vector3 | null): void {
    const clip = this.clipboard
    if (!clip) return
    const remap = new Map(clip.nodes.map(node => [node.id, newId(node.kind === 'model' ? 'instance' : 'node')]))
    const roots: string[] = []
    this.session.edit('粘贴', draft => {
      const parentOf = (original: SceneNodeV2) =>
        original.parentId && !remap.has(original.parentId) && nodeById(draft, original.parentId)
          ? original.parentId
          : null
      const top = clip.nodes.filter(node => !node.parentId || !remap.has(node.parentId))
      const world = (node: SceneNodeV2) =>
        new Vector3(...node.transform.position).applyMatrix4(worldMatrixOf(draft, parentOf(node)))
      const center =
        clip.center ?? top.reduce((sum, node) => sum.add(world(node)), new Vector3()).divideScalar(top.length || 1)
      const shift = at ? new Vector3(at.x - center.x, 0, at.z - center.z) : new Vector3(3, 0, 3)
      for (const original of clip.nodes) {
        const node = plain(original)
        node.id = remap.get(original.id)!
        const parentInClip = original.parentId ? remap.get(original.parentId) : undefined
        node.parentId = parentInClip ?? parentOf(original)
        // 面板的标签组已经被删掉时，这个面板没有地方放。
        const parentKind = node.parentId ? (nodeById(draft, node.parentId)?.kind ?? 'group') : null
        if (!parentInClip && !canParent(parentKind, node.kind)) continue
        if (!parentInClip) {
          node.name = uniqueName(draft, node.name)
          const target = world(original).add(shift).applyMatrix4(worldMatrixOf(draft, node.parentId).invert())
          node.transform.position = [target.x, target.y, target.z]
          roots.push(node.id)
        }
        if (node.kind === 'panel' && node.panel.targetNodeId)
          node.panel.targetNodeId = remap.get(node.panel.targetNodeId) ?? node.panel.targetNodeId
        draft.nodes.push(node)
      }
    })
    this.session.select(roots)
  }

  groupSelection(): void {
    let group: string | null = null
    this.session.edit('组合', draft => void (group = groupNodes(draft, this.session.selection.value)))
    if (group) this.session.select([group])
  }

  ungroupSelection(): void {
    const groups = this.session.selectedNodes.filter(node => node.kind === 'group').map(node => node.id)
    if (!groups.length) return
    let freed: string[] = []
    this.session.edit('取消组合', draft => void (freed = ungroupNodes(draft, groups)))
    this.session.select(freed)
  }

  /** 把节点移到另一个父节点下，或另一个节点前面；世界坐标不变。 */
  reparent(ids: readonly string[], parentId: string | null, beforeId?: string): void {
    this.session.edit('调整层级', draft => reparentNodes(draft, ids, parentId, beforeId))
  }

  /** 把选中的对象放到地面上。面板不算：它就是飘在空中的。 */
  dropToGround(): void {
    const doc = this.session.doc.value
    const ids = topmost(doc, this.session.selection.value).filter(id => nodeById(doc, id)?.kind !== 'panel')
    const offsets = ids.map(id => {
      const object = this.session.sync.objectFor(id)
      const box = object ? new Box3().setFromObject(object, true) : null
      return box && !box.isEmpty() ? -box.min.y : 0
    })
    this.session.edit('放到地面', draft => {
      ids.forEach((id, index) => {
        const node = nodeById(draft, id)
        const offset = offsets[index] ?? 0
        if (!node || Math.abs(offset) < 1e-6) return
        const world = worldMatrixOf(draft, id).premultiply(new Matrix4().makeTranslation(0, offset, 0))
        node.transform = transformOf(worldMatrixOf(draft, node.parentId).invert().multiply(world))
      })
    })
  }
}
