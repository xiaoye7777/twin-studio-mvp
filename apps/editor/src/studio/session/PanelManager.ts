import { Box3, Matrix4, Vector3 } from 'three'
import {
  createPanelTemplate,
  dataOwnerOf,
  identityTransform,
  newId,
  nodeById,
  type PanelField,
  type PanelGroupNodeV2,
  type PanelNodeV2,
  type PanelTemplate,
  removeNodes,
  type SceneDocumentV2,
  transformOf,
  twinBindingTargetKey,
  targetForNode,
  type TwinVariableDefinition,
  uniqueName,
  worldMatrixOf,
} from '@twin-studio/core'
import type { DeviceTemplate } from '../deviceTemplates'
import type { EditorSession } from '../EditorSession'
import { bindingOf, writeBinding } from './DeviceData'

function variableFor(field: PanelField): TwinVariableDefinition {
  return {
    id: newId('variable'),
    key: field.variableKey,
    name: field.label,
    dataType: field.dataType ?? (field.unit ? 'number' : 'string'),
    ...(field.unit ? { unit: field.unit } : {}),
  }
}

function groupOf(draft: SceneDocumentV2, id: string): PanelGroupNodeV2 | undefined {
  const node = nodeById(draft, id)
  return node?.kind === 'panel-group' ? node : undefined
}

function panelOf(draft: SceneDocumentV2, id: string): PanelNodeV2 | undefined {
  const node = nodeById(draft, id)
  return node?.kind === 'panel' ? node : undefined
}

function panelsIn(draft: SceneDocumentV2, groupId: string): PanelNodeV2[] {
  return draft.nodes.filter((node): node is PanelNodeV2 => node.kind === 'panel' && node.parentId === groupId)
}

/** 面板绑了设备但缺模板字段里的变量时补上：改模板不用逐个改设备。 */
function syncVariables(draft: SceneDocumentV2, group: PanelGroupNodeV2): void {
  for (const panel of panelsIn(draft, group.id)) {
    const binding = bindingOf(draft, panel.id)
    if (!binding) continue
    for (const field of group.template.fields) {
      if (field.variableKey && !binding.variables.some(variable => variable.key === field.variableKey))
        binding.variables.push(variableFor(field))
    }
  }
}

/** 设置面板的设备，变量按模板字段补齐。空字符串表示解除绑定。写给 Immer 草稿用。 */
function assignDevice(draft: SceneDocumentV2, panel: PanelNodeV2, deviceId: string): void {
  const group = groupOf(draft, panel.parentId ?? '')
  if (!group) return
  const current = bindingOf(draft, panel.id)
  const text = deviceId.trim()
  if (!text) {
    draft.bindings = draft.bindings.filter(binding => binding !== current)
    return
  }
  const owner = dataOwnerOf(draft, panel)
  const variables = [...(current?.variables ?? [])]
  for (const field of group.template.fields) {
    if (field.variableKey && !variables.some(variable => variable.key === field.variableKey))
      variables.push(variableFor(field))
  }
  writeBinding(draft, panel.id, { ...current?.device, id: text, name: current?.device.name || owner.name }, variables)
}

/**
 * 信息面板，结构和预制体一样：标签组是场景树里的父容器，带着模板；面板是它的子节点，放在场景里的一个位置，
 * 只记录和模板不同的地方。改模板，下面所有面板一起变。
 */
export class PanelManager {
  constructor(private readonly session: EditorSession) {}

  private get doc(): SceneDocumentV2 {
    return this.session.doc.value
  }

  children(groupId: string): PanelNodeV2[] {
    return panelsIn(this.doc, groupId)
  }

  // ---------------------------------------------------------------- 标签组和模板

  /** 新建标签组并选中它，右栏就是它的模板配置。 */
  addGroup(): string {
    const id = newId('panels')
    this.session.edit('添加标签', draft => {
      draft.nodes.push({
        id,
        parentId: null,
        name: uniqueName(draft, '标签组'),
        kind: 'panel-group',
        visible: true,
        locked: false,
        transform: identityTransform(),
        template: createPanelTemplate(),
      })
    })
    this.session.select([id])
    return id
  }

