/*
 * 算出一个面板此刻要显示什么：标签组的模板决定字段，面板自己的覆盖决定标题和隐藏项，设备绑定提供数值。
 * 编辑器和 Viewer SDK 都用它，再由 PanelObject 画出来。
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
  nodeId: string
  title: string
  /** 面板宽度（米）。 */
  width: number
  rows: PanelRow[]
}

/** 读数据需要的最小接口（运行时状态满足它）。 */
export interface PanelDataReader {
  getBindingByTarget(target: TwinBinding['target']): TwinBinding | null
  getRuntimeValue(bindingId: string, variableKey: string): TwinRuntimeValue | null
}

/** 设备绑在哪个节点上：面板关联了对象时是那个对象，其他情况都是节点自己。 */
export function dataOwnerOf(document: SceneDocumentV2, node: SceneNodeV2): SceneNodeV2 {
  if (node.kind !== 'panel' || !node.panel.targetNodeId) return node
  return document.nodes.find(item => item.id === node.panel.targetNodeId) ?? node
}

export function resolvePanel(document: SceneDocumentV2, data: PanelDataReader, nodeId: string): PanelView | null {
  const node = document.nodes.find(item => item.id === nodeId)
  if (node?.kind !== 'panel') return null
  const group = document.nodes.find(item => item.id === node.parentId)
  if (group?.kind !== 'panel-group') return null
  const owner = dataOwnerOf(document, node)
  const binding = data.getBindingByTarget(targetForNode(owner))
  const hidden = new Set(node.panel.hiddenFields ?? [])
  return {
    nodeId: node.id,
    title: node.panel.title ?? (group.template.title || binding?.device.name || owner.name),
    width: group.template.width,
    rows: group.template.fields
      .filter(field => !hidden.has(field.id))
      .map(field => {
        const live = binding ? data.getRuntimeValue(binding.id, field.variableKey) : null
        const unit = field.unit ?? binding?.variables.find(item => item.key === field.variableKey)?.unit
        return { id: field.id, label: field.label, value: formatRuntimeValue(live?.value, unit) }
      }),
  }
}
