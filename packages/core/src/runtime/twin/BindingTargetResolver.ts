/*
 * 绑定目标 ↔ 三维对象：设备绑定用「目标」（某个节点，或某个模型的某个部件）来指对象，
 * 这里负责在场景里找到对应的三维对象，以及反过来从被点到的对象找出它代表的目标。
 */
import type { Object3D } from 'three'
import { targetNodeId, type TwinBindingTarget } from '../../domain/twin'
import { findAssetInstanceRoot, getEditorMetadata } from '../scene/objectMetadata'

/** The binding target an object stands for, or null for unidentified parts. */
export function bindingTargetFromObject(object: Object3D): TwinBindingTarget | null {
  const nodeId: unknown = object.userData.sceneNodeId
  if (object.userData.nodeKind === 'group' && typeof nodeId === 'string') return { type: 'node', nodeId }
  const assetRoot = findAssetInstanceRoot(object)
  const rootMetadata = assetRoot ? getEditorMetadata(assetRoot) : null
  if (!assetRoot || rootMetadata?.kind !== 'assetInstance') return null
  if (object === assetRoot) return { type: 'asset-instance', instanceId: rootMetadata.instanceId }
  const assetNodeId: unknown = object.userData.assetNodeId
  if (typeof assetNodeId !== 'string' || !assetNodeId) return null
  return { type: 'asset-node', instanceId: rootMetadata.instanceId, assetNodeId }
}

/** Finds the object a target refers to through the scene's node index (any depth of grouping). */
export class BindingTargetResolver {
  constructor(private readonly findNode: (nodeId: string) => Object3D | null) {}

  resolve(target: TwinBindingTarget): Object3D | null {
    const root = this.findNode(targetNodeId(target))
    if (!root || target.type !== 'asset-node') return root
    let resolved: Object3D | null = null
    root.traverse(node => {
      if (!resolved && node.userData.assetNodeId === target.assetNodeId) resolved = node
    })
    return resolved
  }
}
