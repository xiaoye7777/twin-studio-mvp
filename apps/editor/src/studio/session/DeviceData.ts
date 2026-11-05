import {
  type ActiveDataSourceConfig,
  newDataSource,
  newId,
  nodeById,
  plain,
  type ProjectDataSource,
  type SceneDocumentV2,
  type StaticDataSourceConfig,
  targetForNode,
  type TwinBinding,
  twinBindingTargetKey,
  type TwinVariableDefinition,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

export type StaticValue = number | string | boolean

/** 第一个静态数据接口。 */
function staticSourceOf(document: SceneDocumentV2): StaticDataSourceConfig | undefined {
  return document.dataSources?.find((source): source is StaticDataSourceConfig => source.type === 'static')
}

function bindingOf(document: SceneDocumentV2, nodeId: string): TwinBinding | undefined {
  const node = nodeById(document, nodeId)
  if (!node) return undefined
  const key = twinBindingTargetKey(targetForNode(node))
  return document.bindings.find(binding => twinBindingTargetKey(binding.target) === key)
}

/** 把节点绑到设备上；已经绑了就改设备信息。写给 Immer 草稿用。 */
export function writeDevice(
  draft: SceneDocumentV2,
  nodeId: string,
  device: { id: string; name: string },
  variables?: TwinVariableDefinition[],
): void {
  const node = nodeById(draft, nodeId)
  if (!node) return
  const existing = bindingOf(draft, nodeId)
  if (!existing) {
    draft.bindings.push({
      id: newId('binding'),
      target: targetForNode(node),
      device: { ...device },
      variables: variables ?? [],
    })
    return
  }
  // 静态数据按设备编号存：改编号时把值带过去。
  const source = staticSourceOf(draft)
  const values = source?.values[existing.device.id]
  if (source && values && existing.device.id !== device.id) {
    source.values[device.id] = values
    delete source.values[existing.device.id]
  }
  existing.device = { ...existing.device, ...device }
  if (variables) existing.variables = variables
}

/** 设备绑定和数据接口。 */
export class DeviceData {
  constructor(private readonly session: EditorSession) {}

  bindingOf(nodeId: string): TwinBinding | undefined {
    return bindingOf(this.session.doc.value, nodeId)
  }

  // ---------------------------------------------------------------- 设备绑定

  setDevice(nodeId: string, device: { id: string; name: string }): void {
    this.session.edit('绑定设备', draft => writeDevice(draft, nodeId, device))
  }

  removeDevice(nodeId: string): void {
    this.session.edit('解除设备绑定', draft => {
      const existing = bindingOf(draft, nodeId)
      if (existing) draft.bindings = draft.bindings.filter(binding => binding !== existing)
    })
  }

  addVariable(nodeId: string): void {
    this.session.edit('添加变量', draft => {
      const binding = bindingOf(draft, nodeId)
      if (!binding) return
      const key = `var${binding.variables.length + 1}`
      binding.variables.push({ id: newId('variable'), key, name: key, dataType: 'number' })
    })
  }

  updateVariable(nodeId: string, variableId: string, patch: Partial<Omit<TwinVariableDefinition, 'id'>>): void {
    this.session.edit('修改变量', draft => {
      const variable = bindingOf(draft, nodeId)?.variables.find(item => item.id === variableId)
      if (!variable) return
      if (patch.unit === '') delete variable.unit
      const { unit, ...rest } = patch
      Object.assign(variable, rest, unit ? { unit } : {})
    })
  }

  removeVariable(nodeId: string, variableId: string): void {
    this.session.edit('删除变量', draft => {
      const binding = bindingOf(draft, nodeId)
      if (binding) binding.variables = binding.variables.filter(item => item.id !== variableId)
    })
  }

  // ---------------------------------------------------------------- 静态数据

  staticValue(deviceId: string, key: string): StaticValue | undefined {
    return staticSourceOf(this.session.doc.value)?.values[deviceId]?.[key]
  }

  /** 改一个静态值；场景还没有静态数据接口时自动建一个。清空传 undefined。 */
  setStaticValue(deviceId: string, key: string, value: StaticValue | undefined): void {
    this.session.edit('修改静态数据', draft => {
      draft.dataSources ??= []
      let source = staticSourceOf(draft)
      if (!source) {
        if (value === undefined) return
        source = newDataSource('static', newId('source')) as StaticDataSourceConfig
        draft.dataSources.push(source)
      }
      const device = (source.values[deviceId] ??= {})
      if (value === undefined) delete device[key]
      else device[key] = value
    })
  }

  // ---------------------------------------------------------------- 数据接口

  addSource(type: ActiveDataSourceConfig['type']): void {
    this.session.edit('添加数据接口', draft => {
      draft.dataSources ??= []
      draft.dataSources.push(newDataSource(type, newId('source')))
    })
  }

  updateSource(id: string, patch: Partial<ProjectDataSource>): void {
    this.session.edit('修改数据接口', draft => {
      const source = draft.dataSources?.find(item => item.id === id)
      if (source) Object.assign(source, plain(patch))
    })
  }

  removeSource(id: string): void {
    this.session.edit('删除数据接口', draft => {
      draft.dataSources = draft.dataSources?.filter(item => item.id !== id)
    })
  }
}
