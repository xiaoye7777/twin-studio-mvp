import { describe, expect, it } from 'vitest'
import { getBuiltinTemplates } from '../src/domain/effectTemplates/builtins'
import { evaluateCondition, isVisualRule, type RuleCondition } from '../src/domain/visualRules'
import { clone, patch, REMOVE } from './helpers'

const rule = {
  id: 'ess-1-hot',
  bindingId: 'binding-ess-1',
  target: { type: 'asset-instance', instanceId: 'instance_ess-1' },
  variableKey: 'temperature',
  condition: { dataType: 'number', operator: '>', value: 60 },
  enabled: true,
  priority: 10,
  template: clone(getBuiltinTemplates()[1]),
}

describe('isVisualRule', () => {
  it.each([
    ['numeric rule', rule],
    ['missing template snapshot (null)', { ...rule, template: null }],
    ['boolean condition', { ...rule, condition: { dataType: 'boolean', operator: '==', value: true } }],
    ['string condition', { ...rule, condition: { dataType: 'string', operator: '!=', value: 'running' } }],
    ['priority bounds', { ...rule, priority: 0 }],
    ['priority 100', { ...rule, priority: 100 }],
    ['extra field', { ...rule, extra: 1 }],
  ])('accepts %s', (_label, value) => expect(isVisualRule(value)).toBe(true))

  it.each([
    ['empty id', ['id'], ''],
    ['empty binding', ['bindingId'], ''],
    ['bad target', ['target'], { type: 'primitive' }],
    ['empty variable', ['variableKey'], ''],
    ['non-boolean enabled', ['enabled'], 1],
    ['fractional priority', ['priority'], 1.5],
    ['priority above 100', ['priority'], 101],
    ['negative priority', ['priority'], -1],
    ['missing template', ['template'], REMOVE],
    ['invalid template', ['template', 'name'], ''],
    ['missing condition', ['condition'], REMOVE],
    ['unknown data type', ['condition', 'dataType'], 'date'],
    ['operator not allowed for boolean', ['condition'], { dataType: 'boolean', operator: '>', value: true }],
    ['operator not allowed for string', ['condition'], { dataType: 'string', operator: '<', value: 'a' }],
    ['unknown operator', ['condition', 'operator'], '=>'],
    ['value type mismatch', ['condition', 'value'], '60'],
    ['boolean value for string', ['condition'], { dataType: 'string', operator: '==', value: true }],
  ])('rejects %s', (_label, path, value) => expect(isVisualRule(patch(rule, path, value))).toBe(false))
})

describe('evaluateCondition', () => {
  const number = (operator: RuleCondition['operator'], value: number) =>
    ({ dataType: 'number', operator, value }) as RuleCondition

  it.each([
    ['>', 2, 1, true],
    ['>', 1, 1, false],
    ['>=', 1, 1, true],
    ['<', 1, 2, true],
    ['<=', 2, 2, true],
    ['==', 1, 1, true],
    ['!=', 1, 2, true],
    ['!=', 1, 1, false],
  ] as const)('%s: %d vs %d → %s', (operator, actual, threshold, expected) =>
    expect(evaluateCondition(number(operator, threshold), actual)).toBe(expected),
  )

  it('never coerces types', () => {
    expect(evaluateCondition(number('!=', 1), '2')).toBe(false)
    expect(evaluateCondition(number('!=', 1), Number.NaN)).toBe(false)
    expect(evaluateCondition({ dataType: 'boolean', operator: '==', value: true }, 1)).toBe(false)
    expect(evaluateCondition({ dataType: 'string', operator: '==', value: '1' }, 1)).toBe(false)
  })

  it('compares booleans and strings', () => {
    expect(evaluateCondition({ dataType: 'boolean', operator: '==', value: true }, true)).toBe(true)
    expect(evaluateCondition({ dataType: 'string', operator: '!=', value: 'running' }, 'alarm')).toBe(true)
  })
})
