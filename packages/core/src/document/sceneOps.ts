/*
 * 场景文档上的编辑操作（纯函数）：新建空文档、查找节点、删除（连带删掉引用它的绑定）、复制、
 * 组合 / 取消组合、调整父子关系（保持世界坐标不变）。
 * 写给 Immer 草稿用（会原地修改），也可以用在普通的拷贝上。
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import {
  canParent,
  createDefaultSceneSettingsV2,
  type SceneDocumentV2,
  type SceneNodeV2,
  type SceneTransform,
} from '../domain/scene'
import { targetNodeId } from '../domain/twin'

type Doc = SceneDocumentV2
type Node = SceneNodeV2
type Transform = SceneTransform

export const identityTransform = (): Transform => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })

/** A detached deep copy of document data (works on Immer drafts, unlike structuredClone). */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function createEmptyDocument(projectId: string, name: string): Doc {
  return {
    version: 2,
    projectId,
    metadata: { name, updatedAt: new Date().toISOString() },
    dataSources: [],
    settings: createDefaultSceneSettingsV2(),
    nodes: [],
    bindings: [],
    bookmarks: [],
  }
}

// ---------------------------------------------------------------- hierarchy

export function nodeById(doc: Doc, id: string): Node | undefined {
  return doc.nodes.find(node => node.id === id)
}

export function childrenOf(doc: Doc, parentId: string | null): Node[] {
  return doc.nodes.filter(node => node.parentId === parentId)
}

/** The node and everything below it. */
export function subtreeIds(doc: Doc, id: string): Set<string> {
  const result = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const node of doc.nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        grew = true
      }
    }
  }
  return result
}

/** Ancestors from the root down to (excluding) the node. */
export function ancestorIds(doc: Doc, id: string): string[] {
  const chain: string[] = []
  let current = nodeById(doc, id)?.parentId ?? null
  while (current) {
    chain.unshift(current)
    current = nodeById(doc, current)?.parentId ?? null
  }
  return chain
}

/** Drops ids whose ancestor is also in the list, so operations apply once per subtree. */
export function topmost(doc: Doc, ids: readonly string[]): string[] {
  const set = new Set(ids)
  return ids.filter(id => !ancestorIds(doc, id).some(ancestor => set.has(ancestor)))
}

export function isLockedOrHidden(doc: Doc, id: string): { locked: boolean; hidden: boolean } {
  let locked = false
  let hidden = false
  for (const nodeId of [...ancestorIds(doc, id), id]) {
    const node = nodeById(doc, nodeId)
    if (node?.locked) locked = true
    if (node && !node.visible) hidden = true
  }
  return { locked, hidden }
}

// ---------------------------------------------------------------- transforms

export function matrixOf(transform: Transform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation)),
    new Vector3(...transform.scale),
  )
}

export function transformOf(matrix: Matrix4): Transform {
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  const euler = new Euler().setFromQuaternion(quaternion)
  const round = (value: number) => Math.round(value * 1e5) / 1e5
  return {
    position: [round(position.x), round(position.y), round(position.z)],
    rotation: [round(euler.x), round(euler.y), round(euler.z)],
    scale: [round(scale.x), round(scale.y), round(scale.z)],
  }
}

/** A node's world matrix, composed from the document alone. */
export function worldMatrixOf(doc: Doc, id: string | null): Matrix4 {
  const matrix = new Matrix4()
  if (!id) return matrix
  for (const nodeId of [...ancestorIds(doc, id), id]) {
    const node = nodeById(doc, nodeId)
    if (node) matrix.multiply(matrixOf(node.transform))
  }
  return matrix
}

// ---------------------------------------------------------------- edits (on Immer drafts)

/** 删除节点和它的子树，连带删掉绑在上面的设备；关联了被删对象的面板解除关联。返回删除的 id。 */
export function removeNodes(draft: Doc, ids: readonly string[]): Set<string> {
  const removed = new Set<string>()
  for (const id of ids) for (const nodeId of subtreeIds(draft, id)) removed.add(nodeId)
  draft.nodes = draft.nodes.filter(node => !removed.has(node.id))
  draft.bindings = draft.bindings.filter(binding => !removed.has(targetNodeId(binding.target)))
  for (const node of draft.nodes) {
    if (node.kind === 'panel' && node.panel.targetNodeId && removed.has(node.panel.targetNodeId))
      delete node.panel.targetNodeId
  }
  return removed
}

/**
 * 复制节点（含子树）放在原节点后面。设备绑定不跟（一台设备只在一个地方）。
 * 面板和它关联的对象一起复制时，副本关联副本。返回新的顶层 id。
 */
