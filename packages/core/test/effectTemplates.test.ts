import { describe, expect, it } from 'vitest'
import { instantiateTemplate, isEffectTemplate } from '../src/domain/effectTemplates'
import { getBuiltinTemplates } from '../src/domain/effectTemplates/builtins'
import type { TwinBindingTarget } from '../src/domain/twin'
import { clone, patch, REMOVE } from './helpers'

const parameters = { color: '#ff3030', opacity: 0.65, speed: 1, padding: 0.2, text: '告警' }
const template = {
  version: 1,
  id: 'template_1',
  origin: 'local',
  name: '设备告警',
  description: '示例',
  category: '告警',
  effects: [
    { id: 'a1', kind: 'box-glow', parameters, target: { mode: 'current-target' } },
    { id: 'a2', kind: 'outline', parameters, target: { mode: 'root-instance' } },
    { id: 'a3', kind: 'child-highlight', parameters, target: { mode: 'asset-node', assetNodeId: 'legacy:root/0/1' } },
  ],
}

describe('isEffectTemplate', () => {
  it('accepts every built-in template', () => {
    for (const builtin of getBuiltinTemplates()) expect(isEffectTemplate(clone(builtin))).toBe(true)
  })

  it.each([
    ['local template', template],
    ['builtin origin', { ...template, origin: 'builtin' }],
    ['empty description and category', { ...template, description: '', category: '' }],
    [
      'fifty effects',
      { ...template, effects: Array.from({ length: 50 }, (_, i) => ({ ...template.effects[0], id: `e${i}` })) },
    ],
    ['extra template field', { ...template, extra: 1 }],
    ['extra effect field', patch(template, ['effects', 0, 'extra'], 1)],
    ['padded name', { ...template, name: '  名称  ' }],
  ])('accepts %s', (_label, value) => expect(isEffectTemplate(value)).toBe(true))

  it.each([
    ['version 2', ['version'], 2],
    ['empty id', ['id'], ''],
    ['unknown origin', ['origin'], 'remote'],
    ['blank name', ['name'], '   '],
    ['name over 80', ['name'], 'x'.repeat(81)],
    ['description over 500', ['description'], 'x'.repeat(501)],
    ['category over 40', ['category'], 'x'.repeat(41)],
    ['missing description', ['description'], REMOVE],
    ['no effects', ['effects'], []],
    ['duplicate effect id', ['effects', 1, 'id'], 'a1'],
    ['empty effect id', ['effects', 0, 'id'], ''],
    ['unknown effect kind', ['effects', 0, 'kind'], 'sparkles'],
    ['invalid effect parameters', ['effects', 0, 'parameters', 'color'], 'red'],
    ['unknown target mode', ['effects', 0, 'target'], { mode: 'somewhere' }],
    ['concrete identity in relative target', ['effects', 0, 'target'], { mode: 'current-target', instanceId: 'i1' }],
    ['root target with extra key', ['effects', 1, 'target'], { mode: 'root-instance', nodeId: 'n1' }],
    ['node target without node', ['effects', 2, 'target'], { mode: 'asset-node' }],
    ['node target blank node', ['effects', 2, 'target'], { mode: 'asset-node', assetNodeId: '  ' }],
    ['node target with extra key', ['effects', 2, 'target'], { mode: 'asset-node', assetNodeId: 'a', instanceId: 'i' }],
  ])('rejects %s', (_label, path, value) => expect(isEffectTemplate(patch(template, path, value))).toBe(false))

  it('rejects more than fifty effects', () => {
    const effects = Array.from({ length: 51 }, (_, i) => ({ ...template.effects[0], id: `e${i}` }))
    expect(isEffectTemplate({ ...template, effects })).toBe(false)
  })
})

describe('instantiateTemplate', () => {
  const instance: TwinBindingTarget = { type: 'asset-instance', instanceId: 'i1' }
  const exists = () => true

  it('expands relative targets against the current object', () => {
    const effects = instantiateTemplate(clone(template) as never, instance, exists)
    expect(effects.map(e => e.target)).toEqual([
      { type: 'asset-instance', instanceId: 'i1' },
      { type: 'asset-instance', instanceId: 'i1' },
      { type: 'asset-node', instanceId: 'i1', assetNodeId: 'legacy:root/0/1' },
    ])
    expect(effects.every(e => e.sourceTemplateId === 'template_1')).toBe(true)
    expect(new Set(effects.map(e => e.id)).size).toBe(3)
  })

  it('rejects model-relative targets on primitives', () => {
    expect(() => instantiateTemplate(clone(template) as never, { type: 'primitive', nodeId: 'n1' }, exists)).toThrow(
      '此模板需要模型实例',
    )
  })

  it('rejects missing targets and duplicate channels', () => {
    expect(() => instantiateTemplate(clone(template) as never, instance, () => false)).toThrow('模板目标不存在')
    const duplicate = patch(template, ['effects', 1, 'kind'], 'box-glow')
    expect(() => instantiateTemplate(duplicate as never, instance, exists)).toThrow('重复类型特效')
  })

  it('rejects invalid templates', () => {
    expect(() => instantiateTemplate({ ...template, name: '' } as never, instance, exists)).toThrow('模板配置无效')
  })
})