  updateTemplate(id: string, patch: Partial<Omit<PanelTemplate, 'fields'>>, coalesceKey?: string): void {
    this.session.edit(
      '修改面板模板',
      draft => {
        const group = groupOf(draft, id)
        if (group) Object.assign(group.template, patch)
      },
      { coalesceKey },
    )
  }

  /** 按设备类型填好字段。 */
  applyDeviceType(id: string, type: DeviceTemplate): void {
    this.session.edit('套用设备类型', draft => {
      const group = groupOf(draft, id)
      if (!group) return
      group.template.fields = type.variables.map(variable => ({
        id: newId('field'),
        label: variable.name,
        variableKey: variable.key,
        dataType: variable.dataType,
        ...(variable.unit ? { unit: variable.unit } : {}),
      }))
      syncVariables(draft, group)
    })
  }

  addField(groupId: string): void {
    this.session.edit('添加面板字段', draft => {
      const group = groupOf(draft, groupId)
      if (!group) return
      const index = group.template.fields.length + 1
      group.template.fields.push({ id: newId('field'), label: `字段 ${index}`, variableKey: `var${index}` })
      syncVariables(draft, group)
    })
  }

  updateField(groupId: string, fieldId: string, patch: Partial<Omit<PanelField, 'id'>>): void {
    this.session.edit('修改面板字段', draft => {
      const group = groupOf(draft, groupId)
      const field = group?.template.fields.find(item => item.id === fieldId)
      if (!group || !field) return
      if (patch.unit === '') delete field.unit
      const { unit, ...rest } = patch
      Object.assign(field, rest, unit ? { unit } : {})
      syncVariables(draft, group)
    })
  }

  removeField(groupId: string, fieldId: string): void {
    this.session.edit('删除面板字段', draft => {
      const group = groupOf(draft, groupId)
      if (!group) return
      group.template.fields = group.template.fields.filter(field => field.id !== fieldId)
      for (const panel of panelsIn(draft, groupId)) {
        if (!panel.panel.hiddenFields) continue
        panel.panel.hiddenFields = panel.panel.hiddenFields.filter(id => id !== fieldId)
        if (!panel.panel.hiddenFields.length) delete panel.panel.hiddenFields
      }
    })
  }

  // ---------------------------------------------------------------- 放置面板

  /** 进入放置状态：之后在视口里单击一次放一个面板，直到按 Esc 或右键。 */
  startPlacing(groupId: string): void {
    this.session.ui.placing = groupId
    this.session.refreshSelectionVisuals()
  }

  stopPlacing(): void {
    this.session.ui.placing = null
    this.session.refreshSelectionVisuals()
  }

  /** 放在光标下的位置。点在模型上就关联这个模型：面板显示它的设备数据。 */
  placeAt(clientX: number, clientY: number): string | null {
    const groupId = this.session.ui.placing
    const surface = this.session.engine.surfaceAt(clientX, clientY)
    if (!groupId || !surface) return null
    const hitId = surface.object ? this.session.sync.nodeIdOf(surface.object) : null
    const hit = hitId ? this.session.node(hitId) : null
    return (
      this.add(groupId, [{ point: surface.point, targetId: hit?.kind === 'model' ? hit.id : undefined }])[0] ?? null
    )
  }

  /** 给这些模型各放一个面板（在模型顶部）；已经有这个标签组的面板的跳过。 */
  addOnModels(groupId: string, modelIds: readonly string[]): void {
    const taken = new Set(this.children(groupId).map(panel => panel.panel.targetNodeId))
    const places = modelIds.flatMap(id => {
      const object = this.session.sync.objectFor(id)
      if (!object || taken.has(id)) return []
      const box = new Box3().setFromObject(object, true)
      const point = box.isEmpty()
        ? object.getWorldPosition(new Vector3())
        : box.getCenter(new Vector3()).setY(box.max.y)
      return [{ point, targetId: id }]
    })
    if (places.length) this.add(groupId, places)
  }

