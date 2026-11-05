import {
  newId,
  nodeById,
  type PanelField,
  type PanelInstance,
  type PanelTemplate,
  type SceneDocumentV2,
  targetForNode,
  twinBindingTargetKey,
  type TwinVariableDefinition,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'
import { writeDevice } from './DeviceData'

/** 现成的模板。只定义要展示哪些变量，数值来自设备绑定的数据接口。 */
const CABINET_FIELDS: ReadonlyArray<Omit<PanelField, 'id'>> = [
  { label: '电量', variableKey: 'soc', unit: '%' },
  { label: '功率', variableKey: 'power', unit: 'kW' },
  { label: '温度', variableKey: 'temperature', unit: '℃' },
  { label: '状态', variableKey: 'status' },
]

function variableFor(field: PanelField): TwinVariableDefinition {
  return {
    id: newId('variable'),
    key: field.variableKey,
    name: field.label,
    dataType: field.unit ? 'number' : 'string',
    ...(field.unit ? { unit: field.unit } : {}),
  }
}

function templateOf(draft: SceneDocumentV2, id: string): PanelTemplate | undefined {
  return draft.panelTemplates.find(template => template.id === id)
}

/** 绑定缺模板字段里的变量时补上：改模板不用逐个改设备。 */
function syncVariables(draft: SceneDocumentV2, template: PanelTemplate): void {
  for (const panel of draft.panels) {
    if (panel.templateId !== template.id) continue
    const node = nodeById(draft, panel.nodeId)
    if (!node) continue
    const key = twinBindingTargetKey(targetForNode(node))
    const binding = draft.bindings.find(item => twinBindingTargetKey(item.target) === key)
    if (!binding) continue
    for (const field of template.fields) {
      if (field.variableKey && !binding.variables.some(variable => variable.key === field.variableKey))
        binding.variables.push(variableFor(field))
    }
  }
}

/** 把实例所在节点绑到设备上，变量按模板字段补齐。写给 Immer 草稿用。 */
function assignDevice(draft: SceneDocumentV2, panel: PanelInstance, deviceId: string): void {
  const node = nodeById(draft, panel.nodeId)
  const template = templateOf(draft, panel.templateId)
  if (!node || !template) return
  const key = twinBindingTargetKey(targetForNode(node))
  const current = draft.bindings.find(item => twinBindingTargetKey(item.target) === key)
  const text = deviceId.trim()
  if (!text) {
    draft.bindings = draft.bindings.filter(binding => binding !== current)
    return
  }
  const variables = [...(current?.variables ?? [])]
  for (const field of template.fields) {
    if (field.variableKey && !variables.some(variable => variable.key === field.variableKey))
      variables.push(variableFor(field))
  }
  writeDevice(draft, node.id, { id: text, name: current?.device.name || node.name }, variables)
}

/**
 * 数据面板，结构和预制体一样：改模板，所有实例一起变；实例只记录和模板不同的地方。
 * 一个节点只挂一个实例。
 */
export class PanelManager {
  constructor(private readonly session: EditorSession) {}

  private get doc(): SceneDocumentV2 {
    return this.session.doc.value
  }

  instancesOf(templateId: string): PanelInstance[] {
    return this.doc.panels.filter(panel => panel.templateId === templateId)
  }

  instanceOn(nodeId: string): PanelInstance | undefined {
    return this.doc.panels.find(panel => panel.nodeId === nodeId)
  }

  // ---------------------------------------------------------------- 模板

  addTemplate(preset: 'blank' | 'cabinet' = 'blank'): string {
    const id = newId('template')
    this.session.edit('新建面板模板', draft => {
      draft.panelTemplates.push({
        id,
        name: preset === 'cabinet' ? '储能柜' : `面板 ${draft.panelTemplates.length + 1}`,
        title: '',
        fields: preset === 'cabinet' ? CABINET_FIELDS.map(field => ({ ...field, id: newId('field') })) : [],
      })
    })
    return id
  }

  updateTemplate(id: string, patch: Partial<Pick<PanelTemplate, 'name' | 'title'>>): void {
    this.session.edit('修改面板模板', draft => {
      const template = templateOf(draft, id)
      if (template) Object.assign(template, patch)
    })
  }

  /** 删除模板，连带删除它的所有实例。 */
  removeTemplate(id: string): void {
    this.session.edit('删除面板模板', draft => {
      draft.panelTemplates = draft.panelTemplates.filter(template => template.id !== id)
      draft.panels = draft.panels.filter(panel => panel.templateId !== id)
    })
  }

  addField(templateId: string): void {
    this.session.edit('添加面板字段', draft => {
      const template = templateOf(draft, templateId)
      if (!template) return
      const index = template.fields.length + 1
      template.fields.push({ id: newId('field'), label: `字段 ${index}`, variableKey: `var${index}` })
      syncVariables(draft, template)
    })
  }

  updateField(templateId: string, fieldId: string, patch: Partial<Omit<PanelField, 'id'>>): void {
    this.session.edit('修改面板字段', draft => {
      const template = templateOf(draft, templateId)
      const field = template?.fields.find(item => item.id === fieldId)
      if (!template || !field) return
      if (patch.unit === '') delete field.unit
      const { unit, ...rest } = patch
      Object.assign(field, rest, unit ? { unit } : {})
      syncVariables(draft, template)
    })
  }

  removeField(templateId: string, fieldId: string): void {
    this.session.edit('删除面板字段', draft => {
      const template = templateOf(draft, templateId)
      if (!template) return
      template.fields = template.fields.filter(field => field.id !== fieldId)
      for (const panel of draft.panels) {
        if (panel.templateId !== templateId || !panel.hiddenFields) continue
        panel.hiddenFields = panel.hiddenFields.filter(id => id !== fieldId)
        if (!panel.hiddenFields.length) delete panel.hiddenFields
      }
    })
  }

  // ---------------------------------------------------------------- 实例

  /** 给一批节点挂上这个模板。已经挂了别的模板的，换成这个。 */
  addInstances(templateId: string, nodeIds: readonly string[]): void {
    if (!nodeIds.length) return
    this.session.edit('添加面板实例', draft => {
      const template = templateOf(draft, templateId)
      if (!template) return
      for (const nodeId of nodeIds) {
        const existing = draft.panels.find(panel => panel.nodeId === nodeId)
        if (existing?.templateId === templateId) continue
        if (existing) draft.panels = draft.panels.filter(panel => panel !== existing)
        draft.panels.push({ id: newId('panel'), templateId, nodeId })
      }
      syncVariables(draft, template)
    })
  }

  removeInstances(ids: readonly string[]): void {
    this.session.edit('移除面板实例', draft => {
      draft.panels = draft.panels.filter(panel => !ids.includes(panel.id))
    })
  }

  /** 覆盖实例的标题；空字符串表示跟随模板。 */
  setInstanceTitle(id: string, title: string): void {
    this.session.edit('修改面板实例', draft => {
      const panel = draft.panels.find(item => item.id === id)
      if (!panel) return
      if (title.trim()) panel.title = title.trim()
      else delete panel.title
    })
  }

  toggleInstanceField(id: string, fieldId: string): void {
    this.session.edit('修改面板实例', draft => {
      const panel = draft.panels.find(item => item.id === id)
      if (!panel) return
      const hidden = new Set(panel.hiddenFields ?? [])
      if (hidden.has(fieldId)) hidden.delete(fieldId)
      else hidden.add(fieldId)
      if (hidden.size) panel.hiddenFields = [...hidden]
      else delete panel.hiddenFields
    })
  }

  /** 去掉实例的覆盖，恢复成和模板一样。 */
  resetInstance(id: string): void {
    this.session.edit('恢复面板实例', draft => {
      const panel = draft.panels.find(item => item.id === id)
      if (!panel) return
      delete panel.title
      delete panel.hiddenFields
    })
  }

  /** 设置实例对应的设备编号；变量按模板字段生成。空字符串表示解除绑定。 */
  setInstanceDevice(id: string, deviceId: string): void {
    this.session.edit('设置面板设备', draft => {
      const panel = draft.panels.find(item => item.id === id)
      if (panel) assignDevice(draft, panel, deviceId)
    })
  }

  /** 按实例顺序批量编号：前缀 ESS-、起始 1，得到 ESS-001、ESS-002……一步撤销。 */
  numberDevices(templateId: string, prefix: string, start: number): void {
    this.session.edit('批量设置设备编号', draft => {
      draft.panels
        .filter(panel => panel.templateId === templateId)
        .forEach((panel, index) => {
          assignDevice(draft, panel, `${prefix}${String(start + index).padStart(3, '0')}`)
        })
    })
  }
}
