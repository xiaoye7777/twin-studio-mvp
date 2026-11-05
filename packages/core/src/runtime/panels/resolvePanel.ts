/*
 * 算出一个节点的面板此刻要显示什么：模板决定字段，实例决定覆盖，设备绑定提供数值。
 * 编辑器的预览和 Viewer SDK 都用它，再由同一个面板组件画出来。
 */
import type { SceneDocumentV2, SceneNodeV2 } from '../../domain/scene'
import { targetForNode, type TwinBinding, type TwinRuntimeValue } from '../../domain/twin'
import { formatRuntimeValue } from '../twin/formatValue'

export interface PanelRow {
  id: string
  label: string
  /** 已格式化好的文字；没有数据时是「—」。 */
  value: string
}

export interface PanelView {
  instanceId: string
  templateId: string
  nodeId: string
  title: string
  rows: PanelRow[]
}

/** 读数据需要的最小接口（运行时状态满足它）。 */
export interface PanelDataReader {
  getBindingByTarget(target: TwinBinding['target']): TwinBinding | null
  getRuntimeValue(bindingId: string, variableKey: string): TwinRuntimeValue | null
}

/** 这个节点挂的面板实例；节点自己没有就看外层分组（给分组挂一个，里面的模型共用）。 */
export function panelInstanceFor(document: SceneDocumentV2, nodeId: string) {
  const byId = new Map(document.nodes.map(node => [node.id, node]))
  for (let node: SceneNodeV2 | undefined = byId.get(nodeId); node; node = byId.get(node.parentId ?? '')) {
    const instance = document.panels.find(item => item.nodeId === node!.id)
    if (instance) return instance
  }
  return null
}

export function resolvePanel(document: SceneDocumentV2, data: PanelDataReader, nodeId: string): PanelView | null {
  const instance = panelInstanceFor(document, nodeId)
  if (!instance) return null
  const template = document.panelTemplates.find(item => item.id === instance.templateId)
  const owner = document.nodes.find(node => node.id === instance.nodeId)
  if (!template || !owner) return null
  const binding = data.getBindingByTarget(targetForNode(owner))
  const hidden = new Set(instance.hiddenFields ?? [])
  return {
    instanceId: instance.id,
    templateId: template.id,
    nodeId: owner.id,
    title: instance.title ?? (template.title || binding?.device.name || owner.name),
    rows: template.fields
      .filter(field => !hidden.has(field.id))
      .map(field => {
        const live = binding ? data.getRuntimeValue(binding.id, field.variableKey) : null
        const unit = field.unit ?? binding?.variables.find(item => item.key === field.variableKey)?.unit
        return { id: field.id, label: field.label, value: formatRuntimeValue(live?.value, unit) }
      }),
  }
}
