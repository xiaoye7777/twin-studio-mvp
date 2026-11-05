import type { ViewerObjectData } from '../../contract/viewerContract'
import type { SceneNodeV2 } from '../../domain/scene'
import { targetForNode, type TwinBinding, type TwinRuntimeValue } from '../../domain/twin'

/** 读数据需要的最小接口（运行时状态满足它）。 */
export interface ObjectDataReader {
  getBindingByTarget(target: TwinBinding['target']): TwinBinding | null
  getRuntimeValue(bindingId: string, variableKey: string): TwinRuntimeValue | null
}

/**
 * 一个节点的数据：节点信息、绑定的设备、每个变量的当前值。
 * owner 是设备绑在哪个节点上，默认是节点自己；关联了对象的面板，设备在被关联的对象上。
 */
export function readObjectData(node: SceneNodeV2, data: ObjectDataReader, owner = node): ViewerObjectData {
  const binding = data.getBindingByTarget(targetForNode(owner))
  return {
    nodeId: node.id,
    name: node.name,
    kind: node.kind,
    device: binding ? { ...binding.device } : null,
    bindingId: binding?.id ?? null,
    values: (binding?.variables ?? []).map(variable => {
      const live = data.getRuntimeValue(binding!.id, variable.key)
      return {
        key: variable.key,
        name: variable.name || variable.key,
        unit: variable.unit,
        value: live?.value ?? null,
        updatedAt: live?.updatedAt ?? null,
      }
    }),
  }
}
