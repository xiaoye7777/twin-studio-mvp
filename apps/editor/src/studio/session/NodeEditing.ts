import { Matrix4, Vector3 } from 'three'
import {
  duplicateNodes,
  groupNodes,
  identityTransform,
  newId,
  nodeById,
  removeNodes,
  reparentNodes,
  type SceneNodeV2,
  type SceneTransform,
  transformOf,
  ungroupNodes,
  uniqueName,
  worldMatrixOf,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/** 场景里的对象：添加模型和分组、改属性、复制、删除、调整层级。 */
export class NodeEditing {
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

  setVisible(id: string, visible: boolean): void {
    this.session.edit(visible ? '显示' : '隐藏', draft => {
      const node = nodeById(draft, id)
      if (node) node.visible = visible
    })
  }

  setLocked(id: string, locked: boolean): void {
    this.session.edit(locked ? '锁定' : '解锁', draft => {
      const node = nodeById(draft, id)
      if (node) node.locked = locked
    })
    this.session.refreshSelectionVisuals()
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

  removeSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    this.session.edit('删除', draft => void removeNodes(draft, ids))
    this.session.select([])
  }

  duplicateSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    let created: string[] = []
    this.session.edit('复制', draft => void (created = duplicateNodes(draft, ids, [2, 0, 2])))
    this.session.select(created)
  }

  groupSelection(): void {
    const ids = this.session.selection.value
    if (!ids.length) return
    let group: string | null = null
    this.session.edit('编组', draft => void (group = groupNodes(draft, ids)))
    if (group) this.session.select([group])
  }

  ungroupSelection(): void {
    const ids = this.session.selection.value
    let freed: string[] = []
    this.session.edit('取消编组', draft => void (freed = ungroupNodes(draft, ids)))
    this.session.select(freed)
  }

  /** 把节点移到另一个分组下，或另一个节点前面；世界坐标不变。 */
  move(ids: readonly string[], parentId: string | null, beforeId?: string): void {
    this.session.edit('调整层级', draft => reparentNodes(draft, ids, parentId, beforeId))
  }
}
