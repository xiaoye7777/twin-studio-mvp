import type { z } from 'zod'
import { TwinBindingTargetSchema } from './schema'

export type TwinBindingTarget = z.infer<typeof TwinBindingTargetSchema>

export function twinBindingTargetKey(target: TwinBindingTarget): string {
  if (target.type === 'asset-instance') return `asset-instance:${target.instanceId}`
  if (target.type === 'asset-node') return `asset-node:${target.instanceId}:${target.assetNodeId}`
  if (target.type === 'node') return `node:${target.nodeId}`
  return `primitive:${target.nodeId}`
}

/** The id of the scene node a target lives on (a model part resolves to its model). */
export function targetNodeId(target: TwinBindingTarget): string {
  return target.type === 'asset-instance' || target.type === 'asset-node' ? target.instanceId : target.nodeId
}

/** The canonical target for a whole scene node, as bindings write it. */
export function targetForNode(node: { id: string; kind: string }): TwinBindingTarget {
  if (node.kind === 'model') return { type: 'asset-instance', instanceId: node.id }
  return { type: 'node', nodeId: node.id }
}

export function isTwinBindingTarget(value: unknown): value is TwinBindingTarget {
  return TwinBindingTargetSchema.safeParse(value).success
}
