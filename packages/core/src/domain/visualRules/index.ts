import { z } from 'zod'
import { cloneTemplate, EffectTemplateSchema } from '../effectTemplates'
import { nonEmptyString } from '../schemaHelpers'
import { TwinBindingTargetSchema, type TwinRuntimeValueData } from '../twin'

export const RuleOperatorSchema = z.enum(['>', '>=', '<', '<=', '==', '!='])
const EqualityOperatorSchema = z.enum(['==', '!='])

/** The operator set depends on the variable type: ordering only makes sense for numbers. */
export const RuleConditionSchema = z.discriminatedUnion('dataType', [
  z.object({ dataType: z.literal('number'), operator: RuleOperatorSchema, value: z.number() }),
  z.object({ dataType: z.literal('boolean'), operator: EqualityOperatorSchema, value: z.boolean() }),
  z.object({ dataType: z.literal('string'), operator: EqualityOperatorSchema, value: z.string() }),
])

export const VisualRuleSchema = z.object({
  id: nonEmptyString,
  bindingId: nonEmptyString,
  target: TwinBindingTargetSchema,
  variableKey: nonEmptyString,
  condition: RuleConditionSchema,
  enabled: z.boolean(),
  priority: z.int().min(0).max(100),
  /** Saved recipe: source repository is not required at runtime. null = unresolved. */
  template: EffectTemplateSchema.nullable(),
})

export type RuleOperator = z.infer<typeof RuleOperatorSchema>
export type RuleCondition = z.infer<typeof RuleConditionSchema>
export type VisualRule = z.infer<typeof VisualRuleSchema>

export function ruleOperators(type: RuleCondition['dataType']): RuleOperator[] {
  return type === 'number' ? ['>', '>=', '<', '<=', '==', '!='] : ['==', '!=']
}
export function isVisualRule(value: unknown): value is VisualRule {
  return VisualRuleSchema.safeParse(value).success
}
export function cloneRules(rules: readonly VisualRule[]): VisualRule[] {
  return rules.map(r => ({
    ...r,
    target: { ...r.target },
    condition: { ...r.condition },
    template: r.template ? cloneTemplate(r.template) : null,
  }))
}
/** No coercion, eval, or expressions. Invalid runtime values never satisfy != either. */
export function evaluateCondition(condition: RuleCondition, value: TwinRuntimeValueData): boolean {
  if (typeof value !== condition.dataType || (typeof value === 'number' && !Number.isFinite(value))) return false
  if (condition.operator === '==') return value === condition.value
  if (condition.operator === '!=') return value !== condition.value
  if (condition.dataType !== 'number' || typeof value !== 'number') return false
  switch (condition.operator) {
    case '>':
      return value > condition.value
    case '>=':
      return value >= condition.value
    case '<':
      return value < condition.value
    case '<=':
      return value <= condition.value
  }
}
