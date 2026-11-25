import {
  createEffect,
  targetForNode,
  type EffectInstance,
  type EffectKind,
  getBuiltinTemplates,
  newId,
  plain,
  targetNodeId,
  type VisualRule,
} from '@twin-studio/core'
import type { EditorSession } from '../EditorSession'

/** 管理场景节点的特效与设备告警规则。 */
export class NodeEffects {
  constructor(private readonly session: EditorSession) {}

  effectsFor(nodeId: string): EffectInstance[] {
    return (this.session.doc.value.effects ?? []).filter(effect => targetNodeId(effect.target) === nodeId)
  }

  addEffect(nodeId: string, kind: EffectKind): void {
    const node = this.session.node(nodeId)
    if (!node) return
    const effect = createEffect(kind, targetForNode(node))
    this.session.edit('添加特效', draft => void (draft.effects ??= []).push(effect))
  }

  updateEffect(id: string, recipe: (effect: EffectInstance) => void, coalesceKey?: string): void {
    this.session.edit(
      '修改特效',
      draft => {
        const effect = draft.effects?.find(item => item.id === id)
        if (effect) recipe(effect)
      },
      { coalesceKey },
    )
  }

  removeEffect(id: string): void {
    this.session.edit('删除特效', draft => void (draft.effects = draft.effects?.filter(item => item.id !== id)))
  }

  rulesFor(nodeId: string): VisualRule[] {
    return (this.session.doc.value.visualRules ?? []).filter(rule => targetNodeId(rule.target) === nodeId)
  }

  addRule(nodeId: string): boolean {
    const binding = this.session.devices.bindingFor(nodeId)
    if (!binding) return false
    const variable = binding.variables.find(item => item.dataType === 'number') ?? binding.variables[0]
    if (!variable) return false
    const templates = getBuiltinTemplates()
    const template = plain(templates.find(item => item.name.includes('告警')) ?? templates[0] ?? null)
    const condition: VisualRule['condition'] =
      variable.dataType === 'number'
        ? { dataType: 'number', operator: '>', value: 60 }
        : variable.dataType === 'boolean'
          ? { dataType: 'boolean', operator: '==', value: true }
          : { dataType: 'string', operator: '==', value: 'alarm' }
    const rule: VisualRule = {
      id: newId('rule'),
      bindingId: binding.id,
      target: binding.target,
      variableKey: variable.key,
      condition,
      enabled: true,
      priority: 10,
      template,
    }
    this.session.edit('添加告警规则', draft => void (draft.visualRules ??= []).push(rule))
    return true
  }

  updateRule(id: string, recipe: (rule: VisualRule) => void): void {
    this.session.edit('修改告警规则', draft => {
      const rule = draft.visualRules?.find(item => item.id === id)
      if (rule) recipe(rule)
    })
  }

  removeRule(id: string): void {
    this.session.edit(
      '删除告警规则',
      draft => void (draft.visualRules = draft.visualRules?.filter(item => item.id !== id)),
    )
  }
}