export function duplicateNodes(draft: Doc, ids: readonly string[], offset: [number, number, number]): string[] {
  const top = topmost(draft, ids)
  const created: string[] = []
  const remap = new Map<string, string>()
  for (const id of top) {
    const subtree = subtreeIds(draft, id)
    const originals = draft.nodes.filter(node => subtree.has(node.id))
    for (const node of originals) remap.set(node.id, newId(node.kind === 'model' ? 'instance' : 'node'))
    const copies = originals.map(node => {
      const copy = plain(node) as Node
      copy.id = remap.get(node.id)!
      copy.parentId = node.id === id ? node.parentId : remap.get(node.parentId!)!
      if (node.id === id) {
        copy.name = uniqueName(draft, `${node.name}`)
        copy.transform.position = copy.transform.position.map((value, axis) => value + offset[axis]!) as [
          number,
          number,
          number,
        ]
      }
      return copy
    })
    const last = Math.max(...originals.map(node => draft.nodes.findIndex(item => item.id === node.id)))
    draft.nodes.splice(last + 1, 0, ...copies)
    created.push(remap.get(id)!)
  }
  for (const copyId of remap.values()) {
    const copy = nodeById(draft, copyId)
    const target = copy?.kind === 'panel' ? copy.panel.targetNodeId : undefined
    if (copy?.kind === 'panel' && target && remap.has(target)) copy.panel.targetNodeId = remap.get(target)!
  }
  return created
}

export function uniqueName(doc: Doc, base: string): string {
  const names = new Set(doc.nodes.map(node => node.name))
  const stem = base.replace(/\s\d+$/, '')
  if (!names.has(base)) return base
  for (let index = 2; ; index++) if (!names.has(`${stem} ${index}`)) return `${stem} ${index}`
}

/** Moves nodes under a new parent, keeping where they are in the world. */
export function reparentNodes(draft: Doc, ids: readonly string[], parentId: string | null, beforeId?: string): void {
  const parentKind = parentId === null ? null : (nodeById(draft, parentId)?.kind ?? null)
  const moving = topmost(draft, ids).filter(id => {
    if (!canParent(parentKind, nodeById(draft, id)!.kind)) return false
    if (parentId === null) return true
    // Never into itself or its own subtree.
    return !subtreeIds(draft, id).has(parentId)
  })
  if (!moving.length) return
  const parentInverse = worldMatrixOf(draft, parentId).invert()
  for (const id of moving) {
    const node = nodeById(draft, id)!
    const world = worldMatrixOf(draft, id)
    node.transform = transformOf(parentInverse.clone().multiply(world))
    node.parentId = parentId
  }
  // Sibling order: place the moved nodes before `beforeId`, or after the parent's last child.
  const entries = moving.map(id => draft.nodes.find(node => node.id === id)!)
  draft.nodes = draft.nodes.filter(node => !moving.includes(node.id))
  let index = beforeId ? draft.nodes.findIndex(node => node.id === beforeId) : -1
  if (index < 0) {
    const siblings = draft.nodes.map((node, at) => (node.parentId === parentId ? at : -1)).filter(at => at >= 0)
    const parentIndex = parentId ? draft.nodes.findIndex(node => node.id === parentId) : -1
    index = Math.max(parentIndex, ...siblings) + 1
  }
  draft.nodes.splice(index, 0, ...entries)
}

/** Wraps nodes in a new group placed at their centre. Returns the group id. */
export function groupNodes(draft: Doc, ids: readonly string[], name = '分组'): string | null {
  // 面板只能待在标签组里，不参与编组。
  const top = topmost(draft, ids).filter(id => nodeById(draft, id)?.kind !== 'panel')
  if (!top.length) return null
  const parents = new Set(top.map(id => nodeById(draft, id)!.parentId))
  const parentId = parents.size === 1 ? [...parents][0]! : null
  const parentInverse = worldMatrixOf(draft, parentId).invert()
  const center = new Vector3()
  for (const id of top) center.add(new Vector3().setFromMatrixPosition(worldMatrixOf(draft, id)))
  center.divideScalar(top.length).applyMatrix4(parentInverse)
  const group: Node = {
    id: newId('group'),
    kind: 'group',
    parentId,
    name: uniqueName(draft, name),
    transform: { ...identityTransform(), position: [center.x, Math.max(0, center.y), center.z] },
    visible: true,
    locked: false,
  }
  const firstIndex = Math.min(...top.map(id => draft.nodes.findIndex(node => node.id === id)))
  draft.nodes.splice(firstIndex, 0, group)
  reparentNodes(draft, top, group.id)
  return group.id
}

/** Dissolves groups, keeping their children in place. Returns the freed children. */
export function ungroupNodes(draft: Doc, ids: readonly string[]): string[] {
  const freed: string[] = []
  for (const id of ids) {
    const group = nodeById(draft, id)
    if (!group || group.kind !== 'group') continue
    const children = childrenOf(draft, id).map(child => child.id)
    reparentNodes(draft, children, group.parentId, id)
    freed.push(...children)
    removeNodes(draft, [id])
  }
  return freed
}