  private add(groupId: string, places: ReadonlyArray<{ point: Vector3; targetId?: string }>): string[] {
    const ids = places.map(() => newId('panel'))
    this.session.edit(places.length > 1 ? `添加 ${places.length} 个面板` : '添加面板', draft => {
      const group = groupOf(draft, groupId)
      if (!group) return
      const inverse = worldMatrixOf(draft, groupId).invert()
      places.forEach(({ point, targetId }, index) => {
        const target = targetId ? nodeById(draft, targetId) : undefined
        const world = new Matrix4().makeTranslation(point.x, point.y, point.z)
        draft.nodes.push({
          id: ids[index]!,
          parentId: groupId,
          name: uniqueName(draft, target ? `${target.name} 面板` : '面板'),
          kind: 'panel',
          visible: true,
          locked: false,
          transform: { ...transformOf(inverse.clone().multiply(world)), scale: [1, 1, 1] },
          panel: target ? { targetNodeId: target.id } : {},
        })
      })
      syncVariables(draft, group)
    })
    return ids
  }

  removePanels(ids: readonly string[]): void {
    this.session.edit('移除面板', draft => void removeNodes(draft, ids))
  }

  // ---------------------------------------------------------------- 单个面板的覆盖

  /** 覆盖面板的标题；空字符串表示跟随模板。 */
  setTitle(id: string, title: string): void {
    this.session.edit('修改面板', draft => {
      const panel = panelOf(draft, id)
      if (!panel) return
      if (title.trim()) panel.panel.title = title.trim()
      else delete panel.panel.title
    })
  }

  toggleField(id: string, fieldId: string): void {
    this.session.edit('修改面板', draft => {
      const panel = panelOf(draft, id)
      if (!panel) return
      const hidden = new Set(panel.panel.hiddenFields ?? [])
      if (hidden.has(fieldId)) hidden.delete(fieldId)
      else hidden.add(fieldId)
      if (hidden.size) panel.panel.hiddenFields = [...hidden]
      else delete panel.panel.hiddenFields
    })
  }

  /** 去掉覆盖，恢复成和模板一样。 */
  resetOverrides(id: string): void {
    this.session.edit('恢复面板', draft => {
      const panel = panelOf(draft, id)
      if (!panel) return
      delete panel.panel.title
      delete panel.panel.hiddenFields
    })
  }

  /** 关联对象：数据改用它的设备。面板自己原来的设备绑定用不上了，一起删掉。 */
  setTarget(id: string, targetId: string | null): void {
    this.session.edit('修改关联对象', draft => {
      const panel = panelOf(draft, id)
      const group = panel ? groupOf(draft, panel.parentId ?? '') : undefined
      if (!panel || !group) return
      const ownKey = twinBindingTargetKey(targetForNode(panel))
      if (targetId) {
        panel.panel.targetNodeId = targetId
        draft.bindings = draft.bindings.filter(binding => twinBindingTargetKey(binding.target) !== ownKey)
      } else delete panel.panel.targetNodeId
      syncVariables(draft, group)
    })
  }

  /** 设置面板的设备编号；变量按模板字段生成。空字符串表示解除绑定。 */
  setDevice(id: string, deviceId: string): void {
    this.session.edit('设置面板设备', draft => {
      const panel = panelOf(draft, id)
      if (panel) assignDevice(draft, panel, deviceId)
    })
  }

  /** 按顺序批量编号：前缀 ESS-、起始 1，得到 ESS-001、ESS-002……一步撤销。 */
  numberDevices(groupId: string, prefix: string, start: number): void {
    this.session.edit('批量设置设备编号', draft => {
      panelsIn(draft, groupId).forEach((panel, index) => {
        assignDevice(draft, panel, `${prefix}${String(start + index).padStart(3, '0')}`)
      })
    })
  }
}
